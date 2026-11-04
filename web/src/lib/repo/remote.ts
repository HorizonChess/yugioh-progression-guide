import { API_BASE } from "@/lib/auth-client";
import type { RewardEntry, WheelPrize } from "@/lib/rewards";
import type { SavedDeck } from "@/lib/storage";
import { RepoError, type GameRepository, type Opening, type PlayerView, type SeriesView } from "./types";

interface ServerSeries {
    id: string;
    name: string;
    mode: SeriesView["mode"];
    rules: SeriesView["rules"];
    currentSetIndex: number;
    currentSetName: string | null;
    finished: boolean;
    bannedCardIds: number[];
    matchHistory: { setName: string; winnerId: string | null; at: string }[];
    updatedAt: string;
}

interface ServerPlayer extends Omit<PlayerView, "savedDecks"> {
    savedDecks: (Omit<SavedDeck, "createdAt"> & { createdAt: string })[];
}

async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}/api/series${path}`, {
            method,
            credentials: "include",
            ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
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

const toOpening = (s: Opening): Opening => ({ id: s.id, source: s.source, setName: s.setName, packs: s.packs, flipped: s.flipped });

export class RemoteRepo implements GameRepository {
    readonly kind = "remote";
    readonly freePacks = false;
    private readonly activeKey: string;

    constructor(private readonly userId: string) {
        this.activeKey = `activeSeriesId:${userId}`;
    }

    private series(s: ServerSeries): SeriesView {
        return {
            ...s,
            lastPlayed: Date.parse(s.updatedAt),
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

    async createSeries(input: { name: string; startSetIndex: number; packsPerSet: number }) {
        const { series } = await api<{ series: ServerSeries }>("POST", "", { ...input, mode: "solo" });
        return series.id;
    }

    deleteSeries = (id: string) => api("DELETE", `/${id}`);

    async loadSeries(id: string) {
        const { series, me } = await api<{ series: ServerSeries; me: ServerPlayer }>("GET", `/${id}`);
        return {
            series: this.series(series),
            me: { ...me, savedDecks: me.savedDecks.map((d) => ({ ...d, createdAt: Date.parse(d.createdAt) })) },
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

    async openPacks(id: string) {
        return toOpening((await api<{ session: Opening }>("POST", `/${id}/packs/open`)).session);
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
        const { reward } = await api<{ reward: RewardEntry }>("POST", `/${id}/matches`, { result: won ? "win" : "loss" });
        return { status: "applied" as const, reward };
    }

    async spin(id: string, rewardId: string) {
        return (await api<{ prize: WheelPrize }>("POST", `/${id}/rewards/${rewardId}/spin`)).prize;
    }

    async claimReward(id: string, rewardId: string, cardId?: number) {
        const { session } = await api<{ session: Opening | null }>("POST", `/${id}/rewards/${rewardId}/claim`, cardId === undefined ? {} : { cardId });
        return session && toOpening(session);
    }

    saveDeck = (id: string, { id: deckId, name, mainDeck, extraDeck, sideDeck }: SavedDeck) =>
        api("PUT", `/${id}/decks/${deckId}`, { name, mainDeck, extraDeck, sideDeck });
    deleteDeck = (id: string, deckId: string) => api("DELETE", `/${id}/decks/${deckId}`);
    importCollection = (id: string, cardIds: number[], mode: "add" | "replace") =>
        api("POST", `/${id}/collection/import`, { cardIds, mode });
}
