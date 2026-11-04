import { ObjectId, type Db, type MongoClient } from 'mongodb';
import type { Collection, RewardEntry, SeriesRules } from '@ygo/shared';

/*
 * A series is one run through the timeline: solo, or (Phase 4) two rivals who
 * share the set progression and banlist. Each member's own state (collection,
 * decks, reward ledger) is a separate `seriesPlayers` document, so a player's
 * pack save never has to rewrite the rival's data.
 */

export interface MatchEntry {
    setIndex: number;
    setName: string;
    winnerId: ObjectId;
    loserId: ObjectId | null;
    at: Date;
}

export interface SeriesDoc {
    _id: ObjectId;
    name: string;
    mode: 'solo' | 'duo';
    ownerId: ObjectId;
    memberIds: ObjectId[];
    status: 'active' | 'awaiting_rival' | 'paused';
    rules: SeriesRules;
    currentSetIndex: number;
    /**
     * The name of the set at `currentSetIndex`. The name is the truth: if a
     * card re-sync shifts the timeline, the index is repaired from it on read.
     */
    currentSetName: string;
    /** The series-wide banlist (ban/unban rewards). */
    bannedCardIds: number[];
    matchHistory: MatchEntry[];
    /** Imported from a guest save (Phase 6). */
    legacy?: boolean;
    /** Bumped by every multi-document change, for optimistic concurrency. */
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface SavedDeckDoc {
    id: string;
    name: string;
    mainDeck: number[];
    extraDeck: number[];
    sideDeck: number[];
    createdAt: Date;
}

export interface SeriesPlayerDoc {
    _id: ObjectId;
    seriesId: ObjectId;
    userId: ObjectId;
    collection: Collection;
    savedDecks: SavedDeckDoc[];
    rewards: RewardEntry[];
    /** The one-time collection YDK import has been used. */
    ydkImportUsed: boolean;
    createdAt: Date;
}

/** A player may run at most this many series at once; stops runaway creation. */
export const MAX_SERIES_PER_USER = 50;

export const seriesCollection = (db: Db) => db.collection<SeriesDoc>('series');
export const seriesPlayersCollection = (db: Db) => db.collection<SeriesPlayerDoc>('seriesPlayers');

export async function ensureSeriesIndexes(db: Db): Promise<void> {
    await seriesCollection(db).createIndex({ memberIds: 1, updatedAt: -1 });
    await seriesPlayersCollection(db).createIndex({ seriesId: 1, userId: 1 }, { unique: true });
}

export class TooManySeriesError extends Error {}

/** Creates a solo series and its one player, atomically. Rules must already be validated. */
export async function createSoloSeries(
    mongo: MongoClient,
    db: Db,
    input: { ownerId: ObjectId; name: string; rules: SeriesRules; startSetName: string },
): Promise<{ series: SeriesDoc; player: SeriesPlayerDoc }> {
    const now = new Date();
    const series: SeriesDoc = {
        _id: new ObjectId(),
        name: input.name,
        mode: 'solo',
        ownerId: input.ownerId,
        memberIds: [input.ownerId],
        status: 'active',
        rules: input.rules,
        currentSetIndex: input.rules.startSetIndex,
        currentSetName: input.startSetName,
        bannedCardIds: [],
        matchHistory: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
    const player: SeriesPlayerDoc = {
        _id: new ObjectId(),
        seriesId: series._id,
        userId: input.ownerId,
        collection: {},
        savedDecks: [],
        rewards: [],
        ydkImportUsed: false,
        createdAt: now,
    };

    const session = mongo.startSession();
    try {
        await session.withTransaction(async () => {
            const count = await seriesCollection(db).countDocuments({ memberIds: input.ownerId }, { session });
            if (count >= MAX_SERIES_PER_USER) throw new TooManySeriesError();
            await seriesCollection(db).insertOne(series, { session });
            await seriesPlayersCollection(db).insertOne(player, { session });
        });
    } finally {
        await session.endSession();
    }
    return { series, player };
}

export function listSeriesFor(db: Db, userId: ObjectId): Promise<SeriesDoc[]> {
    return seriesCollection(db).find({ memberIds: userId }).sort({ updatedAt: -1 }).toArray();
}

export function findSeries(db: Db, id: ObjectId): Promise<SeriesDoc | null> {
    return seriesCollection(db).findOne({ _id: id });
}

export function findPlayer(db: Db, seriesId: ObjectId, userId: ObjectId): Promise<SeriesPlayerDoc | null> {
    return seriesPlayersCollection(db).findOne({ seriesId, userId });
}
