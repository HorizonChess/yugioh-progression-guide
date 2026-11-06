import { ObjectId, type Db, type MongoClient } from 'mongodb';
import { collectionKey, generateBoosterPacks, type Card, type CardSet } from '@ygo/shared';
import type { CardCatalog } from '../cards/catalog';
import { cryptoRng } from './rng';
import { seriesPlayersCollection } from './series';

/** One pulled card, stored compactly; full card data comes from the catalog. */
export interface Pull {
    id: number;
    rarity: string;
    setCode: string;
}

export interface PackSessionDoc {
    _id: ObjectId;
    seriesId: ObjectId;
    userId: ObjectId;
    setIndex: number;
    setName: string;
    source: 'set' | 'pity' | 'tournament';
    /** The reward a pity or tournament opening was claimed from. */
    rewardId?: string;
    packs: Pull[][];
    /** Flat indexes (pack * 100 + card) of flipped cards, so a reload resumes. */
    flipped: number[];
    stage: 'opening' | 'saved' | 'rerolled';
    /** False once rerolled; the uniqueness index only counts active sessions. */
    active: boolean;
    createdAt: Date;
}

export const packSessions = (db: Db) => db.collection<PackSessionDoc>('packSessions');

export async function ensurePackIndexes(db: Db): Promise<void> {
    // One regular opening per player per set. Enforced by Mongo, so racing requests can't both win.
    await packSessions(db).createIndex(
        { seriesId: 1, userId: 1, setIndex: 1 },
        { unique: true, partialFilterExpression: { source: 'set', active: true } },
    );
    await packSessions(db).createIndex({ seriesId: 1, userId: 1, stage: 1 });
}

export function rollPacks(cards: Card[], set: CardSet, count: number): Pull[][] {
    // Rolled as boxes: fixed foil counts and an even spread of cards, as a real box.
    return generateBoosterPacks(cards, set, count, cryptoRng).map((pack) =>
        pack.map((c) => ({ id: c.id, rarity: c.pulled_rarity, setCode: c.pulled_set_code })),
    );
}

export function flatIndex(pack: number, card: number): number {
    return pack * 100 + card;
}

/** The packs with full card data, as the client shows them. */
export async function hydrate(catalog: CardCatalog, session: PackSessionDoc) {
    const cards = new Map((await catalog.cardsByIds(session.packs.flat().map((p) => p.id))).map((c) => [c.id, c]));
    return {
        id: session._id.toHexString(),
        setIndex: session.setIndex,
        setName: session.setName,
        source: session.source,
        stage: session.stage,
        flipped: session.flipped,
        packs: session.packs.map((pack) =>
            pack.map((p) => ({ ...cards.get(p.id)!, pulled_rarity: p.rarity, pulled_set_code: p.setCode })),
        ),
    };
}

class NoTicket extends Error {}

/** Spends a Redoer Ticket to replace an unsaved opening with fresh packs. */
export async function rerollSession(
    mongo: MongoClient,
    db: Db,
    session: PackSessionDoc,
    packs: Pull[][],
): Promise<PackSessionDoc | 'not-open' | 'no-ticket'> {
    const fresh: PackSessionDoc = { ...session, _id: new ObjectId(), packs, flipped: [], stage: 'opening', active: true, createdAt: new Date() };
    const tx = mongo.startSession();
    try {
        return await tx.withTransaction(async () => {
            const old = await packSessions(db).updateOne(
                { _id: session._id, stage: 'opening', active: true },
                { $set: { stage: 'rerolled', active: false } },
                { session: tx },
            );
            if (!old.modifiedCount) return 'not-open' as const;
            const ticket = await seriesPlayersCollection(db).updateOne(
                { seriesId: session.seriesId, userId: session.userId, rewards: { $elemMatch: { prizeId: 'redoer-ticket', status: 'available' } } },
                { $set: { 'rewards.$.status': 'claimed', 'rewards.$.claimedDate': new Date().toISOString() } },
                { session: tx },
            );
            if (!ticket.modifiedCount) throw new NoTicket();
            await packSessions(db).insertOne(fresh, { session: tx });
            return fresh;
        });
    } catch (error) {
        if (error instanceof NoTicket) return 'no-ticket';
        throw error;
    } finally {
        await tx.endSession();
    }
}

/**
 * Moves a session's cards into the player's collection, once. The stage check
 * inside the transaction makes a double "save" a no-op instead of double cards.
 */
export function collectionInc(pulls: readonly Pull[]): Record<string, number> {
    const inc: Record<string, number> = {};
    for (const p of pulls) {
        const key = collectionKey(p.id, p.setCode, p.rarity);
        // Keys become field names; a "." or "$" would corrupt the update.
        if (/[.$]/.test(key)) throw new Error(`unsafe collection key ${key}`);
        inc[`collection.${key}`] = (inc[`collection.${key}`] ?? 0) + 1;
    }
    return inc;
}

export async function saveSession(mongo: MongoClient, db: Db, session: PackSessionDoc): Promise<boolean> {
    const inc = collectionInc(session.packs.flat());
    const tx = mongo.startSession();
    try {
        return await tx.withTransaction(async () => {
            const marked = await packSessions(db).updateOne({ _id: session._id, stage: 'opening' }, { $set: { stage: 'saved' } }, { session: tx });
            if (marked.modifiedCount === 0) return false;
            await seriesPlayersCollection(db).updateOne({ seriesId: session.seriesId, userId: session.userId }, { $inc: inc }, { session: tx });
            return true;
        });
    } finally {
        await tx.endSession();
    }
}
