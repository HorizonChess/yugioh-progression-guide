// Mirrors YGOPRODeck's set and card data into MongoDB (see src/cards/sync.ts).
// Run from api/: `npm run sync-cards` (add `-- --allow-shrink` to accept a smaller dataset).
import { MongoClient } from 'mongodb';
import { loadConfig } from '../src/config';
import { syncCardData, ygoprodeckSource } from '../src/cards/sync';

const config = loadConfig();
const client = new MongoClient(config.MONGODB_URI, { appName: 'ygo-progression-sync' });

try {
    await client.connect();
    const started = Date.now();
    const report = await syncCardData(client.db(config.MONGODB_DB), ygoprodeckSource(), {
        allowShrink: process.argv.includes('--allow-shrink'),
    });
    console.log(`Synced into "${config.MONGODB_DB}" in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.table(report);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    await client.close();
}
