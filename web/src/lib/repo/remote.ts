import { transformCardImages } from "@/lib/api";
import { API_BASE } from "@/lib/auth-client";
import type { Collection } from "@/lib/collection";
import type { RewardEntry, RivalReward, WheelPrize } from "@/lib/rewards";
import type { SavedDeck } from "@/lib/storage";
import { RepoError, type CreateSeriesInput, type GameRepository, type Opening, type OpenOptions, type PlayerView, type SeriesView } from "./types";

interface ServerSeries extends Omit<SeriesView, "lastPlayed" | "matchHistory" | "pendingReport" | "openingsSaved"> {
    matchHistory: { setName: string; winnerId: string | null; at: string }[];
    updatedAt: string;
    /** Only on a single series. */
    pendingReport?: SeriesView["pendingReport"];
    openingsSaved?: string[];
}

interface ServerPlayer extends Omit<PlayerView, "savedDecks"> {
    savedDecks: (Omit<SavedDeck, "createdAt"> & { createdAt: string })[];
}

/** Calls the API with the session cookie; a refusal becomes a RepoError with the server's message. */
export async function apiRequest<T = void>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            credentials: "include",
            headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    } catch {
        throw new RepoError("Can't reach the server. Check your connection and try again.");
    }
    const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
        const error = (data as { error?: unknown } | null)?.error;
        throw new RepoError(typeof error === "string" ? error : `Request failed (${response.status})`);
    }
    return data as T;
}

const api = <T = void>(method: string, path: string, body?: unknown) => apiRequest<T>(method, `/api/series${path}`, body);

// The server's cards keep the card database's image URLs; point them at our image host, as fetched cards are.
const toOpening = (s: Opening): Opening => ({ id: s.id, source: s.source, setName: s.setName, packs: s.packs.map((p) => p.map(transformCardImages)), flipped: s.flipped });

export class RemoteRepo implements GameRepository {
    readonly kind = "remote";
    readonly freePacks = false;
    private readonly activeKey: string;

    constructor(private readonly userId: string) {
        this.activeKey = `activeSeriesId:${userId}`;
    }

    private series({ updatedAt, pendingReport, openingsSaved, ...s }: ServerSeries): SeriesView {
        return {
            ...s,
            lastPlayed: Date.parse(updatedAt),
            pendingReport: pendingReport ?? null,
            openingsSaved: openingsSaved ?? [],
            matchHistory: s.matchHistory.map((m) => ({
                winner: m.winnerId === this.userId ? "player" : "opponent",
                packName: m.setName,
                date: m.at,
            })),
        };
    }

    async listSeries() {
        const { series } = await api<{ series: ServerSeries[] }>("GET", "");
        return series.map((s) => this.series(s));
    }

    async createSeries({ mode = "solo", ...input }: CreateSeriesInput) {
        const { series } = await api<{ series: ServerSeries }>("POST", "", { ...input, mode });
        return series.id;
    }

    deleteSeries = (id: string) => api("DELETE", `/${id}`);

    async loadSeries(id: string) {
        const { series, me } = await api<{ series: ServerSeries; me: ServerPlayer }>("GET", `/${id}`);
        return {
            series: this.series(series),
            me: { ...me, marks: me.marks ?? [], savedDecks: me.savedDecks.map((d) => ({ ...d, createdAt: Date.parse(d.createdAt) })) },
        };
    }

    activeSeriesId() {
        try {
            return localStorage.getItem(this.activeKey);
        } catch {
            return null;
        }
    }

    setActiveSeriesId(id: string | null) {
        try {
            if (id) localStorage.setItem(this.activeKey, id);
            else localStorage.removeItem(this.activeKey);
        } catch {
            // Private mode: the pick just isn't remembered.
        }
    }

    /** The server opens the current set; other sets only for admins. */
    async openPacks(id: string, { setIndex }: OpenOptions = {}) {
        return toOpening((await api<{ session: Opening }>("POST", `/${id}/packs/open`, setIndex === undefined ? {} : { setIndex })).session);
    }

    async activeOpening(id: string, kind: "set" | "reward") {
        const { session } = await api<{ session: Opening | null }>("GET", `/${id}/packs/active?kind=${kind}`);
        return session && toOpening(session);
    }

    flip = (id: string, openingId: string, flipped: number[]) => api("PATCH", `/${id}/packs/${openingId}/flips`, { flipped });
    saveOpening = (id: string, openingId: string) => api("POST", `/${id}/packs/${openingId}/save`);

    async reroll(id: string, openingId: string) {
        return toOpening((await api<{ session: Opening }>("POST", `/${id}/packs/${openingId}/reroll`)).session);
    }

    async reportMatch(id: string, won: boolean) {
        const { reward } = await api<{ reward?: RewardEntry }>("POST", `/${id}/matches`, { result: won ? "win" : "loss" });
        return reward ? { status: "applied" as const, reward } : { status: "pending" as const };
    }

    async confirmReport(id: string, reportId: string) {
        return (await api<{ reward: RewardEntry }>("POST", `/${id}/matches/${reportId}/confirm`)).reward;
    }

    rejectReport = (id: string, reportId: string) => api("POST", `/${id}/matches/${reportId}/reject`);

    async spin(id: string, rewardId: string) {
        return (await api<{ prize: WheelPrize }>("POST", `/${id}/rewards/${rewardId}/spin`)).prize;
    }

    async claimReward(id: string, rewardId: string, cardId?: number, printing?: string) {
        const { session } = await api<{ session: Opening | null }>("POST", `/${id}/rewards/${rewardId}/claim`, { cardId, printing });
        return session && toOpening(session);
    }

    async rivalBinder(id: string) {
        return (await api<{ collection: Collection }>("GET", `/${id}/rival-binder`)).collection;
    }

    async rivalRewards(id: string) {
        return (await api<{ rewards: RivalReward[] }>("GET", `/${id}/rival-rewards`)).rewards;
    }

    saveDeck = (id: string, { id: deckId, name, mainDeck, extraDeck, sideDeck }: SavedDeck) =>
        api("PUT", `/${id}/decks/${deckId}`, { name, mainDeck, extraDeck, sideDeck });
    deleteDeck = (id: string, deckId: string) => api("DELETE", `/${id}/decks/${deckId}`);
    importCollection = (id: string, cardIds: number[], mode: "add" | "replace") =>
        api("POST", `/${id}/collection/import`, { cardIds, mode });
    setMark = (id: string, cardId: number, on: boolean) => api(on ? "PUT" : "DELETE", `/${id}/marks/${cardId}`);
}
