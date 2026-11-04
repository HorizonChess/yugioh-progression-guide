// The real API on a throwaway in-memory MongoDB, with outgoing email captured
// instead of sent, for driving the web app in a browser (web/scripts/drivers).
// Nothing here touches Atlas or Gmail. Run from the repo root:
//
//   npm run test-server -w @ygo/api            # http://localhost:4100
//
// Captured email is readable at GET /__test/mail (cleared by DELETE /__test/mail).
// Start the web dev server pointing at it:  NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Mail } from '../src/mail/mailer';

const port = Number(process.env.PORT ?? 4100);
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
