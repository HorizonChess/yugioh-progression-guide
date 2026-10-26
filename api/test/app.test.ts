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
