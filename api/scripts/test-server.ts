// The real API on a throwaway in-memory MongoDB, with outgoing email captured
// instead of sent, for driving the web app in a browser (web/scripts/drivers).
// Nothing here touches Atlas or Gmail. Run from the repo root:
//
//   npm run test-server -w @ygo/api            # http://localhost:4100
//
// Captured email is readable at GET /__test/mail (cleared by DELETE /__test/mail).
// POST /__test/reward { seriesId, duelistName, prizeId } books a reward for a player.
// Start the web dev server pointing at it:  NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//
// When api/.env has MONGODB_URI, the synced card data is copied (read-only) from
// that database, so packs and rewards work; nothing is ever written back to it.
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Mail } from '../src/mail/mailer';

const port = Number(process.env.TEST_PORT ?? 4100);
const webOrigin = process.env.WEB_URL ?? 'http://localhost:3000';

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const sent: Mail[] = [];

const config = loadConfig({
    NODE_ENV: 'development',
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB: 'browser-test',
    PORT: String(port),
    PUBLIC_URL: `http://localhost:${port}`,
    WEB_URL: webOrigin,
    ALLOWED_ORIGINS: webOrigin,
    // A built web app (WEB_DIST=../web/out) is served from this origin too, as in production.
    ...(process.env.WEB_DIST ? { WEB_DIST: process.env.WEB_DIST } : {}),
    ...(process.env.IMAGE_HOST ? { IMAGE_HOST: process.env.IMAGE_HOST } : {}),
});

const app = await buildApp({
    config,
    logger: false,
    mailer: {
        async send(mail) {
            sent.push(mail);
        },
    },
});

if (process.env.MONGODB_URI) {
    const source = await new MongoClient(process.env.MONGODB_URI).connect();
    const from = source.db(process.env.MONGODB_DB ?? 'ygo-progression');
    for (const name of ['cardSets', 'cards']) {
        const docs = await from.collection(name).find().toArray();
        if (docs.length) await app.db.collection(name).insertMany(docs);
        console.log(`Copied ${docs.length} ${name}`);
    }
    await source.close();
}

// Books a reward that only the wheel gives out at random, so drivers can claim it.
app.post('/__test/reward', async (request, reply) => {
    const { seriesId, duelistName, prizeId } = request.body as { seriesId: string; duelistName: string; prizeId: string };
    const series = await app.db.collection('series').findOne({ _id: new ObjectId(seriesId) });
    const user = await app.db.collection('users').findOne({ duelistName });
    if (!series || !user) return reply.code(404).send({ error: 'No such series or duelist' });
    const reward = {
        id: crypto.randomUUID(),
        prizeId,
        wonFromPackName: series.currentSetName,
        wonFromSetIndex: series.currentSetIndex,
        wonDate: new Date().toISOString(),
        status: 'available',
    };
    await app.db.collection('seriesPlayers').updateOne({ seriesId: series._id, userId: user._id }, { $push: { rewards: reward } } as never);
    return reward;
});

app.get('/__test/mail', async () => sent);
app.delete('/__test/mail', async (_request, reply) => {
    sent.length = 0;
    return reply.code(204).send();
});

const shutdown = async () => {
    await app.close();
    await mongo.stop();
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: '127.0.0.1', port });
console.log(`Test API on http://localhost:${port} (in-memory DB, mail captured at /__test/mail)`);
