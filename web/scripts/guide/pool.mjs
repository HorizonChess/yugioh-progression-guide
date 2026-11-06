// The card pool both duelists can draw from at a stage of the series: every
// timeline set up to and including that stage. Data from YGOPRODeck (the app's
// own source), cached in out/ so reruns are offline.
//
//   node scripts/guide/pool.mjs <stage index>     prints the pool's headline facts
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "out", "cache");
mkdirSync(CACHE, { recursive: true });
const API = "https://db.ygoprodeck.com/api/v7";

async function cached(name, url) {
    const file = join(CACHE, name.replace(/[^a-z0-9]+/gi, "_") + ".json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
    const res = await fetch(url);
    const body = res.ok ? await res.json() : { data: [] };
    writeFileSync(file, JSON.stringify(body));
    return body;
}

// The same filter as shared/src/sets.ts (isTimelineSet + byDate).
const CUTOFF = "2017-08-01";
const EXCLUDE = ["Structure Deck", "Starter Deck", "Tournament Pack", "Duelist Pack", "Battle Pack", "Star Pack", "Turbo Pack", "Astral Pack", "Champion Pack", "OTS Tournament Pack", "Premium Pack", "Movie Pack", "Super Starter", "Speed Duel", "Duel Terminal", "Legendary Decks", "Box Set", "Special Edition", "Magic Ruler"];
export async function timeline() {
    const sets = await cached("cardsets", `${API}/cardsets.php`);
    return sets.filter((s) => s.tcg_date && s.tcg_date < CUTOFF && s.num_of_cards > 20 && !EXCLUDE.some((k) => s.set_name.includes(k)))
        .sort((a, b) => a.tcg_date.localeCompare(b.tcg_date) || (a.set_name < b.set_name ? -1 : a.set_name > b.set_name ? 1 : 0));
}

const RARITY_ORDER = ["Common", "Short Print", "Rare", "Super Rare", "Ultra Rare", "Secret Rare", "Ultimate Rare", "Ghost Rare"];
const rank = (r) => { const i = RARITY_ORDER.indexOf(r); return i === -1 ? RARITY_ORDER.length : i; };

/** Every card in sets 0..stage, each with the most common rarity it can be pulled at, and the set it first appears in. */
export async function poolAt(stage) {
    const sets = (await timeline()).slice(0, stage + 1);
    const pool = new Map();
    for (const [i, set] of sets.entries()) {
        const { data } = await cached(`set_${set.set_name}`, `${API}/cardinfo.php?cardset=${encodeURIComponent(set.set_name)}`);
        for (const card of data ?? []) {
            const prints = (card.card_sets ?? []).filter((p) => p.set_name === set.set_name);
            const best = prints.map((p) => p.set_rarity).sort((a, b) => rank(a) - rank(b))[0];
            const had = pool.get(card.id);
            if (!had) pool.set(card.id, { card, rarity: best, firstSet: set.set_code, firstStage: i });
            else if (rank(best) < rank(had.rarity)) had.rarity = best;
        }
    }
    return { sets, pool };
}

const isMonster = (c) => c.type.includes("Monster");
const noTribute = (c) => isMonster(c) && !c.type.includes("Fusion") && !c.type.includes("Ritual") && (c.level ?? 0) <= 4;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const stage = Number(process.argv[2] ?? 0);
    const { sets, pool } = await poolAt(stage);
    const all = [...pool.values()];
    console.log(`Stage ${stage + 1}: ${sets.map((s) => s.set_code).join(", ")} — ${all.length} cards`);
    const beaters = all.filter((e) => noTribute(e.card)).sort((a, b) => (b.card.atk ?? 0) - (a.card.atk ?? 0));
    console.log("\nStrongest no-tribute monsters:");
    for (const e of beaters.slice(0, 8)) console.log(`  ${e.card.atk}\t${e.card.name} (${e.firstSet}, ${e.rarity}${e.card.type.includes("Normal") ? "" : ", effect"})`);
    const st = all.filter((e) => !isMonster(e.card));
    console.log(`\nSpells/traps: ${st.length} (${st.filter((e) => e.rarity === "Common").length} common)`);
    for (const e of st.filter((e) => e.rarity === "Common")) console.log(`  ${e.card.name} — ${e.card.type}`);
    for (const name of process.argv.slice(3)) { const e = all.find((x) => x.card.name === name); console.log(`\n${name}: ${e ? `in pool (${e.firstSet}, ${e.rarity})` : "NOT in pool"}`); }
}
