import { randomUUID } from 'node:crypto';
import { MongoServerError, ObjectId, type ClientSession, type Db, type MongoClient } from 'mongodb';
import { PITY_PRIZE, SPIN_PRIZE, resolveSetIndex, wheelPrizesFor, type CardSet, type RewardEntry, type WheelPrize } from '@ygo/shared';
import { packSessions } from './packs';
import { cryptoRng } from './rng';
import { seriesCollection, seriesPlayersCollection, type SeriesDoc } from './series';

/** A duo result waiting for the rival to confirm it. */
export interface MatchReportDoc {
    _id: ObjectId;
    seriesId: ObjectId;
    setIndex: number;
    setName: string;
    reporterId: ObjectId;
    winnerId: ObjectId;
    loserId: ObjectId;
    status: 'pending' | 'confirmed' | 'rejected';
    createdAt: Date;
    resolvedAt?: Date;
}

export const matchReports = (db: Db) => db.collection<MatchReportDoc>('matchReports');

export async function ensureMatchIndexes(db: Db): Promise<void> {
    // One open report per series, even when both players report at once.
    await matchReports(db).createIndex({ seriesId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
}

export type ReportProblem = 'finished' | 'not-saved' | 'rival-not-saved' | 'conflict' | 'no-rival' | 'pending';

/** The set being played, or why `userId` can't report a match on it yet. */
async function playableSet(db: Db, series: SeriesDoc, userId: ObjectId, timeline: readonly CardSet[]): Promise<{ setIndex: number; set: CardSet } | ReportProblem> {
    const setIndex = resolveSetIndex(timeline, series.currentSetName, series.currentSetIndex);
    const set = timeline[setIndex];
    if (!set) return 'finished';
    // Every player must have saved this set's packs: duels are played with what they opened.
    const saved = await packSessions(db).distinct('userId', { seriesId: series._id, setIndex, source: 'set', active: true, stage: 'saved' });
    const done = (id: ObjectId) => saved.some((s) => s.equals(id));
    if (!done(userId)) return 'not-saved';
    return series.memberIds.every(done) ? { setIndex, set } : 'rival-not-saved';
}

const rewardFor = (won: boolean, set: CardSet, setIndex: number, at: Date): RewardEntry => ({
    id: randomUUID(),
    prizeId: won ? SPIN_PRIZE.id : PITY_PRIZE.id,
    wonFromPackName: set.set_name,
    wonFromSetIndex: setIndex,
    wonDate: at.toISOString(),
    status: 'available',
});

/**
 * Records the match, advances the set and books each player's reward: a wheel
 * spin for the winner, pity packs for the loser. A null id is solo's offline
 * opponent. False if the series changed meanwhile.
 */
async function applyResult(
    db: Db,
    tx: ClientSession,
    { series, setIndex, set, timeline, winnerId, loserId }: { series: SeriesDoc; setIndex: number; set: CardSet; timeline: readonly CardSet[]; winnerId: ObjectId | null; loserId: ObjectId | null },
): Promise<Map<string, RewardEntry> | false> {
    const now = new Date();
    const moved = await seriesCollection(db).updateOne(
        { _id: series._id, version: series.version },
        {
            $push: { matchHistory: { setIndex, setName: set.set_name, winnerId, loserId, at: now } },
            $set: { currentSetIndex: setIndex + 1, currentSetName: timeline[setIndex + 1]?.set_name ?? '', updatedAt: now },
            $inc: { version: 1 },
        },
        { session: tx },
    );
    if (!moved.modifiedCount) return false;
    const rewards = new Map<string, RewardEntry>();
    for (const [userId, won] of [[winnerId, true], [loserId, false]] as const) {
        if (!userId) continue;
        const reward = rewardFor(won, set, setIndex, now);
        await seriesPlayersCollection(db).updateOne({ seriesId: series._id, userId }, { $push: { rewards: reward } }, { session: tx });
        rewards.set(userId.toHexString(), reward);
    }
    return rewards;
}

/** Records a solo result, advances the set and gives the player its reward. */
export async function reportSoloMatch(
    mongo: MongoClient,
    db: Db,
    { series, userId, won, timeline }: { series: SeriesDoc; userId: ObjectId; won: boolean; timeline: readonly CardSet[] },
): Promise<RewardEntry | ReportProblem> {
    const playable = await playableSet(db, series, userId, timeline);
    if (typeof playable === 'string') return playable;
    const tx = mongo.startSession();
    try {
        return await tx.withTransaction(async () => {
            const rewards = await applyResult(db, tx, { series, ...playable, timeline, winnerId: won ? userId : null, loserId: won ? null : userId });
            return rewards ? rewards.get(userId.toHexString())! : ('conflict' as const);
        });
    } finally {
        await tx.endSession();
    }
}

/** Puts a duo result up for the rival to confirm. */
export async function reportDuoMatch(
    db: Db,
    { series, userId, won, timeline }: { series: SeriesDoc; userId: ObjectId; won: boolean; timeline: readonly CardSet[] },
): Promise<MatchReportDoc | ReportProblem> {
    const rivalId = series.memberIds.find((id) => !id.equals(userId));
    if (series.status !== 'active' || !rivalId) return 'no-rival';
    const playable = await playableSet(db, series, userId, timeline);
    if (typeof playable === 'string') return playable;
    const report: MatchReportDoc = {
        _id: new ObjectId(),
        seriesId: series._id,
        setIndex: playable.setIndex,
        setName: playable.set.set_name,
        reporterId: userId,
        winnerId: won ? userId : rivalId,
        loserId: won ? rivalId : userId,
        status: 'pending',
        createdAt: new Date(),
    };
    try {
        await matchReports(db).insertOne(report);
    } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) return 'pending';
        throw error;
    }
    return report;
}

export function findPendingReport(db: Db, seriesId: ObjectId) {
    return matchReports(db).findOne({ seriesId, status: 'pending' });
}

export function publicReport(report: MatchReportDoc) {
    return {
        id: report._id.toHexString(),
        setName: report.setName,
        reporterId: report.reporterId.toHexString(),
        winnerId: report.winnerId.toHexString(),
        createdAt: report.createdAt.toISOString(),
    };
}

export type ResolveProblem = 'no-report' | 'own-report' | 'conflict';

/** The rival confirms a pending report: it's applied, and each player gets their reward. */
export async function confirmReport(
    mongo: MongoClient,
    db: Db,
    { series, userId, reportId, timeline }: { series: SeriesDoc; userId: ObjectId; reportId: ObjectId; timeline: readonly CardSet[] },
): Promise<{ report: MatchReportDoc; rewards: Map<string, RewardEntry> } | ResolveProblem> {
    const report = await matchReports(db).findOne({ _id: reportId, seriesId: series._id, status: 'pending' });
    if (!report) return 'no-report';
    if (report.reporterId.equals(userId)) return 'own-report';
    const setIndex = resolveSetIndex(timeline, series.currentSetName, series.currentSetIndex);
    const set = timeline[setIndex];
    if (set?.set_name !== report.setName) return 'conflict';

    const tx = mongo.startSession();
    try {
        return await tx.withTransaction(async () => {
            const closed = await matchReports(db).updateOne(
                { _id: report._id, status: 'pending' },
                { $set: { status: 'confirmed', resolvedAt: new Date() } },
                { session: tx },
            );
            if (!closed.modifiedCount) return 'no-report' as const;
            const rewards = await applyResult(db, tx, { series, setIndex, set, timeline, winnerId: report.winnerId, loserId: report.loserId });
            if (!rewards) throw new Conflict();
            return { report, rewards };
        });
    } catch (error) {
        if (error instanceof Conflict) return 'conflict';
        throw error;
    } finally {
        await tx.endSession();
    }
}

/** Rolls back a confirmation whose series moved on meanwhile. */
class Conflict extends Error {}

/** The rival turns a pending report down; either player may report again. */
export function rejectReport(db: Db, { series, userId, reportId }: { series: SeriesDoc; userId: ObjectId; reportId: ObjectId }) {
    return matchReports(db).findOneAndUpdate(
        { _id: reportId, seriesId: series._id, status: 'pending', reporterId: { $ne: userId } },
        { $set: { status: 'rejected', resolvedAt: new Date() } },
    );
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
