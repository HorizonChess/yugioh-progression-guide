import { createHash, randomBytes } from 'node:crypto';
import type { Db, ObjectId } from 'mongodb';
import { usersCollection, type UserDoc } from './users';

/*
 * Server-side sessions. The browser holds a random 256-bit token in an
 * httpOnly cookie; the database stores only its SHA-256, so a leaked database
 * can't be replayed as live sessions. Sessions slide: each day of use pushes
 * the expiry another SESSION_DAYS out, and Mongo's TTL index deletes the rest.
 */

export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SessionDoc {
    /** sha256(token), hex. */
    _id: string;
    userId: ObjectId;
    createdAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
}

const sessionsCollection = (db: Db) => db.collection<SessionDoc>('sessions');

export async function ensureSessionIndexes(db: Db): Promise<void> {
    await sessionsCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await sessionsCollection(db).createIndex({ userId: 1 });
}

/** SHA-256 hex of a secret token: how sessions and one-time tokens are stored. */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** A new random token, URL-safe. */
export function newToken(): string {
    return randomBytes(32).toString('base64url');
}

/** Starts a session for `userId` and returns the token to put in the cookie. */
export async function createSession(db: Db, userId: ObjectId): Promise<string> {
    const token = newToken();
    const now = new Date();
    await sessionsCollection(db).insertOne({
        _id: hashToken(token),
        userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
    });
    return token;
}

/** The user a session token belongs to, or null when it's unknown or expired. */
export async function resolveSession(db: Db, token: string): Promise<UserDoc | null> {
    const id = hashToken(token);
    const session = await sessionsCollection(db).findOne({ _id: id });
    // The TTL monitor runs about once a minute, so check expiry here too.
    if (!session || session.expiresAt <= new Date()) return null;

    const now = new Date();
    if (now.getTime() - session.lastSeenAt.getTime() > DAY_MS) {
        await sessionsCollection(db).updateOne(
            { _id: id },
            { $set: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS) } },
        );
    }
    return usersCollection(db).findOne({ _id: session.userId });
}

export async function deleteSession(db: Db, token: string): Promise<void> {
    await sessionsCollection(db).deleteOne({ _id: hashToken(token) });
}

/** Signs a user out everywhere, e.g. after a password reset. */
export async function deleteUserSessions(db: Db, userId: ObjectId): Promise<void> {
    await sessionsCollection(db).deleteMany({ userId });
}
