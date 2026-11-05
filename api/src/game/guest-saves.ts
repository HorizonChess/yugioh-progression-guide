import { randomUUID } from 'node:crypto';
import { MongoServerError, ObjectId, type Db, type MongoClient } from 'mongodb';
import { parseCollectionKey, resolveSetIndex, type CardSet, type Collection, type GuestSaveBody } from '@ygo/shared';
import { blankPlayer, checkSeriesCap, seriesCollection, seriesPlayersCollection, type SeriesDoc, type SeriesPlayerDoc } from './series';

/** A date from a guest save, or now if it doesn't read as one. */
function date(value: string | number): Date {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Every card id a guest save refers to, to check against the catalog. */
export const guestSaveCardIds = (save: GuestSaveBody): number[] => [
    ...Object.keys(save.collection).map((key) => parseCollectionKey(key)!.id),
    ...save.bannedCardIds,
    ...save.savedDecks.flatMap((d) => [...d.mainDeck, ...d.extraDeck, ...d.sideDeck]),
];

/**
 * Moves a guest save into the account as a solo series flagged `legacy`, placed
 * on today's timeline by set name. Cards outside the catalog stay behind
 * (`dropped` counts them). Moving the same save again returns the series it
 * already became.
 */
export async function importGuestSave(
    mongo: MongoClient,
    db: Db,
    userId: ObjectId,
    save: GuestSaveBody,
    timeline: readonly CardSet[],
    known: ReadonlySet<number>,
): Promise<{ series: SeriesDoc; dropped: number; created: boolean }> {
    const current = Math.min(resolveSetIndex(timeline, save.currentSetName, save.currentSetIndex), timeline.length);
    const keep = (ids: number[]) => ids.filter((id) => known.has(id));

    let dropped = 0;
    const collection: Collection = {};
    for (const [key, count] of Object.entries(save.collection)) {
        if (known.has(parseCollectionKey(key)!.id)) collection[key] = count;
        else dropped += count;
    }

    const now = new Date();
    const series: SeriesDoc = {
        _id: new ObjectId(),
        name: save.name,
        mode: 'solo',
        ownerId: userId,
        memberIds: [userId],
        status: 'active',
        rules: { startSetIndex: Math.min(save.startSetIndex, current, timeline.length - 1), packsPerSet: save.packsPerSet },
        currentSetIndex: current,
        currentSetName: timeline[current]?.set_name ?? '',
        bannedCardIds: [...new Set(keep(save.bannedCardIds))],
        matchHistory: save.matchHistory.map((m) => ({
            setIndex: timeline.findIndex((s) => s.set_name === m.setName),
            setName: m.setName,
            winnerId: m.won ? userId : null,
            loserId: m.won ? null : userId,
            at: date(m.at),
        })),
        legacy: true,
        legacySaveId: save.saveId,
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
    const player: SeriesPlayerDoc = {
        ...blankPlayer(series._id, userId),
        collection,
        savedDecks: save.savedDecks.map((d) => ({
            ...d,
            mainDeck: keep(d.mainDeck),
            extraDeck: keep(d.extraDeck),
            sideDeck: keep(d.sideDeck),
            createdAt: date(d.createdAt),
        })),
        rewards: save.rewards.map((r) => ({ ...r, id: randomUUID(), wonFromSetIndex: resolveSetIndex(timeline, r.wonFromPackName, r.wonFromSetIndex) })),
    };

    const session = mongo.startSession();
    try {
        await session.withTransaction(async () => {
            await checkSeriesCap(db, userId, session);
            await seriesCollection(db).insertOne(series, { session });
            await seriesPlayersCollection(db).insertOne(player, { session });
        });
    } catch (error) {
        const existing = error instanceof MongoServerError && error.code === 11000 && (await seriesCollection(db).findOne({ ownerId: userId, legacySaveId: save.saveId }));
        if (!existing) throw error;
        return { series: existing, dropped: 0, created: false };
    } finally {
        await session.endSession();
    }
    return { series, dropped, created: true };
}
