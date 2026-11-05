import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { usersCollection } from '../src/auth/users';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    ({ app } = await testApp(mongo));
});
afterEach(async () => {
    await app.close();
});

async function player(name: string) {
    const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: `${name.toLowerCase()}@example.com`, password: 'heart of the cards', duelistName: name },
    });
    const user = await usersCollection(app.db).findOne({ duelistName: name });
    return { cookie: `sid=${res.cookies.find((c) => c.name === 'sid')!.value}`, id: user!._id };
}

const SERIES = new ObjectId();
const list = (cookie: string) => app.inject({ url: '/api/notifications', headers: { cookie } });
// The injected upgrade has no socket of its own; the rate limiter needs an address.
const live = (headers: Record<string, string> = {}) =>
    app.injectWS('/api/notifications/live', { headers, socket: { remoteAddress: '127.0.0.1' } } as never);

describe('notifications', () => {
    it('lists only your own, newest first, and marks them read', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        await app.notifier.send(yami.id, 'invite', SERIES, { from: 'Kaiba' });
        await app.notifier.send(yami.id, 'snatched', SERIES, { from: 'Kaiba', cardId: 46986414 });
        await app.notifier.send(kaiba.id, 'invite', SERIES, { from: 'Yami' });

        const mine = (await list(yami.cookie)).json();
        expect(mine.unread).toBe(2);
        expect(mine.notifications.map((n: { type: string }) => n.type)).toEqual(['snatched', 'invite']);
        expect(mine.notifications[0]).toMatchObject({ seriesId: SERIES.toHexString(), payload: { cardId: 46986414 }, read: false });

        const first = mine.notifications[0].id;
        await app.inject({ method: 'POST', url: '/api/notifications/read', headers: { cookie: yami.cookie }, payload: { ids: [first] } });
        expect((await list(yami.cookie)).json().unread).toBe(1);
        // Someone else's id marks nothing of theirs.
        const theirs = (await list(kaiba.cookie)).json().notifications[0].id;
        await app.inject({ method: 'POST', url: '/api/notifications/read', headers: { cookie: yami.cookie }, payload: { ids: [theirs] } });
        expect((await list(kaiba.cookie)).json().unread).toBe(1);
        await app.inject({ method: 'POST', url: '/api/notifications/read', headers: { cookie: yami.cookie } });
        expect((await list(yami.cookie)).json().unread).toBe(0);
        expect((await list('')).statusCode).toBe(401);
    });

    it('pushes new ones live to every open socket of that player only', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const tabs = await Promise.all([1, 2].map(() => live({ cookie: yami.cookie })));
        const other = await live({ cookie: kaiba.cookie });
        const received = tabs.map((ws) => new Promise<string>((resolve) => ws.once('message', (data) => resolve(String(data)))));
        let kaibaGotOne = false;
        other.on('message', () => (kaibaGotOne = true));

        await app.notifier.send(yami.id, 'report', SERIES, { from: 'Kaiba', setName: 'Metal Raiders' });
        for (const message of await Promise.all(received)) {
            expect(JSON.parse(message).notification).toMatchObject({ type: 'report', payload: { setName: 'Metal Raiders' } });
        }
        expect(kaibaGotOne).toBe(false);
        for (const ws of [...tabs, other]) ws.terminate();
    });

    it('refuses sockets from signed-out visitors and other sites', async () => {
        const yami = await player('Yami');
        await expect(live()).rejects.toThrow(/401/);
        await expect(live({ cookie: yami.cookie, origin: 'https://evil.example' })).rejects.toThrow(/403/);
    });
});
