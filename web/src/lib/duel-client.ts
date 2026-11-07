import type { DuelAnswer, DuelModeId, DuelServerMessage, DuelState } from "@ygo/shared";
import { API_BASE } from "@/lib/auth-client";
import { apiRequest } from "@/lib/repo/remote";

/*
 * Duels run on the server's rules engine. These start, accept and look up duels; `connectDuel`
 * keeps a live socket to one, reconnecting when the phone drops it. A guest's practice duel is
 * opened with a token the server hands out once: this browser keeps it for a day.
 */

export interface DuelSummary {
    id: string;
    /** Null for a guest's practice duel. */
    seriesId: string | null;
    guest?: boolean;
    kind: "practice" | "rival";
    status: "waiting" | "active" | "finished" | "declined";
    setName: string;
    mode: DuelModeId;
    challenger: string;
    challengerId: string | null;
    players: { name: string; bot: boolean }[];
    winner: 0 | 1 | null;
}

/** Practice: `bot` plays against you; `solo` only passes its turns, to try your deck out. */
export type PracticeOpponent = "bot" | "solo";

export const startDuel = async (seriesId: string, deckId: string, against: PracticeOpponent | "rival") =>
    (await apiRequest<{ duel: DuelSummary }>("POST", `/api/series/${seriesId}/duels`, { deckId, against })).duel;

const TOKENS_KEY = "guestDuelTokens";
const TOKEN_MS = 24 * 60 * 60_000;
type Tokens = Record<string, { token: string; at: number }>;
function readTokens(): Tokens {
    try {
        const all = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}") as Tokens;
        return Object.fromEntries(Object.entries(all).filter(([, t]) => Date.now() - t.at < TOKEN_MS));
    } catch {
        return {};
    }
}
/** The token that opens this guest duel, if this browser started it. */
export const guestDuelToken = (duelId: string): string | undefined => (typeof window === "undefined" ? undefined : readTokens()[duelId]?.token);
/** The guest duel this browser started last (it may be over). */
export const lastGuestDuel = (): string | undefined => Object.entries(readTokens()).sort((a, b) => b[1].at - a[1].at)[0]?.[0];
const tokenHeader = (duelId: string): Record<string, string> | undefined => {
    const token = guestDuelToken(duelId);
    return token ? { "x-duel-token": token } : undefined;
};

/** A guest's practice duel with a deck from this browser, at a set of the timeline. */
export async function startGuestDuel(deck: { main: number[]; extra: number[] }, setName: string, against: PracticeOpponent) {
    const { duel, token } = await apiRequest<{ duel: DuelSummary; token: string }>("POST", "/api/duels/practice", { deck, setName, against });
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...readTokens(), [duel.id]: { token, at: Date.now() } }));
    return duel;
}

export const openDuels = async (seriesId: string) => (await apiRequest<{ duels: DuelSummary[] }>("GET", `/api/series/${seriesId}/duels/open`)).duels;

export const getDuel = (duelId: string) => apiRequest<{ duel: DuelSummary; state: DuelState | null }>("GET", `/api/duels/${duelId}`, undefined, tokenHeader(duelId));

export const acceptDuel = async (duelId: string, deckId: string) => (await apiRequest<{ duel: DuelSummary }>("POST", `/api/duels/${duelId}/accept`, { deckId })).duel;

export const declineDuel = (duelId: string) => apiRequest("POST", `/api/duels/${duelId}/decline`);

export const concedeDuel = (duelId: string) => apiRequest("POST", `/api/duels/${duelId}/concede`, undefined, tokenHeader(duelId));

export const duelPath = (duelId: string) => `/duel/?id=${duelId}`;

export interface DuelConnection {
    answer(seq: number, answer: DuelAnswer): void;
    concede(): void;
    /** Take back the move being set up (when the question offers it). */
    back(seq: number): void;
    close(): void;
}

/** A live socket to the duel: every message the server sends goes to `onMessage`. Reconnects with growing pauses. */
export function connectDuel(duelId: string, onMessage: (m: DuelServerMessage) => void, onStatus?: (connected: boolean) => void): DuelConnection {
    const base = API_BASE || window.location.origin;
    const token = guestDuelToken(duelId);
    const url = `${base.replace(/^http/, "ws")}/api/duels/${duelId}/live${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let stopped = false;

    const connect = () => {
        socket = new WebSocket(url);
        socket.onopen = () => {
            delay = 1000;
            onStatus?.(true);
        };
        socket.onmessage = (event) => {
            try {
                onMessage(JSON.parse(String(event.data)) as DuelServerMessage);
            } catch {
                // Not a duel message; ignore it.
            }
        };
        socket.onclose = (event) => {
            onStatus?.(false);
            // 4404: the duel is over or isn't yours; don't keep knocking.
            if (stopped || event.code === 4404) return;
            retry = setTimeout(connect, delay);
            delay = Math.min(delay * 2, 15_000);
        };
    };
    connect();
    const send = (data: object) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
    };
    return {
        answer: (seq, answer) => send({ type: "answer", seq, answer }),
        concede: () => send({ type: "concede" }),
        back: (seq) => send({ type: "back", seq }),
        close() {
            stopped = true;
            clearTimeout(retry);
            socket?.close();
        },
    };
}
