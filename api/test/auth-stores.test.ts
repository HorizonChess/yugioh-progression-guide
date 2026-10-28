import { MongoClient, type Db } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../src/auth/passwords';
import {
    createSession,
    deleteSession,
    deleteUserSessions,
    ensureSessionIndexes,
    hashToken,
    resolveSession,
} from '../src/auth/sessions';
import { AccountTakenError, ensureUserIndexes, findUserByDuelistName, findUserByEmail, insertUser } from '../src/auth/users';
import { startMongo } from './helpers';

let mongo: MongoMemoryReplSet;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
    mongo = await startMongo();
    client = await MongoClient.connect(mongo.getUri());
});

afterAll(async () => {
    await client.close();
    await mongo.stop();
});

beforeEach(async () => {
    db = client.db(`auth-${crypto.randomUUID()}`);
    await ensureUserIndexes(db);
    await ensureSessionIndexes(db);
});

const yami = { email: 'yami@example.com', emailVerified: false, duelistName: 'Yami' };

describe('passwords', () => {
    it('hashes with argon2id and verifies', async () => {
        const hash = await hashPassword('heart of the cards');
        expect(hash.startsWith('$argon2id$')).toBe(true);
        expect(await verifyPassword(hash, 'heart of the cards')).toBe(true);
        expect(await verifyPassword(hash, 'Heart of the cards')).toBe(false);
    });

    it('never authenticates against a malformed hash or a missing account', async () => {
        expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
        expect(await burnPasswordCheck('anything')).toBe(false);
    });
});

describe('users', () => {
    it('finds users by email or duelist name, case-insensitively', async () => {
        await insertUser(db, yami);
        expect(await findUserByEmail(db, ' YAMI@example.com ')).toMatchObject({ duelistName: 'Yami', role: 'user' });
        expect(await findUserByDuelistName(db, 'yAmI')).toMatchObject({ email: 'yami@example.com' });
    });

    it('rejects a second account with the same email or an equivalent duelist name', async () => {
        await insertUser(db, yami);
        await expect(insertUser(db, { ...yami, duelistName: 'Kaiba' })).rejects.toEqual(new AccountTakenError('email'));
        await expect(insertUser(db, { ...yami, email: 'other@example.com', duelistName: '  YAMI ' })).rejects.toEqual(
            new AccountTakenError('duelistName'),
        );
    });

    it('allows many accounts without Google but only one per Google account', async () => {
        await insertUser(db, yami);
        await insertUser(db, { email: 'joey@example.com', emailVerified: false, duelistName: 'Joey' });
        await insertUser(db, { email: 'mai@example.com', emailVerified: true, duelistName: 'Mai', googleSub: 'g-1' });
        await expect(
            insertUser(db, { email: 'mai2@example.com', emailVerified: true, duelistName: 'Mai2', googleSub: 'g-1' }),
        ).rejects.toEqual(new AccountTakenError('google'));
    });
});

describe('sessions', () => {
    it('resolves a session token to its user, and stores only the token hash', async () => {
        const user = await insertUser(db, yami);
        const token = await createSession(db, user._id);

        expect(await resolveSession(db, token)).toMatchObject({ duelistName: 'Yami' });
        const stored = await db.collection('sessions').findOne({});
        expect(stored?._id).toBe(hashToken(token));
        expect(JSON.stringify(stored)).not.toContain(token);
    });

    it('rejects unknown, expired and signed-out sessions', async () => {
        const user = await insertUser(db, yami);
        const token = await createSession(db, user._id);
        expect(await resolveSession(db, token + 'x')).toBeNull();

        await db.collection('sessions').updateOne({ _id: hashToken(token) as never }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        expect(await resolveSession(db, token)).toBeNull();

        const second = await createSession(db, user._id);
        await deleteSession(db, second);
        expect(await resolveSession(db, second)).toBeNull();
    });

    it('signs a user out everywhere', async () => {
        const user = await insertUser(db, yami);
        const tokens = await Promise.all([createSession(db, user._id), createSession(db, user._id)]);
        await deleteUserSessions(db, user._id);
        expect(await Promise.all(tokens.map((t) => resolveSession(db, t)))).toEqual([null, null]);
    });

    it('slides the expiry forward once a day of use', async () => {
        const user = await insertUser(db, yami);
        const token = await createSession(db, user._id);
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        await db.collection('sessions').updateOne({ _id: hashToken(token) as never }, { $set: { lastSeenAt: twoDaysAgo, expiresAt: new Date(Date.now() + 60_000) } });

        await resolveSession(db, token);
        const session = await db.collection('sessions').findOne({ _id: hashToken(token) as never });
        expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    });
});
