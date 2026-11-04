import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppOptions } from '../src/app';
import { loadConfig, type Config } from '../src/config';

/**
 * An in-memory MongoDB for tests. A single-node replica set rather than a bare
 * server, because the game services rely on multi-document transactions.
 */
export async function startMongo(): Promise<MongoMemoryReplSet> {
    return MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
}

/** Builds the app against `mongo`, with any env overrides, ready for `app.inject`. */
export async function testApp(
    mongo: MongoMemoryReplSet,
    env: Record<string, string> = {},
    options: Pick<AppOptions, 'googleFetch'> = {},
): Promise<{ app: FastifyInstance; config: Config }> {
    const config = loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: mongo.getUri(),
        MONGODB_DB: `test-${crypto.randomUUID()}`,
        ...env,
    });
    const app = await buildApp({ config, ...options });
    await app.ready();
    return { app, config };
}
