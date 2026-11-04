import type { PulledCard } from "@/lib/api";
import type { Collection } from "@/lib/collection";
import type { RewardEntry, WheelPrize } from "@/lib/rewards";
import type { MatchResult, SavedDeck } from "@/lib/storage";

/*
 * Where a run's state lives and who enforces its rules. Pages only talk to a
 * GameRepository: RemoteRepo (the server decides) for signed-in players,
 * LocalRepo (localStorage, same shared rules) for guests.
 */

export type SeriesMode = "solo" | "duo";

export interface SeriesSummary {
    id: string;
    name: string;
    mode: SeriesMode;
    currentSetIndex: number;
    currentSetName: string | null;
    lastPlayed: number;
}

export interface SeriesView extends SeriesSummary {
    rules: { startSetIndex: number; packsPerSet: number };
    finished: boolean;
    bannedCardIds: number[];
    matchHistory: MatchResult[];
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

/** Duo reports wait for the rival (Phase 4); solo ones apply at once. */
export type ReportOutcome = { status: "applied"; reward: RewardEntry } | { status: "pending" };

export interface CreateSeriesInput {
    name: string;
    startSetIndex: number;
    packsPerSet: number;
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
    spin(id: string, rewardId: string): Promise<WheelPrize>;
    /** Pity and tournament rewards answer with the packs they open. */
    claimReward(id: string, rewardId: string, cardId?: number): Promise<Opening | null>;

    saveDeck(id: string, deck: SavedDeck): Promise<void>;
    deleteDeck(id: string, deckId: string): Promise<void>;
    importCollection(id: string, cardIds: number[], mode: "add" | "replace"): Promise<void>;
}

/** A refusal worth showing the player as is. */
export class RepoError extends Error {}

export const flatIndex = (pack: number, card: number) => pack * 100 + card;
