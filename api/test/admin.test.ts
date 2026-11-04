import { MongoClient, type Db } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setUserRole } from '../src/auth/admin';
import { ensureUserIndexes, insertUser } from '../src/auth/users';
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
    db = client.db(`admin-${crypto.randomUUID()}`);
    await ensureUserIndexes(db);
    await insertUser(db, { email: 'yami@example.com', emailVerified: true, duelistName: 'Yami' });
    await insertUser(db, { email: 'joey@example.com', emailVerified: false, duelistName: 'Joey' });
});

const roleOf = async (email: string) => (await db.collection('users').findOne({ email }))?.role;

describe('setUserRole', () => {
    it('promotes by email or by duelist name, and records it in the audit log', async () => {
        const byEmail = await setUserRole(db, 'YAMI@example.com', 'admin');
        expect(byEmail).toMatchObject({ status: 'changed', from: 'user', to: 'admin' });
        expect(await roleOf('yami@example.com')).toBe('admin');

        const log = await db.collection('auditLog').find().toArray();
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({
            action: 'user.role.set',
            target: { duelistName: 'Yami' },
            before: { role: 'user' },
            after: { role: 'admin' },
        });

        await setUserRole(db, 'yami@example.com', 'user');
        const byName = await setUserRole(db, '  yami ', 'admin');
        expect(byName.status).toBe('changed');
    });

    it('does nothing, and logs nothing, when the role is already set', async () => {
        await setUserRole(db, 'yami', 'admin');
        const again = await setUserRole(db, 'yami', 'admin');
        expect(again.status).toBe('unchanged');
        expect(await db.collection('auditLog').countDocuments()).toBe(1);
    });

    it('demotes', async () => {
        await setUserRole(db, 'yami', 'admin');
        const result = await setUserRole(db, 'yami', 'user');
        expect(result).toMatchObject({ status: 'changed', from: 'admin', to: 'user' });
        expect(await roleOf('yami@example.com')).toBe('user');
    });

    it('reports an unknown account', async () => {
        expect((await setUserRole(db, 'nobody@example.com', 'admin')).status).toBe('not-found');
        expect((await setUserRole(db, 'Nobody', 'admin')).status).toBe('not-found');
        expect(await db.collection('auditLog').countDocuments()).toBe(0);
    });

    it('refuses to promote an unconfirmed email unless told to', async () => {
        const refused = await setUserRole(db, 'joey', 'admin');
        expect(refused.status).toBe('unverified');
        expect(await roleOf('joey@example.com')).toBe('user');
        expect(await db.collection('auditLog').countDocuments()).toBe(0);

        const forced = await setUserRole(db, 'joey', 'admin', { allowUnverified: true });
        expect(forced.status).toBe('changed');
        expect(await roleOf('joey@example.com')).toBe('admin');
    });

    it('still lets an unconfirmed account be demoted', async () => {
        await setUserRole(db, 'joey', 'admin', { allowUnverified: true });
        expect((await setUserRole(db, 'joey', 'user')).status).toBe('changed');
    });
});
