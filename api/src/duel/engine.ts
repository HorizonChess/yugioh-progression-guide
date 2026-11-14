import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import createCore from 'ocgcore-wasm';
import { createEngine, type CardRow, type Engine } from '@ygo/duel/engine';

/*
 * The engine on the server, from the card scripts, card data and system strings that
 * `npm run fetch-engine` downloads into api/engine-data. The engine itself is in @ygo/duel
 * (the bot also runs it in the player's browser).
 */

export { engineFaulted, type Engine } from '@ygo/duel/engine';

/** Where the engine data lives: next to the source in development, next to dist/ when built. */
export function findDataDir(): string {
    const fromEnv = process.env.ENGINE_DATA;
    const candidates = [fromEnv, path.resolve(import.meta.dirname, '../engine-data'), path.resolve(import.meta.dirname, '../../engine-data')];
    for (const dir of candidates) if (dir && existsSync(path.join(dir, 'version.json'))) return dir;
    throw new Error('Duel engine data is missing: run `npm run fetch-engine -w @ygo/api`');
}

export function engineDataAvailable(): boolean {
    try {
        findDataDir();
        return true;
    } catch {
        return false;
    }
}

/** Where a script is in api/engine-data/scripts: card scripts in official/, or (older versions) pre-errata/ or goat/. */
export function scriptFile(scriptsDir: string, name: string): string | null {
    if (!/^[\w.-]+\.lua$/.test(name)) return null;
    const file = /^c\d+\.lua$/.test(name)
        ? ['official', 'pre-errata', 'goat'].map((d) => path.join(scriptsDir, d, name)).find((f) => existsSync(f))
        : path.join(scriptsDir, name);
    return file && existsSync(file) ? file : null;
}

let loading: Promise<Engine> | null = null;

/** The engine, loaded once (about a second: the WASM core and 15k cards). */
export function loadEngine(): Promise<Engine> {
    loading ??= build();
    return loading;
}

async function build(): Promise<Engine> {
    const dir = findDataDir();
    const scriptsDir = path.join(dir, 'scripts');
    return createEngine({
        core: await createCore({ sync: true }),
        newCore: () => createCore({ sync: true }),
        version: readFileSync(path.join(dir, 'version.json'), 'utf-8'),
        rows: JSON.parse(readFileSync(path.join(dir, 'cards.json'), 'utf-8')) as Record<string, CardRow>,
        strings: JSON.parse(readFileSync(path.join(dir, 'strings.json'), 'utf-8')),
        readFile(name) {
            const file = scriptFile(scriptsDir, name);
            return file ? readFileSync(file, 'utf-8') : null;
        },
    });
}
