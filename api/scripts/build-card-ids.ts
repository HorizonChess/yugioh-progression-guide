// Builds shared/src/card-ids.json: every other id a card goes by → the one id the app uses for it.
// Run after the engine data (npm run fetch-engine) or YGOPRODeck changes:
//
//   npx tsx api/scripts/build-card-ids.ts
//
// The one id is the duel engine's passcode for the card (the official Konami passcode): the row
// in BabelCDB with no alias. Other ids for the same card are
// - YGOPRODeck's main id where it differs (Monster Reborn: 83764719, the engine's 83764718),
// - YGOPRODeck's alternate-artwork ids (Dark Magician: 36996508 and others → 46986414), which
//   `cardinfo.php` answers under as if they were their own card,
// - the engine's reprint passcodes, rows aliased to a card of the SAME name.
// An engine alias to a card of a different name is a rules alias ("this card is always treated
// as ..."): Harpie Lady 1 → Harpie Lady, A Legendary Ocean → Umi. Those are different cards and
// keep their own ids. The engine's GOAT and pre-errata versions are deliberate older versions a
// duel plays (shared/src/duel/versions.ts), never an id a player owns, so they're left out.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface Row { alias: number; name: string; version?: string }
interface ApiCard { id: number; name: string; card_images?: { id: number }[] }

const root = path.resolve(import.meta.dirname, '..');
const engine = JSON.parse(readFileSync(path.join(root, 'engine-data/cards.json'), 'utf-8')) as Record<string, Row>;
const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php');
if (!res.ok) throw new Error(`YGOPRODeck answered ${res.status}`);
const cards = ((await res.json()) as { data: ApiCard[] }).data;

/** The engine's own passcode for the card `id` names, if the engine knows `id` as that card. */
function engineBase(id: number): number | undefined {
    const row = engine[id];
    if (!row || row.version) return undefined;
    if (!row.alias) return id;
    const base = engine[row.alias];
    return base && !base.alias && !base.version && base.name === row.name ? row.alias : undefined;
}

const map = new Map<number, number>();
const conflicts: string[] = [];
const add = (from: number, to: number, why: string) => {
    if (from === to) return;
    const had = map.get(from);
    if (had !== undefined && had !== to) conflicts.push(`${from}: ${had} or ${to} (${why})`);
    else map.set(from, to);
};

// The engine's reprint passcodes.
for (const code of Object.keys(engine)) {
    const id = Number(code), base = engineBase(id);
    if (base !== undefined) add(id, base, engine[code]!.name);
}
// YGOPRODeck: the card under its main id and every artwork id, onto the engine's id where the
// engine knows any of them, else onto YGOPRODeck's main id.
let unknownToEngine = 0;
for (const card of cards) {
    const ids = [card.id, ...new Set((card.card_images ?? []).map((i) => i.id))];
    const base = ids.map(engineBase).find((b) => b !== undefined);
    if (base === undefined) unknownToEngine++;
    for (const id of ids) add(id, base ?? card.id, card.name);
}
if (conflicts.length) throw new Error(`Ids claimed by two cards:\n${conflicts.join('\n')}`);

const out = Object.fromEntries([...map].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), v]));
writeFileSync(path.join(root, '../shared/src/card-ids.json'), JSON.stringify(out) + '\n');
const fromApi = cards.filter((c) => map.has(c.id)).length;
console.log(`${map.size} ids mapped; ${fromApi} YGOPRODeck main ids move to the engine's; ${unknownToEngine} YGOPRODeck cards the engine doesn't know keep their own id.`);
