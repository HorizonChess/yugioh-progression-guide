import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import createCore, { type OcgCardData, type OcgCoreSync } from 'ocgcore-wasm';

/*
 * EDOPro's rules engine (ocgcore, AGPL-3.0) as WebAssembly, with the card scripts, card data
 * and system strings that `npm run fetch-engine` downloads into api/engine-data. One engine
 * serves every duel: the WASM core is synchronous, so duels never run at the same instant.
 */

interface CardRow {
    alias: number;
    setcode: string;
    type: number;
    atk: number;
    def: number;
    level: number;
    race: string;
    attribute: number;
    name: string;
    strs: string[];
}

export interface Engine {
    core: OcgCoreSync;
    /** The pinned commits the data came from, stored with each duel (a replay needs the same ones). */
    version: string;
    cardData(code: number): OcgCardData | null;
    readScript(name: string): string | null;
    name(code: number): string;
    /** The text of an effect description id: a card's own string, or a system string. */
    describe(description: bigint | number): string;
    victoryReason(reason: number): string;
    /** A card's passcode by its exact name (case ignored), for "declare a card name". */
    codeByName(name: string): number | null;
    isMonster(code: number): boolean;
    baseAttack(code: number): number;
}

const TYPE_MONSTER = 0x1;
const TYPE_LINK = 0x4000000;

/** Where the engine data lives: next to the source in development, next to dist/ when built. */
function findDataDir(): string {
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

let loading: Promise<Engine> | null = null;

/** The engine, loaded once (about a second: the WASM core and 15k cards). */
export function loadEngine(): Promise<Engine> {
    loading ??= build();
    return loading;
}

async function build(): Promise<Engine> {
    const dir = findDataDir();
    const rows = JSON.parse(readFileSync(path.join(dir, 'cards.json'), 'utf-8')) as Record<string, CardRow>;
    const strings = JSON.parse(readFileSync(path.join(dir, 'strings.json'), 'utf-8')) as { system: Record<string, string>; victory: Record<string, string> };
    const scriptsDir = path.join(dir, 'scripts');
    const version = readFileSync(path.join(dir, 'version.json'), 'utf-8');
    const core = await createCore({ sync: true });

    const byName = new Map<string, number>();
    for (const [code, row] of Object.entries(rows)) if (!row.alias) byName.set(row.name.toLowerCase(), Number(code));

    const data = new Map<number, OcgCardData>();
    const scripts = new Map<string, string | null>();
    const row = (code: number) => rows[String(code)];

    return {
        core,
        version,
        cardData(code) {
            const cached = data.get(code);
            if (cached) return cached;
            const r = row(code);
            if (!r) return null;
            const set = BigInt(r.setcode);
            const link = (r.type & TYPE_LINK) !== 0;
            const card: OcgCardData = {
                code, alias: r.alias,
                setcodes: [0n, 16n, 32n, 48n].map((s) => Number((set >> s) & 0xffffn)).filter(Boolean),
                type: r.type, level: r.level & 0xff, lscale: (r.level >> 24) & 0xff, rscale: (r.level >> 16) & 0xff,
                attribute: r.attribute, race: BigInt(r.race), attack: r.atk,
                defense: link ? 0 : r.def, link_marker: link ? r.def : 0,
            };
            data.set(code, card);
            return card;
        },
        readScript(name) {
            if (scripts.has(name)) return scripts.get(name)!;
            // Only plain script names: never a path out of the scripts folder.
            if (!/^[\w.-]+\.lua$/.test(name)) return null;
            const file = /^c\d+\.lua$/.test(name) ? path.join(scriptsDir, 'official', name) : path.join(scriptsDir, name);
            // Normal Monsters have no script; the engine asks anyway.
            const text = existsSync(file) ? readFileSync(file, 'utf-8') : null;
            scripts.set(name, text);
            return text;
        },
        name: (code) => row(code)?.name ?? `Card ${code}`,
        describe(description) {
            const d = BigInt(description);
            const code = Number(d >> 20n), index = Number(d & 0xfffffn);
            if (code) return row(code)?.strs[index] || `${row(code)?.name ?? 'Card'}: use this effect`;
            return strings.system[String(index)] ?? '';
        },
        victoryReason: (reason) => strings.victory[String(reason)] ?? 'The duel is over',
        codeByName: (name) => byName.get(name.trim().toLowerCase()) ?? null,
        isMonster: (code) => ((row(code)?.type ?? 0) & TYPE_MONSTER) !== 0,
        baseAttack: (code) => row(code)?.atk ?? 0,
    };
}
