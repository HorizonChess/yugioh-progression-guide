import { MongoClient, type Db } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config';

declare module 'fastify' {
    interface FastifyInstance {
        mongo: MongoClient;
        db: Db;
    }
}

/**
 * Connects to MongoDB and exposes the client and database on the app. The
 * connection closes with the app, so tests and graceful shutdown don't leak it.
 */
export async function connectDb(app: FastifyInstance, config: Config): Promise<void> {
    const client = new MongoClient(config.MONGODB_URI, {
        appName: 'ygo-progression-api',
        serverSelectionTimeoutMS: 10_000,
    });
    await client.connect();

    app.decorate('mongo', client);
    app.decorate('db', client.db(config.MONGODB_DB));
    app.addHook('onClose', async () => {
        await client.close();
    });
}
