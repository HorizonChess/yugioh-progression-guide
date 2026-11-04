import { randomUUID } from 'node:crypto';
import type { Db, MongoClient, ObjectId } from 'mongodb';
import { PITY_PRIZE, SPIN_PRIZE, resolveSetIndex, wheelPrizesFor, type CardSet, type RewardEntry, type WheelPrize } from '@ygo/shared';
import { packSessions } from './packs';
import { cryptoRng } from './rng';
import { seriesCollection, seriesPlayersCollection, type SeriesDoc } from './series';

export type ReportProblem = 'finished' | 'not-saved' | 'conflict';

/** Records a solo result, advances the set and gives the player its reward. */
export async function reportSoloMatch(
    mongo: MongoClient,
    db: Db,
    { series, userId, won, timeline }: { series: SeriesDoc; userId: ObjectId; won: boolean; timeline: readonly CardSet[] },
): Promise<RewardEntry | ReportProblem> {
    const setIndex = resolveSetIndex(timeline, series.currentSetName, series.currentSetIndex);
    const set = timeline[setIndex];
    if (!set) return 'finished';
    const saved = await packSessions(db).countDocuments({ seriesId: series._id, userId, setIndex, source: 'set', active: true, stage: 'saved' });
    if (!saved) return 'not-saved';

    const now = new Date();
    const reward: RewardEntry = {
        id: randomUUID(),
        prizeId: won ? SPIN_PRIZE.id : PITY_PRIZE.id,
        wonFromPackName: set.set_name,
        wonFromSetIndex: setIndex,
        wonDate: now.toISOString(),
        status: 'available',
    };
    const tx = mongo.startSession();
    try {
        return await tx.withTransaction(async () => {
            const moved = await seriesCollection(db).updateOne(
                { _id: series._id, version: series.version },
                {
                    $push: { matchHistory: { setIndex, setName: set.set_name, winnerId: won ? userId : null, loserId: won ? null : userId, at: now } },
                    $set: { currentSetIndex: setIndex + 1, currentSetName: timeline[setIndex + 1]?.set_name ?? '', updatedAt: now },
                    $inc: { version: 1 },
                },
                { session: tx },
            );
            if (!moved.modifiedCount) return 'conflict' as const;
            await seriesPlayersCollection(db).updateOne({ seriesId: series._id, userId }, { $push: { rewards: reward } }, { session: tx });
            return reward;
        });
    } finally {
        await tx.endSession();
    }
}

/** Turns an unspun reward into a prize picked here, once. Null if it isn't spinnable. */
export async function spinReward(
    db: Db,
    { series, userId, rewardId }: { series: SeriesDoc; userId: ObjectId; rewardId: string },
): Promise<WheelPrize | null> {
    const prizes = wheelPrizesFor(series.mode);
    const prize = prizes[Math.floor(cryptoRng() * prizes.length)]!;
    const result = await seriesPlayersCollection(db).updateOne(
        { seriesId: series._id, userId, rewards: { $elemMatch: { id: rewardId, prizeId: SPIN_PRIZE.id, status: 'available' } } },
        { $set: { 'rewards.$.prizeId': prize.id } },
    );
    return result.modifiedCount ? prize : null;
}
