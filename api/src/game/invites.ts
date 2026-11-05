import { ObjectId, type Db, type MongoClient } from 'mongodb';
import { hashToken, newToken } from '../auth/sessions';
import { blankPlayer, checkSeriesCap, seriesCollection, seriesPlayersCollection, TooManySeriesError, type SeriesDoc } from './series';

/*
 * How a rival joins a duo series: by name (they get a notification) or by a
 * shareable link. A series has at most one live invite of each kind; a new one
 * replaces the old. Link codes are stored hashed, like session tokens.
 */

export interface InviteDoc {
    _id: ObjectId;
    seriesId: ObjectId;
    fromUserId: ObjectId;
    /** Set on an invite by name. */
    toUserId?: ObjectId;
    /** sha256 of a link invite's code. */
    codeHash?: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    expiresAt: Date;
    createdAt: Date;
}

const LIFETIME_DAYS = 14;

export const invitesCollection = (db: Db) => db.collection<InviteDoc>('invites');

export async function ensureInviteIndexes(db: Db): Promise<void> {
    await invitesCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await invitesCollection(db).createIndex({ codeHash: 1 }, { unique: true, sparse: true });
    await invitesCollection(db).createIndex({ toUserId: 1, status: 1 });
    await invitesCollection(db).createIndex({ seriesId: 1 });
}

async function replaceInvite(db: Db, series: SeriesDoc, to: Pick<InviteDoc, 'toUserId' | 'codeHash'>): Promise<InviteDoc> {
    const kind = to.toUserId ? 'toUserId' : 'codeHash';
    await invitesCollection(db).updateMany({ seriesId: series._id, [kind]: { $exists: true }, status: 'pending' }, { $set: { status: 'cancelled' } });
    const now = new Date();
    const invite: InviteDoc = {
        _id: new ObjectId(),
        seriesId: series._id,
        fromUserId: series.ownerId,
        ...to,
        status: 'pending',
        expiresAt: new Date(now.getTime() + LIFETIME_DAYS * 86_400_000),
        createdAt: now,
    };
    await invitesCollection(db).insertOne(invite);
    return invite;
}

export const inviteByName = (db: Db, series: SeriesDoc, toUserId: ObjectId) => replaceInvite(db, series, { toUserId });

/** A fresh link code; the series' previous link stops working. */
export async function inviteByLink(db: Db, series: SeriesDoc): Promise<string> {
    const code = newToken();
    await replaceInvite(db, series, { codeHash: hashToken(code) });
    return code;
}

/** A live invite, by its id (named) or its link code. */
export function findOpenInvite(db: Db, by: { id: ObjectId } | { code: string }) {
    const key = 'id' in by ? { _id: by.id } : { codeHash: hashToken(by.code) };
    return invitesCollection(db).findOne({ ...key, status: 'pending', expiresAt: { $gt: new Date() } });
}

export type JoinProblem = 'closed' | 'own-series' | 'too-many';

/** Makes `userId` the series' second player, if the seat is still free. */
export async function acceptInvite(mongo: MongoClient, db: Db, invite: InviteDoc, userId: ObjectId): Promise<SeriesDoc | JoinProblem> {
    if (invite.fromUserId.equals(userId)) return 'own-series';
    const session = mongo.startSession();
    try {
        return await session.withTransaction(async () => {
            await checkSeriesCap(db, userId, session);
            const series = await seriesCollection(db).findOneAndUpdate(
                { _id: invite.seriesId, status: 'awaiting_rival', memberIds: { $size: 1 } },
                { $push: { memberIds: userId }, $set: { status: 'active', updatedAt: new Date() }, $inc: { version: 1 } },
                { session, returnDocument: 'after' },
            );
            if (!series) return 'closed' as const;
            await seriesPlayersCollection(db).insertOne(blankPlayer(series._id, userId), { session });
            await invitesCollection(db).updateOne({ _id: invite._id }, { $set: { status: 'accepted' } }, { session });
            await invitesCollection(db).updateMany(
                { seriesId: series._id, status: 'pending', _id: { $ne: invite._id } },
                { $set: { status: 'cancelled' } },
                { session },
            );
            return series;
        });
    } catch (error) {
        if (error instanceof TooManySeriesError) return 'too-many';
        throw error;
    } finally {
        await session.endSession();
    }
}

/** Declines an invite addressed to `userId`; null if there's no such open invite. */
export function declineInvite(db: Db, inviteId: ObjectId, userId: ObjectId) {
    return invitesCollection(db).findOneAndUpdate({ _id: inviteId, toUserId: userId, status: 'pending' }, { $set: { status: 'declined' } });
}
