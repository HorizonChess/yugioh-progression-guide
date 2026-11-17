import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebPushError } from 'web-push';
import { usersCollection } from '../src/auth/users';
import { pushSender, pushSubscriptions } from '../src/game/push';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
/** What reached the devices' push services: by endpoint, the message. A device listed in `gone` has unsubscribed. */
let pushed: { endpoint: string; message: Record<string, string> }[] = [];
const gone = new Set<string>();
beforeEach(async () => {
    pushed = [];
    gone.clear();
    ({ app } = await testApp(mongo, {}, {
        pushDelivery: async (device, body) => {
            if (gone.has(device.endpoint)) throw new WebPushError('Gone', 410, {}, '', device.endpoint);
            pushed.push({ endpoint: device.endpoint, message: JSON.parse(body) });
        },
    }));
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

    it('pushes them to the devices a player switched them on for, and forgets a device that unsubscribed', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const subscribe = (cookie: string, endpoint: string) =>
            app.inject({ method: 'POST', url: '/api/push/subscriptions', headers: { cookie }, payload: { endpoint, keys: { p256dh: 'BPk3', auth: 'a1' }, expirationTime: null } });
        expect((await app.inject({ url: '/api/push/key' })).json().key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
        expect((await subscribe('', 'https://push.example/none')).statusCode).toBe(401);
        expect((await subscribe(yami.cookie, 'http://push.example/plain')).statusCode).toBe(400);
        for (const endpoint of ['https://push.example/phone', 'https://push.example/laptop']) expect((await subscribe(yami.cookie, endpoint)).statusCode).toBe(204);
        expect((await subscribe(kaiba.cookie, 'https://push.example/kaiba')).statusCode).toBe(204);

        await app.notifier.send(yami.id, 'duel-challenge', SERIES, { from: 'Kaiba', setName: 'Metal Raiders', duelId: 'd1' });
        expect(pushed.map((p) => p.endpoint).sort()).toEqual(['https://push.example/laptop', 'https://push.example/phone']);
        const id = (await list(yami.cookie)).json().notifications[0].id;
        expect(pushed[0]!.message).toEqual({ id, title: 'Duel challenge', body: 'Kaiba challenges you to a duel on Metal Raiders!', tag: 'duel:d1', url: `?notification=${id}` });

        // The laptop unsubscribed in the browser: the push service says so, and it's dropped.
        pushed = [];
        gone.add('https://push.example/laptop');
        await app.notifier.send(yami.id, 'banlist', SERIES, { from: 'Kaiba', seriesName: 'Battle City', banned: true });
        expect(pushed.map((p) => p.endpoint)).toEqual(['https://push.example/phone']);
        expect(await pushSubscriptions(app.db).countDocuments({ userId: yami.id })).toBe(1);

        // Yami turns them off on the phone; then Kaiba, signed in on it, turns them on: it's his now.
        await app.inject({ method: 'DELETE', url: '/api/push/subscriptions', headers: { cookie: yami.cookie }, payload: { endpoint: 'https://push.example/phone' } });
        await subscribe(kaiba.cookie, 'https://push.example/phone');
        pushed = [];
        await app.notifier.send(yami.id, 'invite', SERIES, { from: 'Kaiba', seriesName: 'Battle City' });
        expect(pushed).toEqual([]);
        await app.notifier.send(kaiba.id, 'invite', SERIES, { from: 'Yami', seriesName: 'Battle City' });
        expect(pushed.map((p) => p.endpoint).sort()).toEqual(['https://push.example/kaiba', 'https://push.example/phone']);
    });

    it('signs pushes as the site when it has a public https address, else as the game', () => {
        expect(pushSender('https://ygo.onrender.com/')).toBe('https://ygo.onrender.com');
        for (const local of ['http://localhost:4000', 'https://localhost', 'http://ygo.example', undefined]) expect(pushSender(local)).toMatch(/^https:\/\/github\.com\//);
    });
});
