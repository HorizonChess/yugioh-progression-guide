import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMongo, testApp } from './helpers';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const ENV = {
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'test-secret',
    PUBLIC_URL: 'http://localhost:4000',
    WEB_URL: 'http://localhost:3000',
};

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

/** What the fake Google will say about the next sign-in, and what it was asked. */
let google: {
    claims: Record<string, unknown>;
    tokenStatus: number;
    requests: URLSearchParams[];
};

const b64 = (text: string) => Buffer.from(text).toString('base64url');
const jwt = (claims: Record<string, unknown>) => [b64('{"alg":"none"}'), b64(JSON.stringify(claims)), 'sig'].join('.');

const fakeGoogle: typeof fetch = async (_url, init) => {
    google.requests.push(new URLSearchParams(String(init?.body)));
    if (google.tokenStatus !== 200) return new Response('{}', { status: google.tokenStatus });
    return Response.json({ id_token: jwt(google.claims) });
};

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    google = { claims: {}, tokenStatus: 200, requests: [] };
    ({ app } = await testApp(mongo, ENV, { googleFetch: fakeGoogle }));
});
afterEach(async () => {
    await app.close();
});

const cookieHeader = (res: { cookies: { name: string; value: string }[] }, ...names: string[]) =>
    res.cookies.filter(c => names.includes(c.name)).map(c => `${c.name}=${c.value}`).join('; ');

/** Begins a sign-in: what Google was sent, and the cookie the browser keeps. */
async function begin() {
    const res = await app.inject({ url: '/api/auth/google/start' });
    expect(res.statusCode).toBe(302);
    const url = new URL(String(res.headers.location));
    return {
        res,
        url,
        state: url.searchParams.get('state')!,
        nonce: url.searchParams.get('nonce')!,
        cookie: cookieHeader(res, 'g_state'),
    };
}

/** Google's id_token claims for a person, valid for the flow that `begin()` started. */
const claimsFor = (flow: { nonce: string }, over: Record<string, unknown> = {}) => ({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: 'google-sub-1',
    email: 'Joey@Example.com',
    email_verified: true,
    name: 'Joey Wheeler',
    nonce: flow.nonce,
    ...over,
});

const callback = (flow: { state: string; cookie: string }, query: Record<string, string> = {}) =>
    app.inject({
        url: '/api/auth/google/callback',
        query: { code: 'auth-code', state: flow.state, ...query },
        headers: { cookie: flow.cookie },
    });

const outcome = (res: { headers: { location?: string | string[] | undefined } }) =>
    new URL(String(res.headers.location)).searchParams.get('google');

const claimWith = (cookie: string, duelistName: string) =>
    app.inject({ method: 'POST', url: '/api/auth/google/claim', payload: { duelistName }, headers: { cookie } });

describe('GET /api/auth/google/start', () => {
    it('sends the browser to Google with state, nonce and a PKCE challenge, and binds the flow to a cookie', async () => {
        const flow = await begin();
        expect(flow.url.origin + flow.url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(Object.fromEntries(flow.url.searchParams)).toMatchObject({
            client_id: CLIENT_ID,
            redirect_uri: 'http://localhost:4000/api/auth/google/callback',
            response_type: 'code',
            scope: 'openid email profile',
            code_challenge_method: 'S256',
        });
        const stateCookie = flow.res.cookies.find(c => c.name === 'g_state');
        expect(stateCookie).toMatchObject({ value: flow.state, httpOnly: true, sameSite: 'Lax', path: '/api/auth/google' });
    });

    it('is not offered when Google credentials are not configured', async () => {
        await app.close();
        ({ app } = await testApp(mongo));
        expect((await app.inject({ url: '/api/auth/google/start' })).statusCode).toBe(404);
    });
});

describe('first-time sign-in', () => {
    it('exchanges the code with the PKCE verifier, then asks for a duelist name', async () => {
        const flow = await begin();
        google.claims = claimsFor(flow);

        const back = await callback(flow);
        expect(back.statusCode).toBe(302);
        expect(String(back.headers.location)).toBe('http://localhost:3000/menu/?google=claim');
        expect(back.cookies.find(c => c.name === 'sid')).toBeUndefined();

        const sent = google.requests[0]!;
        expect(sent.get('grant_type')).toBe('authorization_code');
        expect(sent.get('code')).toBe('auth-code');
        expect(sent.get('client_secret')).toBe('test-secret');
        const challenge = createHash('sha256').update(sent.get('code_verifier')!).digest('base64url');
        expect(challenge).toBe(flow.url.searchParams.get('code_challenge'));

        const claimCookie = cookieHeader(back, 'g_claim');
        const info = await app.inject({ url: '/api/auth/google/claim', headers: { cookie: claimCookie } });
        expect(info.json()).toEqual({ email: 'joey@example.com', name: 'Joey Wheeler' });

        const claim = await claimWith(claimCookie, 'Joey');
        expect(claim.statusCode).toBe(201);
        expect(claim.json().user).toMatchObject({
            email: 'joey@example.com',
            duelistName: 'Joey',
            emailVerified: true,
            hasGoogle: true,
            hasPassword: false,
        });

        const me = await app.inject({ url: '/api/auth/me', headers: { cookie: cookieHeader(claim, 'sid') } });
        expect(me.statusCode).toBe(200);

        // The ticket is spent.
        expect((await claimWith(claimCookie, 'Joey2')).statusCode).toBe(404);
    });

    it('keeps the ticket when the duelist name is taken, so another name can be tried', async () => {
        await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: { email: 'yami@example.com', password: 'heart of the cards', duelistName: 'Joey' },
        });

        const flow = await begin();
        google.claims = claimsFor(flow);
        const claimCookie = cookieHeader(await callback(flow), 'g_claim');

        const taken = await claimWith(claimCookie, ' joey ');
        expect(taken.statusCode).toBe(409);
        expect(taken.json().field).toBe('duelistName');

        expect((await claimWith(claimCookie, 'Katsuya')).statusCode).toBe(201);
    });

    it('rejects an invalid duelist name and a claim with no ticket', async () => {
        const flow = await begin();
        google.claims = claimsFor(flow);
        const claimCookie = cookieHeader(await callback(flow), 'g_claim');

        expect((await claimWith(claimCookie, 'x')).statusCode).toBe(400);
        expect((await claimWith('', 'Joey')).statusCode).toBe(404);
    });
});

describe('returning and linked sign-in', () => {
    it('signs a known Google account straight in', async () => {
        let flow = await begin();
        google.claims = claimsFor(flow);
        await claimWith(cookieHeader(await callback(flow), 'g_claim'), 'Joey');

        flow = await begin();
        google.claims = claimsFor(flow);
        const back = await callback(flow);
        expect(outcome(back)).toBe('ok');
        const me = await app.inject({ url: '/api/auth/me', headers: { cookie: cookieHeader(back, 'sid') } });
        expect(me.json().user.duelistName).toBe('Joey');
    });

    it('links Google to a password account with the same verified email', async () => {
        await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: { email: 'joey@example.com', password: 'heart of the cards', duelistName: 'Joey' },
        });
        await app.db.collection('users').updateOne({ email: 'joey@example.com' }, { $set: { emailVerified: true } });

        const flow = await begin();
        google.claims = claimsFor(flow);
        const back = await callback(flow);
        expect(outcome(back)).toBe('ok');

        const me = await app.inject({ url: '/api/auth/me', headers: { cookie: cookieHeader(back, 'sid') } });
        expect(me.json().user).toMatchObject({ duelistName: 'Joey', hasPassword: true, hasGoogle: true });
        const login = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { identifier: 'joey@example.com', password: 'heart of the cards' },
        });
        expect(login.statusCode).toBe(200);
    });

    it('takes over an unverified pre-registered email: the password is dropped and old sessions end', async () => {
        const signup = await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: { email: 'joey@example.com', password: 'attacker knows this', duelistName: 'Squatter' },
        });
        const attackerCookie = cookieHeader(signup, 'sid');

        const flow = await begin();
        google.claims = claimsFor(flow);
        const back = await callback(flow);
        expect(outcome(back)).toBe('ok');

        expect((await app.inject({ url: '/api/auth/me', headers: { cookie: attackerCookie } })).json().user).toBeNull();
        const login = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { identifier: 'joey@example.com', password: 'attacker knows this' },
        });
        expect(login.statusCode).toBe(401);
        const me = await app.inject({ url: '/api/auth/me', headers: { cookie: cookieHeader(back, 'sid') } });
        expect(me.json().user).toMatchObject({ emailVerified: true, hasPassword: false, hasGoogle: true });
    });
});

describe('refusals', () => {
    it('refuses a callback whose state does not match this browser, or that is replayed', async () => {
        const flow = await begin();
        google.claims = claimsFor(flow);

        expect(outcome(await callback({ state: flow.state, cookie: '' }))).toBe('failed');
        expect(outcome(await callback({ state: flow.state, cookie: 'g_state=other' }))).toBe('failed');
        expect(outcome(await callback({ state: 'forged', cookie: 'g_state=forged' }))).toBe('failed');
        expect(google.requests).toHaveLength(0);

        expect(outcome(await callback(flow))).toBe('claim');
        expect(outcome(await callback(flow))).toBe('failed'); // replay
    });

    it.each([
        ['another client', { aud: 'someone-else' }],
        ['a foreign issuer', { iss: 'https://evil.example' }],
        ['an expired token', { exp: 1 }],
        ['a different nonce', { nonce: 'not-ours' }],
        ['no email', { email: undefined }],
    ])('refuses an id_token for %s', async (_name, over) => {
        const flow = await begin();
        google.claims = claimsFor(flow, over);
        expect(outcome(await callback(flow))).toBe('failed');
        expect(await app.db.collection('users').countDocuments()).toBe(0);
    });

    it('refuses an unverified Google email, and handles Google errors and denial', async () => {
        let flow = await begin();
        google.claims = claimsFor(flow, { email_verified: false });
        expect(outcome(await callback(flow))).toBe('unverified');

        flow = await begin();
        google.tokenStatus = 400;
        expect(outcome(await callback(flow))).toBe('failed');

        flow = await begin();
        const denied = await app.inject({
            url: '/api/auth/google/callback',
            query: { error: 'access_denied', state: flow.state },
            headers: { cookie: flow.cookie },
        });
        expect(outcome(denied)).toBe('denied');
    });

    it('accepts email_verified sent as the string "true"', async () => {
        const flow = await begin();
        google.claims = claimsFor(flow, { email_verified: 'true' });
        expect(outcome(await callback(flow))).toBe('claim');
    });
});
