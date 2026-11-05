import { ObjectId, type ClientSession, type Db, type MongoClient } from 'mongodb';
import type { Collection, RewardEntry, SeriesRules } from '@ygo/shared';

/*
 * A series is one run through the timeline: solo, or two rivals who share the
 * set progression and banlist. Each member's own state (collection,
 * decks, reward ledger) is a separate `seriesPlayers` document, so a player's
 * pack save never has to rewrite the rival's data.
 */

export interface MatchEntry {
    setIndex: number;
    setName: string;
    /** Null on the side of a solo match the player's offline opponent took. */
    winnerId: ObjectId | null;
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

export function blankPlayer(seriesId: ObjectId, userId: ObjectId): SeriesPlayerDoc {
    return { _id: new ObjectId(), seriesId, userId, collection: {}, savedDecks: [], rewards: [], ydkImportUsed: false, createdAt: new Date() };
}

/** Throws TooManySeriesError if `userId` already plays the most series allowed. */
export async function checkSeriesCap(db: Db, userId: ObjectId, session: ClientSession): Promise<void> {
    const count = await seriesCollection(db).countDocuments({ memberIds: userId }, { session });
    if (count >= MAX_SERIES_PER_USER) throw new TooManySeriesError();
}

/**
 * Creates a series with its owner as the first player, atomically. A duo series
 * waits for its rival. Rules must already be validated.
 */
export async function createSeries(
    mongo: MongoClient,
    db: Db,
    input: { ownerId: ObjectId; name: string; mode: SeriesDoc['mode']; rules: SeriesRules; startSetName: string },
): Promise<{ series: SeriesDoc; player: SeriesPlayerDoc }> {
    const now = new Date();
    const series: SeriesDoc = {
        _id: new ObjectId(),
        name: input.name,
        mode: input.mode,
        ownerId: input.ownerId,
        memberIds: [input.ownerId],
        status: input.mode === 'duo' ? 'awaiting_rival' : 'active',
        rules: input.rules,
        currentSetIndex: input.rules.startSetIndex,
        currentSetName: input.startSetName,
        bannedCardIds: [],
        matchHistory: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
    const player = blankPlayer(series._id, input.ownerId);

    const session = mongo.startSession();
    try {
        await session.withTransaction(async () => {
            await checkSeriesCap(db, input.ownerId, session);
            await seriesCollection(db).insertOne(series, { session });
            await seriesPlayersCollection(db).insertOne(player, { session });
        });
    } finally {
        await session.endSession();
    }
    return { series, player };
}

/** Everything stored under a series. */
const SERIES_PARTS = ['seriesPlayers', 'packSessions', 'invites', 'matchReports'];

/** Removes a series with its players, openings, invites and reports. */
export async function deleteSeries(mongo: MongoClient, db: Db, seriesId: ObjectId): Promise<void> {
    const session = mongo.startSession();
    try {
        await session.withTransaction(async () => {
            await seriesCollection(db).deleteOne({ _id: seriesId }, { session });
            for (const part of SERIES_PARTS) await db.collection(part).deleteMany({ seriesId }, { session });
        });
    } finally {
        await session.endSession();
    }
}

/**
 * A duo player walks away. Their cards and openings go with them and the series
 * pauses for the rival; it's deleted once nobody is left in it.
 */
export async function leaveSeries(mongo: MongoClient, db: Db, seriesId: ObjectId, userId: ObjectId): Promise<'left' | 'deleted'> {
    const session = mongo.startSession();
    try {
        const remaining = await session.withTransaction(async () => {
            const after = await seriesCollection(db).findOneAndUpdate(
                { _id: seriesId, memberIds: userId },
                { $pull: { memberIds: userId }, $set: { status: 'paused', updatedAt: new Date() }, $inc: { version: 1 } },
                { session, returnDocument: 'after' },
            );
            await seriesPlayersCollection(db).deleteOne({ seriesId, userId }, { session });
            await db.collection('packSessions').deleteMany({ seriesId, userId }, { session });
            await db.collection('matchReports').updateMany({ seriesId, status: 'pending' }, { $set: { status: 'rejected' } }, { session });
            return after?.memberIds.length ?? 0;
        });
        if (remaining) return 'left';
    } finally {
        await session.endSession();
    }
    await deleteSeries(mongo, db, seriesId);
    return 'deleted';
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
