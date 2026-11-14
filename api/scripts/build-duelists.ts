// Builds shared/src/duel/duelist-decks.json: each duelist's deck in each era (shared/src/duel/duelists.ts),
// fetched from YGOPRODeck's "Anime Decks" and checked. Run after changing the roster's sources, or
// the engine data (npm run fetch-engine):
//
//   npx tsx api/scripts/build-duelists.ts
//
// Each card is put under its one id (the engine's passcode, shared/src/card-ids.ts), and must be
// one the engine plays and one in the progression's pool (out in the TCG before the cutoff). A
// card is kept at most three times (a fan's list may have more), and Extra Deck monsters go to the
// Extra Deck whichever part the list had them in. A deck left with fewer than 40 cards fails.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CUTOFF_DATE, DUELISTS, canonicalCardId, type DuelistDeck } from '@ygo/shared';

interface Row { type: number; name: string }
interface ApiCard { id: number; name: string; card_images?: { id: number }[]; misc_info?: { tcg_date?: string }[] }
interface ApiDeck { deckNum: number; pretty_url: string; main_deck: string | null; extra_deck: string | null }

const TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000; // Fusion, Synchro, Xyz, Link
const root = path.resolve(import.meta.dirname, '../..');
const engine = JSON.parse(readFileSync(path.join(root, 'api/engine-data/cards.json'), 'utf-8')) as Record<string, Row>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { 'User-Agent': 'ygo-progression-guide (build-duelists)' } });
    if (!res.ok) throw new Error(`YGOPRODeck answered ${res.status} for ${url}`);
    return (await res.json()) as T;
}

// When each card first came out in the TCG, under every id YGOPRODeck has it.
const firstOut = new Map<number, string>();
for (const c of (await json<{ data: ApiCard[] }>('https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes')).data) {
    const date = c.misc_info?.[0]?.tcg_date;
    if (!date) continue;
    for (const { id } of c.card_images ?? [{ id: c.id }]) firstOut.set(id, date);
    firstOut.set(c.id, date);
}

/**
 * The deck, found by searching its name in its format (YGOPRODeck has no lookup by number; it
 * answers 20 at a time, and keeps only the start of a long name, so the search is by that).
 */
async function fetchDeck(name: string, deckNum: number, format = 'Anime Decks'): Promise<ApiDeck> {
    for (let offset = 0; offset < 600; offset += 20) {
        const found = await json<ApiDeck[] | { error: string }>(`https://ygoprodeck.com/api/decks/getDecks.php?format=${encodeURIComponent(format)}&name=${encodeURIComponent(name.slice(0, 40))}&limit=20&offset=${offset}`);
        await sleep(200);
        if (!Array.isArray(found) || !found.length) break;
        const deck = found.find((d) => Number(d.deckNum) === deckNum);
        if (deck) return deck;
        if (found.length < 20) break;
    }
    throw new Error(`Deck ${deckNum} ("${name}") not found on YGOPRODeck`);
}

const out: Record<string, DuelistDeck> = {};
const problems: string[] = [];
// Each era's deck, and its competitive build (`<era>+`) where it has one.
const lists = DUELISTS.flatMap((duelist) => duelist.eras.flatMap((era) => [
    { key: `${duelist.id}:${era.id}`, source: era.source },
    ...(era.competitive ? [{ key: `${duelist.id}:${era.id}+`, source: era.competitive }] : []),
]));
for (const { key, source } of lists) {
    const { name, deckNum, format } = source;
    const raw = await fetchDeck(name, deckNum, format);
    const listed = [...(JSON.parse(raw.main_deck ?? '[]') as string[]), ...(JSON.parse(raw.extra_deck ?? '[]') as string[])].map(Number);
    const deck: DuelistDeck = { main: [], extra: [], url: `https://ygoprodeck.com/deck/${raw.pretty_url}` };
    const copies = new Map<string, number>();
    let dropped = 0;
    for (const id of listed) {
        const code = canonicalCardId(id);
        const row = engine[code];
        const date = firstOut.get(id) ?? firstOut.get(code);
        if (!row) problems.push(`${key}: the engine doesn't know ${id}`);
        else if (!date || date >= CUTOFF_DATE) problems.push(`${key}: ${row.name} isn't in the pool (first out ${date ?? 'never in the TCG'})`);
        if (!row) continue;
        const n = (copies.get(row.name) ?? 0) + 1;
        copies.set(row.name, n);
        if (n > 3) {
            dropped++;
            continue;
        }
        ((row.type & TYPE_EXTRA) !== 0 ? deck.extra : deck.main).push(code);
    }
    if (deck.main.length < 40) problems.push(`${key}: only ${deck.main.length} Main Deck cards`);
    out[key] = deck;
    console.log(`${key.padEnd(16)} ${deck.main.length}/${deck.extra.length}${dropped ? ` (${dropped} copies over 3 left out)` : ''}  ${name}`);
}
if (problems.length) {
    console.error(`\n${problems.join('\n')}`);
    process.exit(1);
}
writeFileSync(path.join(root, 'shared/src/duel/duelist-decks.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`\nWrote ${Object.keys(out).length} decks.`);

// Every card needs its image on the image host (cards/<id>.jpg and its _md size): the first uploads
// stopped at 2016, so a later card a deck plays may have none. Upload any missing with
// web/scripts/images/upload_card_images.js.
const host = process.env.NEXT_PUBLIC_IMAGE_HOST
    ?? readFileSync(path.join(root, 'web/.env.local'), 'utf-8').match(/^NEXT_PUBLIC_IMAGE_HOST=(.+)$/m)?.[1]?.trim();
if (host) {
    const codes = [...new Set(Object.values(out).flatMap((d) => [...d.main, ...d.extra]))];
    const missing: number[] = [];
    const has = async (file: string): Promise<boolean> => {
        for (let attempt = 0; attempt < 5; attempt++) {
            const res = await fetch(`${host}/cards/${file}`, { method: 'HEAD' });
            if (res.status !== 429) return res.ok;
            await sleep(1000 * (attempt + 1));
        }
        return false;
    };
    for (let i = 0; i < codes.length; i += 4) {
        await Promise.all(codes.slice(i, i + 4).map(async (code) => {
            if (!(await has(`${code}.jpg`)) || !(await has(`${code}_md.jpg`))) missing.push(code);
        }));
    }
    if (missing.length) console.warn(`\nNo image for ${missing.length} cards: ${missing.map((c) => `${c} (${engine[c]?.name})`).join(', ')}\n  node web/scripts/images/upload_card_images.js ${missing.join(' ')}`);
    else console.log(`All ${codes.length} cards have their images.`);
}
