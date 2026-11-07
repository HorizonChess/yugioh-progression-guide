// Downloads what the duel engine needs into api/engine-data (gitignored), pinned to exact
// commits: a duel is replayed from its seed and answers, so it must always meet the same
// card scripts. Run from the repo root (the build does this):
//
//   npm run fetch-engine -w @ygo/api
//
// - Card scripts: ProjectIgnis/CardScripts (AGPL-3.0), the root rule library and `official/`.
// - Card data: ProjectIgnis/BabelCDB cards.cdb (SQLite), turned into cards.json.
// - System strings (effect prompts like "Activate the effect?"): ProjectIgnis/Distribution strings.conf.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const ENGINE_PINS = {
    scripts: '4dc7e9d06ef710dbec72ab594c0999087233558a',
    cards: '86104104d6b6c157765ccf97cea8a47d046928fb',
    strings: '54a6e2395c532648ff762540e9615319fac4f51b',
};

const DIR = path.resolve(import.meta.dirname, '../engine-data');
const VERSION = path.join(DIR, 'version.json');

if (existsSync(VERSION) && readFileSync(VERSION, 'utf-8') === JSON.stringify(ENGINE_PINS)) {
    console.log('Engine data is up to date.');
    process.exit(0);
}
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

// 1. Card scripts at one commit, without history.
const scripts = path.join(DIR, 'scripts');
mkdirSync(scripts);
const git = (...args: string[]) => execFileSync('git', args, { cwd: scripts, stdio: 'inherit' });
git('init', '-q');
git('remote', 'add', 'origin', 'https://github.com/ProjectIgnis/CardScripts.git');
git('fetch', '-q', '--depth', '1', 'origin', ENGINE_PINS.scripts);
git('checkout', '-q', 'FETCH_HEAD');
rmSync(path.join(scripts, '.git'), { recursive: true, force: true });
// Keep the rule library and the TCG/OCG cards (with the GOAT and pre-errata versions); drop Rush, Skills, anime cards.
for (const dir of ['rush', 'skill', 'unofficial', 'pre-release', '.github']) rmSync(path.join(scripts, dir), { recursive: true, force: true });
console.log('Card scripts ready.');

// 2. Card data: the engine's fields, the name, and the effect strings used in prompts.
const download = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
};
const cdbPath = path.join(DIR, 'cards.cdb');
writeFileSync(cdbPath, await download(`https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/${ENGINE_PINS.cards}/cards.cdb`));
const db = new DatabaseSync(cdbPath, { readOnly: true });
type Row = Record<string, string | number | bigint | null>;
const query = db.prepare('SELECT d.*, t.* FROM datas d JOIN texts t ON t.id = d.id');
// Archetype codes pack four 16-bit values and overflow a JS number.
query.setReadBigInts(true);
const rows = query.all() as Row[];
const cards: Record<string, unknown> = {};
for (const r of rows) {
    const strs = Array.from({ length: 16 }, (_, i) => String(r[`str${i + 1}`] ?? ''));
    while (strs.length && !strs[strs.length - 1]) strs.pop();
    cards[String(r.id)] = {
        alias: Number(r.alias), setcode: String(r.setcode), type: Number(r.type), atk: Number(r.atk), def: Number(r.def),
        level: Number(r.level), race: String(r.race), attribute: Number(r.attribute), name: String(r.name), strs,
    };
}
db.close();
rmSync(cdbPath);
writeFileSync(path.join(DIR, 'cards.json'), JSON.stringify(cards));
console.log(`Card data ready: ${rows.length} cards.`);

// 3. System strings ("!system 30 Activate ...?").
const conf = (await download(`https://raw.githubusercontent.com/ProjectIgnis/Distribution/${ENGINE_PINS.strings}/config/strings.conf`)).toString('utf-8');
const system: Record<string, string> = {};
const victory: Record<string, string> = {};
for (const line of conf.split(/\r?\n/)) {
    const m = /^!(system|victory) (0x[0-9a-f]+|\d+) (.+)$/i.exec(line);
    if (m) (m[1] === 'system' ? system : victory)[String(Number(m[2]))] = m[3]!;
}
writeFileSync(path.join(DIR, 'strings.json'), JSON.stringify({ system, victory }));
console.log(`System strings ready: ${Object.keys(system).length}.`);

writeFileSync(VERSION, JSON.stringify(ENGINE_PINS));
