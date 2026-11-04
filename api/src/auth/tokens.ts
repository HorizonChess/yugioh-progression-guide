import type { Db, ObjectId } from 'mongodb';
import { hashToken, newToken } from './sessions';

/*
 * One-time tokens that travel by email: "verify your address" and "reset your
 * password". Like sessions, only the SHA-256 is stored. A token works once,
 * expires on its own (TTL index), and issuing a new one for the same purpose
 * cancels the old, so only the latest email's link is live.
 */

export type TokenKind = 'verify' | 'reset';

const LIFETIME_MINUTES: Record<TokenKind, number> = { verify: 24 * 60, reset: 60 };

interface AuthTokenDoc {
    /** sha256(token), hex. */
    _id: string;
    userId: ObjectId;
    kind: TokenKind;
    /** The address it was sent to; a token is void if the account's email has changed since. */
    email: string;
    expiresAt: Date;
}

const tokens = (db: Db) => db.collection<AuthTokenDoc>('authTokens');

export async function ensureTokenIndexes(db: Db): Promise<void> {
    await tokens(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await tokens(db).createIndex({ userId: 1, kind: 1 });
}

/** Issues a token for `userId`/`email` and returns the secret to put in the email link. */
export async function issueToken(db: Db, userId: ObjectId, kind: TokenKind, email: string): Promise<string> {
    await tokens(db).deleteMany({ userId, kind });
    const token = newToken();
    await tokens(db).insertOne({
        _id: hashToken(token),
        userId,
        kind,
        email,
        expiresAt: new Date(Date.now() + LIFETIME_MINUTES[kind] * 60_000),
    });
    return token;
}

/** Spends a token: returns who it was for, or null if it's unknown, used, expired or the wrong kind. */
export async function consumeToken(db: Db, token: string, kind: TokenKind): Promise<{ userId: ObjectId; email: string } | null> {
    const doc = await tokens(db).findOneAndDelete({ _id: hashToken(token), kind });
    return doc && doc.expiresAt > new Date() ? { userId: doc.userId, email: doc.email } : null;
}
