import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import type { Mail, Mailer } from '../src/mail/mailer';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;
let sent: Mail[];
let failSending = false;

const recorder: Mailer = {
    async send(mail) {
        if (failSending) throw new Error('smtp is down');
        sent.push(mail);
    },
};

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    sent = [];
    failSending = false;
    ({ app } = await testApp(mongo, { WEB_URL: 'https://app.example' }, { mailer: recorder }));
});
afterEach(async () => {
    await app.close();
});

const yami = { email: 'yami@example.com', password: 'heart of the cards', duelistName: 'Yami' };

const post = (url: string, payload?: unknown, cookie?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, ...(cookie ? { headers: { cookie } } : {}) });

const signUp = async () => {
    const res = await post('/api/auth/signup', yami);
    await app.settleBackground();
    return `sid=${res.cookies.find(c => c.name === 'sid')!.value}`;
};

/** The one-time token in the link of an email, plus which kind of link it is. */
function linkOf(mail: Mail): { url: URL; kind: 'verify' | 'reset'; token: string } {
    const url = new URL(/https?:\/\/\S+/.exec(mail.text)![0]);
    const kind = url.searchParams.has('verify') ? 'verify' : 'reset';
    return { url, kind, token: url.searchParams.get(kind)! };
}

const me = (cookie: string) => app.inject({ url: '/api/auth/me', headers: { cookie } });

describe('email verification', () => {
    it('emails a link at sign-up, and following it confirms the address once', async () => {
        const cookie = await signUp();

        expect(sent).toHaveLength(1);
        const mail = sent[0]!;
        expect(mail.to).toBe('yami@example.com');
        expect(mail.text).toContain('Yami');
        const { url, kind, token } = linkOf(mail);
        expect(kind).toBe('verify');
        expect(url.origin + url.pathname).toBe('https://app.example/');

        expect((await me(cookie)).json().user.emailVerified).toBe(false);

        // No sign-in needed: the link may be opened in another browser.
        expect((await post('/api/auth/verify', { token })).statusCode).toBe(204);
        expect((await me(cookie)).json().user.emailVerified).toBe(true);

        expect((await post('/api/auth/verify', { token })).statusCode).toBe(400);
    });

    it('rejects an unknown token, a malformed body and an expired token', async () => {
        await signUp();
        const { token } = linkOf(sent[0]!);

        expect((await post('/api/auth/verify', { token: 'nonsense' })).statusCode).toBe(400);
        expect((await post('/api/auth/verify', {})).statusCode).toBe(400);
        expect((await post('/api/auth/verify', { token, extra: 1 })).statusCode).toBe(400);

        await app.db.collection('authTokens').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        expect((await post('/api/auth/verify', { token })).statusCode).toBe(400);
    });

    it('re-sends on request, cancelling the earlier link, and stays quiet once verified', async () => {
        const cookie = await signUp();
        const first = linkOf(sent[0]!).token;

        expect((await post('/api/auth/verify/send', undefined, cookie)).statusCode).toBe(204);
        await app.settleBackground();
        expect(sent).toHaveLength(2);
        const second = linkOf(sent[1]!).token;
        expect(second).not.toBe(first);

        expect((await post('/api/auth/verify', { token: first })).statusCode).toBe(400);
        expect((await post('/api/auth/verify', { token: second })).statusCode).toBe(204);

        await post('/api/auth/verify/send', undefined, cookie);
        await app.settleBackground();
        expect(sent).toHaveLength(2);

        expect((await post('/api/auth/verify/send')).statusCode).toBe(401);
    });

    it('does not let a failing mail server break sign-up', async () => {
        failSending = true;
        const res = await post('/api/auth/signup', yami);
        await app.settleBackground();
        expect(res.statusCode).toBe(201);
        expect(sent).toHaveLength(0);
    });

    it('will not use a reset link as a verification link, or the reverse', async () => {
        await signUp();
        await post('/api/auth/password/forgot', { email: yami.email });
        await app.settleBackground();
        const verify = linkOf(sent[0]!).token;
        const reset = linkOf(sent[1]!).token;

        expect((await post('/api/auth/verify', { token: reset })).statusCode).toBe(400);
        expect((await post('/api/auth/password/reset', { token: verify, password: 'a brand new password' })).statusCode).toBe(400);
    });
});

describe('password reset', () => {
    it('emails a link; using it sets the password, confirms the address and signs everything out', async () => {
        const cookie = await signUp();
        const other = await post('/api/auth/login', { identifier: 'yami', password: yami.password });
        const otherCookie = `sid=${other.cookies.find(c => c.name === 'sid')!.value}`;
        sent.length = 0;

        expect((await post('/api/auth/password/forgot', { email: 'YAMI@example.com' })).statusCode).toBe(204);
        await app.settleBackground();
        expect(sent).toHaveLength(1);
        const { kind, token } = linkOf(sent[0]!);
        expect(kind).toBe('reset');

        const reset = await post('/api/auth/password/reset', { token, password: 'a brand new password' });
        expect(reset.statusCode).toBe(204);

        expect((await me(cookie)).json().user).toBeNull();
        expect((await me(otherCookie)).json().user).toBeNull();
        expect((await post('/api/auth/login', { identifier: 'yami', password: yami.password })).statusCode).toBe(401);
        const login = await post('/api/auth/login', { identifier: 'yami', password: 'a brand new password' });
        expect(login.statusCode).toBe(200);
        expect(login.json().user.emailVerified).toBe(true);

        // One use only.
        expect((await post('/api/auth/password/reset', { token, password: 'yet another password' })).statusCode).toBe(400);
    });

    it('answers the same, and sends nothing, for an email with no account', async () => {
        await signUp();
        sent.length = 0;

        const known = await post('/api/auth/password/forgot', { email: yami.email });
        const unknown = await post('/api/auth/password/forgot', { email: 'nobody@example.com' });
        await app.settleBackground();

        expect(known.statusCode).toBe(204);
        expect(unknown.statusCode).toBe(204);
        expect(known.body).toBe(unknown.body);
        expect(sent.map(mail => mail.to)).toEqual(['yami@example.com']);

        expect((await post('/api/auth/password/forgot', { email: 'not an email' })).statusCode).toBe(400);
    });

    it('keeps the link alive when the new password is rejected', async () => {
        await signUp();
        await post('/api/auth/password/forgot', { email: yami.email });
        await app.settleBackground();
        const { token } = linkOf(sent[1]!);

        expect((await post('/api/auth/password/reset', { token, password: 'short' })).statusCode).toBe(400);
        expect((await post('/api/auth/password/reset', { token, password: 'long enough now' })).statusCode).toBe(204);
    });

    it('only honours the newest link, and refuses an expired one', async () => {
        await signUp();
        sent.length = 0;
        await post('/api/auth/password/forgot', { email: yami.email });
        await app.settleBackground();
        await post('/api/auth/password/forgot', { email: yami.email });
        await app.settleBackground();
        const [older, newest] = sent.map(mail => linkOf(mail).token);
        expect(sent).toHaveLength(2);

        expect((await post('/api/auth/password/reset', { token: older, password: 'long enough now' })).statusCode).toBe(400);
        expect((await post('/api/auth/password/reset', { token: newest, password: 'long enough now' })).statusCode).toBe(204);

        await post('/api/auth/password/forgot', { email: yami.email });
        await app.settleBackground();
        const fresh = linkOf(sent.at(-1)!).token;
        await app.db.collection('authTokens').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        expect((await post('/api/auth/password/reset', { token: fresh, password: 'another long one' })).statusCode).toBe(400);
    });

    it('lets a Google-only account set a password by proving it owns the address', async () => {
        await app.db.collection('users').insertOne({
            email: 'joey@example.com',
            emailVerified: true,
            duelistName: 'Joey',
            duelistNameKey: 'joey',
            googleSub: 'g-1',
            role: 'user',
            createdAt: new Date(),
        });
        await post('/api/auth/password/forgot', { email: 'joey@example.com' });
        await app.settleBackground();
        const { token } = linkOf(sent[0]!);

        expect((await post('/api/auth/password/reset', { token, password: 'a brand new password' })).statusCode).toBe(204);
        const login = await post('/api/auth/login', { identifier: 'joey', password: 'a brand new password' });
        expect(login.json().user).toMatchObject({ hasPassword: true, hasGoogle: true });
    });
});

describe('mail configuration', () => {
    it('strips the spaces Google shows in an app password', () => {
        const config = loadConfig({ MONGODB_URI: 'mongodb://x', SMTP_USER: 'me@gmail.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop' });
        expect(config.SMTP_PASSWORD).toBe('abcdefghijklmnop');
        expect(config).toMatchObject({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465 });
    });
});
