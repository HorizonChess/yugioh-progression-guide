import type { PulledCard } from "@/lib/api";
import type { Collection } from "@/lib/collection";
import type { RewardEntry, RivalReward, WheelPrize } from "@/lib/rewards";
import type { MatchResult, SavedDeck } from "@/lib/storage";

/*
 * Where a run's state lives and who enforces its rules. Pages only talk to a
 * GameRepository: RemoteRepo (the server decides) for signed-in players,
 * LocalRepo (localStorage, same shared rules) for guests.
 */

export type SeriesMode = "solo" | "duo";

export interface Member {
    id: string;
    duelistName: string;
}

export interface SeriesSummary {
    id: string;
    name: string;
    mode: SeriesMode;
    /** A duo series waits for its rival, and pauses if one leaves. */
    status: "active" | "awaiting_rival" | "paused";
    /** Null for guest saves. */
    ownerId: string | null;
    members: Member[];
    currentSetIndex: number;
    currentSetName: string | null;
    lastPlayed: number;
}

/** A duo result waiting for the other player to confirm it. */
export interface PendingReport {
    id: string;
    setName: string;
    reporterId: string;
    winnerId: string;
}

export interface SeriesView extends SeriesSummary {
    rules: { startSetIndex: number; packsPerSet: number };
    finished: boolean;
    bannedCardIds: number[];
    matchHistory: MatchResult[];
    pendingReport: PendingReport | null;
    /** Members who saved the current set's packs; a match needs all of them. */
    openingsSaved: string[];
}

export interface PlayerView {
    collection: Collection;
    savedDecks: SavedDeck[];
    rewards: RewardEntry[];
    ydkImportUsed: boolean;
}

export interface Opening {
    id: string;
    source: "set" | "pity" | "tournament";
    setName: string;
    packs: PulledCard[][];
    /** Flat indexes (pack * 100 + card) of the cards already face up. */
    flipped: number[];
}

/** Duo reports wait for the rival; solo ones apply at once. */
export type ReportOutcome = { status: "applied"; reward: RewardEntry } | { status: "pending" };

export interface CreateSeriesInput {
    name: string;
    startSetIndex: number;
    packsPerSet: number;
    /** Guests play solo only. */
    mode?: SeriesMode;
}

export interface OpenOptions {
    /** Guests only: how many packs. */
    quantity?: number;
    /** Guests may pick any set up to the current one; on the server, only admins may pick. */
    setIndex?: number;
}

export interface GameRepository {
    readonly kind: "local" | "remote";
    /** Guests may open any set up to the current one, any number of packs, any number of times. */
    readonly freePacks: boolean;

    listSeries(): Promise<SeriesSummary[]>;
    createSeries(input: CreateSeriesInput): Promise<string>;
    deleteSeries(id: string): Promise<void>;
    loadSeries(id: string): Promise<{ series: SeriesView; me: PlayerView }>;
    /** The run the player last picked on this device. */
    activeSeriesId(): string | null;
    setActiveSeriesId(id: string | null): void;

    openPacks(id: string, options?: OpenOptions): Promise<Opening>;
    /** The unsaved opening to resume: a set's packs, or a reward's. */
    activeOpening(id: string, kind: "set" | "reward"): Promise<Opening | null>;
    flip(id: string, openingId: string, flipped: number[]): Promise<void>;
    saveOpening(id: string, openingId: string): Promise<void>;
    reroll(id: string, openingId: string): Promise<Opening>;

    reportMatch(id: string, won: boolean): Promise<ReportOutcome>;
    /** Duo only: the other player's answer to a pending report. Confirming returns your reward. */
    confirmReport(id: string, reportId: string): Promise<RewardEntry>;
    rejectReport(id: string, reportId: string): Promise<void>;
    spin(id: string, rewardId: string): Promise<WheelPrize>;
    /** Pity and tournament rewards answer with the packs they open. Snatch Steal takes a `printing` (collection key). */
    claimReward(id: string, rewardId: string, cardId?: number, printing?: string): Promise<Opening | null>;
    /** Duo only, while holding a Snatch Steal. */
    rivalBinder(id: string): Promise<Collection>;
    /** What the rival has claimed (empty in solo). */
    rivalRewards(id: string): Promise<RivalReward[]>;

    saveDeck(id: string, deck: SavedDeck): Promise<void>;
    deleteDeck(id: string, deckId: string): Promise<void>;
    importCollection(id: string, cardIds: number[], mode: "add" | "replace"): Promise<void>;
}

/** A refusal worth showing the player as is. */
export class RepoError extends Error {}

export const flatIndex = (pack: number, card: number) => pack * 100 + card;
