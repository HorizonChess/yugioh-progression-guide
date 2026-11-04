import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { requireAdmin, requireAuth } from '../src/middleware/requireAuth';
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

const yami = { email: 'Yami@Example.com', password: 'heart of the cards', duelistName: 'Yami' };

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers });

/** The `sid=…` part of a Set-Cookie header, ready to send back as a Cookie header. */
function sessionCookie(res: Awaited<ReturnType<typeof post>>): string {
    const sid = res.cookies.find(c => c.name === 'sid');
    return sid ? `sid=${sid.value}` : '';
}

describe('POST /api/auth/signup', () => {
    it('creates the account, starts a session and sets a hardened cookie', async () => {
        const res = await post('/api/auth/signup', yami);
        expect(res.statusCode).toBe(201);
        expect(res.json().user).toMatchObject({
            email: 'yami@example.com',
            duelistName: 'Yami',
            role: 'user',
            emailVerified: false,
            hasPassword: true,
        });
        expect(JSON.stringify(res.json())).not.toContain('passwordHash');

        const sid = res.cookies.find(c => c.name === 'sid');
        expect(sid).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
        expect(sid?.maxAge).toBe(30 * 24 * 60 * 60);

        const me = await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(res) } });
        expect(me.statusCode).toBe(200);
        expect(me.json().user.duelistName).toBe('Yami');
    });

    it('rejects a taken email or duelist name, ignoring case and spacing', async () => {
        await post('/api/auth/signup', yami);

        const sameEmail = await post('/api/auth/signup', { ...yami, email: 'yami@example.com', duelistName: 'Other' });
        expect(sameEmail.statusCode).toBe(409);
        expect(sameEmail.json().field).toBe('email');

        const sameName = await post('/api/auth/signup', { ...yami, email: 'other@example.com', duelistName: '  yAMI ' });
        expect(sameName.statusCode).toBe(409);
        expect(sameName.json().field).toBe('duelistName');
    });

    it('validates input and rejects unknown keys, including a self-assigned role', async () => {
        const weak = await post('/api/auth/signup', { ...yami, password: 'short' });
        expect(weak.statusCode).toBe(400);
        expect(weak.json().issues[0].path).toBe('password');

        const admin = await post('/api/auth/signup', { ...yami, role: 'admin' });
        expect(admin.statusCode).toBe(400);

        expect((await post('/api/auth/signup', undefined)).statusCode).toBe(400);
    });
});

describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        await post('/api/auth/signup', yami);
    });

    it('signs in by email or by duelist name', async () => {
        const byEmail = await post('/api/auth/login', { identifier: 'YAMI@example.com', password: yami.password });
        expect(byEmail.statusCode).toBe(200);
        expect(sessionCookie(byEmail)).not.toBe('');

        const byName = await post('/api/auth/login', { identifier: 'yami', password: yami.password });
        expect(byName.statusCode).toBe(200);
        expect(byName.json().user.email).toBe('yami@example.com');
    });

    it('answers a wrong password, an unknown email and an unknown name identically', async () => {
        const wrongPassword = await post('/api/auth/login', { identifier: 'yami', password: 'nope nope nope' });
        const unknownEmail = await post('/api/auth/login', { identifier: 'who@example.com', password: yami.password });
        const unknownName = await post('/api/auth/login', { identifier: 'Nobody', password: yami.password });

        for (const res of [wrongPassword, unknownEmail, unknownName]) {
            expect(res.statusCode).toBe(401);
            expect(res.cookies.find(c => c.name === 'sid')).toBeUndefined();
        }
        expect(unknownEmail.json()).toEqual(wrongPassword.json());
        expect(unknownName.json()).toEqual(wrongPassword.json());
    });

    it('rate-limits repeated attempts', async () => {
        // Sequential: the limiter counts per route, and parallel injects race its counter.
        const attempts = [];
        for (let i = 0; i < 15; i++) {
            attempts.push(await post('/api/auth/login', { identifier: 'yami', password: 'wrong wrong' }));
        }
        expect(attempts.filter(res => res.statusCode === 401)).toHaveLength(10);
        expect(attempts.filter(res => res.statusCode === 429)).toHaveLength(5);
    });
});

describe('POST /api/auth/logout and GET /api/auth/me', () => {
    it('logout ends the session server-side, so the old cookie stops working', async () => {
        const signup = await post('/api/auth/signup', yami);
        const sid = sessionCookie(signup);

        const out = await post('/api/auth/logout', undefined, { cookie: sid });
        expect(out.statusCode).toBe(204);

        const me = await app.inject({ url: '/api/auth/me', headers: { cookie: sid } });
        expect(me.json().user).toBeNull();
    });

    it('me answers null without a valid session', async () => {
        for (const headers of [{}, { cookie: 'sid=forged' }]) {
            const res = await app.inject({ url: '/api/auth/me', headers });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ user: null });
        }
    });
});

describe('GET /api/auth/duelist-name-available', () => {
    it('reports free, taken and invalid names', async () => {
        await post('/api/auth/signup', yami);
        const check = async (name: string) => (await app.inject({ url: '/api/auth/duelist-name-available', query: { name } })).json();

        expect(await check('Kaiba')).toEqual({ available: true });
        expect(await check(' yami')).toMatchObject({ available: false, reason: 'Already taken' });
        expect(await check('x')).toMatchObject({ available: false });
    });
});

describe('origin check', () => {
    it('blocks a state-changing request from another origin, before any side effect', async () => {
        const res = await post('/api/auth/signup', yami, { origin: 'https://evil.example' });
        expect(res.statusCode).toBe(403);
        const login = await post('/api/auth/login', { identifier: 'yami', password: yami.password });
        expect(login.statusCode).toBe(401); // the account was never created
    });

    it('allows the same origin and listed origins, and never blocks reads', async () => {
        const same = await post('/api/auth/signup', yami, { origin: 'http://localhost:4000', host: 'localhost:4000' });
        expect(same.statusCode).toBe(201);

        await app.close();
        ({ app } = await testApp(mongo, { ALLOWED_ORIGINS: 'http://localhost:3000, https://app.example' }));
        const allowed = await post('/api/auth/signup', yami, { origin: 'http://localhost:3000' });
        expect(allowed.statusCode).toBe(201);

        const read = await app.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
        expect(read.statusCode).toBe(200);
    });
});

describe('requireAuth and requireAdmin', () => {
    it('answer 401 signed out, 403 for a plain user and pass an admin', async () => {
        // A bare server sharing the app's database, so the middleware is tested on its own.
        const probe = Fastify();
        await probe.register(cookie);
        probe.decorate('db', app.db);
        probe.decorateRequest('user', null);
        probe.get('/auth', { preHandler: requireAuth }, async () => ({ ok: true }));
        probe.get('/admin', { preHandler: requireAdmin }, async () => ({ ok: true }));
        await probe.ready();

        expect((await probe.inject({ url: '/admin' })).statusCode).toBe(401);

        const cookieHeader = sessionCookie(await post('/api/auth/signup', yami));
        const get = (url: string) => probe.inject({ url, headers: { cookie: cookieHeader } });
        expect((await get('/auth')).statusCode).toBe(200);
        expect((await get('/admin')).statusCode).toBe(403);

        await app.db.collection('users').updateOne({ duelistNameKey: 'yami' }, { $set: { role: 'admin' } });
        expect((await get('/admin')).statusCode).toBe(200);
        await probe.close();
    });
});
