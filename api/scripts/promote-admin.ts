// Grants (or removes) admin rights, which unlock dev mode. There is no web route for this on purpose.
// Run from the repo root:
//   npm run promote-admin -w @ygo/api -- <email or duelist name> [--demote] [--allow-unverified]
import { MongoClient } from 'mongodb';
import { setUserRole } from '../src/auth/admin';
import { loadConfig } from '../src/config';

const args = process.argv.slice(2);
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const identifier = args.find(arg => !arg.startsWith('--'));

if (!identifier) {
    console.error('Usage: npm run promote-admin -w @ygo/api -- <email or duelist name> [--demote] [--allow-unverified]');
    process.exit(2);
}

const config = loadConfig();
const client = new MongoClient(config.MONGODB_URI, { appName: 'ygo-progression-admin' });

try {
    await client.connect();
    const role = flags.has('--demote') ? 'user' : 'admin';
    const result = await setUserRole(client.db(config.MONGODB_DB), identifier, role, { allowUnverified: flags.has('--allow-unverified') });

    switch (result.status) {
        case 'not-found':
            console.error(`No account matches "${identifier}" in "${config.MONGODB_DB}".`);
            process.exitCode = 1;
            break;
        case 'unverified':
            console.error(
                `${result.user.duelistName} hasn't confirmed their email, so they were not promoted.\n` +
                    'Confirm the address first (or sign in with Google), or add --allow-unverified if you are sure it is yours.',
            );
            process.exitCode = 1;
            break;
        case 'unchanged':
            console.log(`${result.user.duelistName} (${result.user.email}) is already ${result.to === 'admin' ? 'an admin' : 'a regular user'}.`);
            break;
        case 'changed':
            console.log(`${result.user.duelistName} (${result.user.email}): ${result.from} -> ${result.to}`);
            break;
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    await client.close();
}
