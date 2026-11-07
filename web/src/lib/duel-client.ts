import type { DuelAnswer, DuelModeId, DuelServerMessage, DuelState } from "@ygo/shared";
import { API_BASE } from "@/lib/auth-client";
import { apiRequest } from "@/lib/repo/remote";

/*
 * Duels run on the server's rules engine. These start, accept and look up duels; `connectDuel`
 * keeps a live socket to one, reconnecting when the phone drops it.
 */

export interface DuelSummary {
    id: string;
    seriesId: string;
    kind: "practice" | "rival";
    status: "waiting" | "active" | "finished" | "declined";
    setName: string;
    mode: DuelModeId;
    challenger: string;
    challengerId: string;
    players: { name: string; bot: boolean }[];
    winner: 0 | 1 | null;
}

export const startDuel = async (seriesId: string, deckId: string, against: "bot" | "rival") =>
    (await apiRequest<{ duel: DuelSummary }>("POST", `/api/series/${seriesId}/duels`, { deckId, against })).duel;

export const openDuels = async (seriesId: string) => (await apiRequest<{ duels: DuelSummary[] }>("GET", `/api/series/${seriesId}/duels/open`)).duels;

export const getDuel = (duelId: string) => apiRequest<{ duel: DuelSummary; state: DuelState | null }>("GET", `/api/duels/${duelId}`);

export const acceptDuel = async (duelId: string, deckId: string) => (await apiRequest<{ duel: DuelSummary }>("POST", `/api/duels/${duelId}/accept`, { deckId })).duel;

export const declineDuel = (duelId: string) => apiRequest("POST", `/api/duels/${duelId}/decline`);

export const concedeDuel = (duelId: string) => apiRequest("POST", `/api/duels/${duelId}/concede`);

export const duelPath = (duelId: string) => `/duel/?id=${duelId}`;

export interface DuelConnection {
    answer(seq: number, answer: DuelAnswer): void;
    concede(): void;
    close(): void;
}

/** A live socket to the duel: every message the server sends goes to `onMessage`. Reconnects with growing pauses. */
export function connectDuel(duelId: string, onMessage: (m: DuelServerMessage) => void, onStatus?: (connected: boolean) => void): DuelConnection {
    const base = API_BASE || window.location.origin;
    const url = `${base.replace(/^http/, "ws")}/api/duels/${duelId}/live`;
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
        close() {
            stopped = true;
            clearTimeout(retry);
            socket?.close();
        },
    };
}
