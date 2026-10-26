import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
    mongo = await startMongo();
});

afterAll(async () => {
    await mongo.stop();
});

describe('config', () => {
    it('rejects a missing MONGODB_URI without echoing other values', () => {
        expect(() => loadConfig({ NODE_ENV: 'test', SECRET_THING: 'hunter2' })).toThrow(/MONGODB_URI/);
        expect(() => loadConfig({ NODE_ENV: 'test', SECRET_THING: 'hunter2' })).not.toThrow(/hunter2/);
    });

    it('applies defaults', () => {
        const config = loadConfig({ MONGODB_URI: 'mongodb://x' });
        expect(config).toMatchObject({ NODE_ENV: 'development', PORT: 4000, MONGODB_DB: 'ygo-progression' });
    });
});

describe('API', () => {
    it('GET /api/health reports the database as up', async () => {
        const { app } = await testApp(mongo);
        const res = await app.inject({ method: 'GET', url: '/api/health' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok', db: 'up' });
        await app.close();
    });

    it('sends security headers, including a CSP that allows the card art host', async () => {
        const { app } = await testApp(mongo, { IMAGE_HOST: 'https://images.example.dev' });
        const res = await app.inject({ method: 'GET', url: '/api/health' });
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        const csp = String(res.headers['content-security-policy']);
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain('https://images.example.dev');
        await app.close();
    });

    it('answers unknown API routes with a JSON 404', async () => {
        const { app } = await testApp(mongo);
        const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'Not Found' });
        await app.close();
    });

    it('rate-limits API requests', async () => {
        const { app } = await testApp(mongo);
        const responses = await Promise.all(Array.from({ length: 320 }, () => app.inject({ url: '/api/health' })));
        expect(responses[0]?.headers['x-ratelimit-limit']).toBe('300');
        expect(responses.some(res => res.statusCode === 429)).toBe(true);
        await app.close();
    });
});

describe('static site', () => {
    let webDist: string;

    beforeAll(async () => {
        webDist = await mkdtemp(path.join(tmpdir(), 'ygo-web-'));
        await writeFile(path.join(webDist, 'index.html'), '<p>home</p>');
        await writeFile(path.join(webDist, '404.html'), '<p>lost</p>');
        await mkdir(path.join(webDist, 'menu', '__next.menu'), { recursive: true });
        await writeFile(path.join(webDist, 'menu', 'index.html'), '<p>menu</p>');
        await writeFile(path.join(webDist, 'menu', '__next.menu.txt'), 'menu segment');
        await writeFile(path.join(webDist, 'menu', '__next.menu', '__PAGE__.txt'), 'menu page payload');
    });

    afterAll(async () => {
        await rm(webDist, { recursive: true, force: true });
    });

    it('serves exported pages, redirecting to their trailing-slash form', async () => {
        const { app } = await testApp(mongo, { WEB_DIST: webDist });

        expect((await app.inject({ url: '/' })).body).toContain('home');
        expect((await app.inject({ url: '/menu/' })).body).toContain('menu');

        const redirect = await app.inject({ url: '/menu' });
        expect(redirect.statusCode).toBe(301);
        expect(redirect.headers.location).toBe('/menu/');

        const missing = await app.inject({ url: '/nowhere/' });
        expect(missing.statusCode).toBe(404);
        expect(missing.body).toContain('lost');

        // API misses stay JSON even when the site is served.
        expect((await app.inject({ url: '/api/nope' })).json()).toEqual({ error: 'Not Found' });
        await app.close();
    });

    it("maps Next's dotted segment-prefetch requests onto the exported folders", async () => {
        const { app } = await testApp(mongo, { WEB_DIST: webDist });

        const page = await app.inject({ url: '/menu/__next.menu.__PAGE__.txt?_rsc=abc12' });
        expect(page.statusCode).toBe(200);
        expect(page.body).toBe('menu page payload');

        // Files that exist under their own name are served as-is.
        expect((await app.inject({ url: '/menu/__next.menu.txt' })).body).toBe('menu segment');
        // Traversal attempts stay unresolved.
        expect((await app.inject({ url: '/menu/..%2F..%2F__next.x.y.txt' })).statusCode).toBe(404);
        await app.close();
    });

    it('never rate-limits static assets', async () => {
        const { app } = await testApp(mongo, { WEB_DIST: webDist });
        const pages = await Promise.all(Array.from({ length: 320 }, () => app.inject({ url: '/menu/' })));
        expect(pages.every(res => res.statusCode === 200)).toBe(true);
        expect(pages[0]?.headers['x-ratelimit-limit']).toBeUndefined();
        await app.close();
    });
});
