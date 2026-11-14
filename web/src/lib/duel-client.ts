import type { BotLevel, DeviceAnswers, DuelAnswer, DuelMatchView, DuelModeId, DuelOnDevice, DuelPregameView, DuelServerMessage, DuelState, PregameAction } from "@ygo/shared";
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
    /** `pregame`: a game of a match about to start (rock-paper-scissors, who goes first, side decking). */
    status: "waiting" | "pregame" | "active" | "finished" | "declined" | "cancelled";
    /** A game of a match (best of 3, or a single game): which one, of how many, the games won by each of `players`, and once it's over who won it (null: drawn or called off). */
    match?: { game: number; games: number; wins: number[]; over: boolean; winner?: number | null };
    /** The match's next game, once this one is over. */
    next?: string;
    setName: string;
    mode: DuelModeId;
    challenger: string;
    challengerId: string | null;
    /** A bot from the anime says who it is (`duelist`), in the deck of `era`. */
    players: { name: string; bot: boolean; duelist?: string; era?: string }[];
    winner: 0 | 1 | null;
}

/** Practice: `bot` plays against you; `solo` only passes its turns, to try your deck out. */
export type PracticeOpponent = "bot" | "solo";

/**
 * Who the bot is: the practice bot at a level (it plays your deck), or a duelist from the anime
 * (their deck, at their own level), in one of their eras.
 */
export type BotChoice = { level: BotLevel } | { duelist: { id: string; era?: string } };
/** A match against the bot: best of 3, or a single game. */
export type MatchGames = 1 | 3;
const botBody = (against: string, bot?: BotChoice, games?: MatchGames) => (against === "bot" ? { ...bot, ...(games ? { games } : {}) } : {});

export const startDuel = async (seriesId: string, deckId: string, against: PracticeOpponent | "rival", bot?: BotChoice, games?: MatchGames) =>
    (await apiRequest<{ duel: DuelSummary }>("POST", `/api/series/${seriesId}/duels`, { deckId, against, ...botBody(against, bot, games) })).duel;

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
/** A guest's match is opened by one token for all its games: the next game's duel is opened with this one's. */
export function carryGuestToken(from: string, to: string) {
    const tokens = readTokens();
    if (!tokens[from] || tokens[to]) return;
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...tokens, [to]: { token: tokens[from].token, at: Date.now() } }));
}
const tokenHeader = (duelId: string): Record<string, string> | undefined => {
    const token = guestDuelToken(duelId);
    return token ? { "x-duel-token": token } : undefined;
};

/** A guest's practice duel with a deck from this browser, at a set of the timeline. */
export async function startGuestDuel(deck: { main: number[]; extra: number[]; side?: number[] }, setName: string, against: PracticeOpponent, bot?: BotChoice, games?: MatchGames) {
    const { duel, token } = await apiRequest<{ duel: DuelSummary; token: string }>("POST", "/api/duels/practice", { deck, setName, against, ...botBody(against, bot, games) });
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...readTokens(), [duel.id]: { token, at: Date.now() } }));
    return duel;
}

/** Practice matches won, lost and drawn against each bot: by a duelist's id, or `bot` for the practice bot. */
export type BotRecord = Record<string, { won: number; lost: number; drawn: number }>;
export const practiceRecord = async () => (await apiRequest<{ record: BotRecord }>("GET", "/api/duels/practice/record")).record;

const GUEST_RECORD_KEY = "ygo-bot-record";
/**
 * A guest's record against the bots, kept in this browser: their last practice match (followed to
 * its last game) is counted once it's over, the first time it's looked at here.
 */
export async function guestPracticeRecord(): Promise<BotRecord> {
    let kept: { record: BotRecord; counted: string[] } = { record: {}, counted: [] };
    try {
        kept = { ...kept, ...(JSON.parse(localStorage.getItem(GUEST_RECORD_KEY) ?? "{}") as Partial<typeof kept>) };
    } catch {
        // (Unreadable: start over.)
    }
    const last = lastGuestDuel();
    let duel = last ? (await getDuel(last).catch(() => null))?.duel : null;
    while (duel?.status === "finished" && duel.next) {
        carryGuestToken(duel.id, duel.next);
        duel = (await getDuel(duel.next).catch(() => null))?.duel;
    }
    const m = duel?.match;
    if (duel && m?.over && m.winner !== undefined && !kept.counted.includes(duel.id)) {
        const key = duel.players.find((p) => p.bot)?.duelist ?? "bot";
        const r = (kept.record[key] ??= { won: 0, lost: 0, drawn: 0 });
        if (m.winner === null) r.drawn++;
        else if (duel.players[m.winner]?.bot) r.lost++;
        else r.won++;
        kept.counted = [...kept.counted, duel.id].slice(-50);
        localStorage.setItem(GUEST_RECORD_KEY, JSON.stringify(kept));
    }
    return kept.record;
}

export const openDuels = async (seriesId: string) => (await apiRequest<{ duels: DuelSummary[] }>("GET", `/api/series/${seriesId}/duels/open`)).duels;

/** `broken`: the server couldn't rebuild the duel, and why. `device`: a game played on this device (against the bot). */
export const getDuel = (duelId: string) =>
    apiRequest<{ duel: DuelSummary; state: DuelState | null; broken?: string; pregame?: DuelPregameView; match?: DuelMatchView; device?: DuelOnDevice }>("GET", `/api/duels/${duelId}`, undefined, tokenHeader(duelId));

/** The answers of a game played on this device, for the server to keep; with its result at the end. */
export const recordDeviceAnswers = (duelId: string, body: DeviceAnswers) =>
    apiRequest<{ duel: DuelSummary; match?: DuelMatchView }>("POST", `/api/duels/${duelId}/answers`, body, tokenHeader(duelId));

/** A step before a game of a match: a hand thrown, who goes first, or the side-decked deck. */
export const pregameAct = (duelId: string, action: PregameAction) =>
    apiRequest<{ duel: DuelSummary; pregame?: DuelPregameView }>("POST", `/api/duels/${duelId}/pregame`, action, tokenHeader(duelId));

export const acceptDuel = async (duelId: string, deckId: string) => (await apiRequest<{ duel: DuelSummary }>("POST", `/api/duels/${duelId}/accept`, { deckId })).duel;

export const declineDuel = (duelId: string) => apiRequest("POST", `/api/duels/${duelId}/decline`);

/** The duel as the server stores it (setup and answers), for a bug report. */
export const getDuelRecord = (duelId: string) => apiRequest<unknown>("GET", `/api/duels/${duelId}/record`, undefined, tokenHeader(duelId));

/** Gives up the game being played; `wholeMatch` gives the match up with it. (Before a game starts, it's always the match.) */
export const concedeDuel = (duelId: string, wholeMatch = false) => apiRequest("POST", `/api/duels/${duelId}/concede${wholeMatch ? "?match=1" : ""}`, undefined, tokenHeader(duelId));

export const duelPath = (duelId: string) => `/duel/?id=${duelId}`;

export interface DuelConnection {
    answer(seq: number, answer: DuelAnswer): void;
    concede(): void;
    /** Ask to call the duel off (or agree to the rival's asking); false withdraws or refuses. */
    callOff(agree: boolean): void;
    /** Take back the move being set up (when the question offers it). */
    back(seq: number): void;
    close(): void;
}

/**
 * A live socket to the duel: every message the server sends goes to `onMessage`. Reconnects with
 * growing pauses, saying where the page was (`after`) so it's shown what it missed.
 */
export function connectDuel(duelId: string, onMessage: (m: DuelServerMessage) => void, onStatus?: (connected: boolean) => void, after?: () => string | null): DuelConnection {
    const base = API_BASE || window.location.origin;
    const token = guestDuelToken(duelId);
    const url = `${base.replace(/^http/, "ws")}/api/duels/${duelId}/live${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let stopped = false;

    const connect = () => {
        const cursor = after?.();
        socket = new WebSocket(cursor ? `${url}${url.includes("?") ? "&" : "?"}after=${encodeURIComponent(cursor)}` : url);
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
        callOff: (agree) => send({ type: "call-off", agree }),
        back: (seq) => send({ type: "back", seq }),
        close() {
            stopped = true;
            clearTimeout(retry);
            socket?.close();
        },
    };
}
