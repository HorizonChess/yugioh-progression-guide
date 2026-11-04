import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});

describe('CORS for local development', () => {
    it('lets a listed origin read responses and send its cookie, and answers preflights', async () => {
        const { app } = await testApp(mongo, { ALLOWED_ORIGINS: 'http://localhost:3000' });

        const read = await app.inject({ url: '/api/health', headers: { origin: 'http://localhost:3000' } });
        expect(read.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        expect(read.headers['access-control-allow-credentials']).toBe('true');
        expect(read.headers.vary).toContain('Origin');

        const preflight = await app.inject({
            method: 'OPTIONS',
            url: '/api/auth/login',
            headers: {
                origin: 'http://localhost:3000',
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'content-type',
            },
        });
        expect(preflight.statusCode).toBe(204);
        expect(preflight.headers['access-control-allow-methods']).toContain('POST');
        expect(preflight.headers['access-control-allow-headers']).toBe('content-type');
        await app.close();
    });

    it('gives other origins nothing, and nothing at all when none are listed', async () => {
        const { app } = await testApp(mongo, { ALLOWED_ORIGINS: 'http://localhost:3000' });
        const other = await app.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } });
        expect(other.headers['access-control-allow-origin']).toBeUndefined();
        await app.close();

        const { app: plain } = await testApp(mongo);
        const res = await plain.inject({ url: '/api/health', headers: { origin: 'http://localhost:3000' } });
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
        await plain.close();
    });
});
