// What Yugi would say over a run of the series: opens each stage's packs with the real
// generator (shared/pack-logic), flips them in order with a growing collection, and
// prints every line he'd say on a flip (lib/guide/lines.ts). For reviewing his lines
// against real pulls. Data from the build cache (run build.mjs first).
//
//   npx tsx scripts/guide/simulate.ts [stages=3] [packs per set=24] [seed=1]
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { generateBoosterPacks } from "../../../shared/src/pack-logic";
import { pullLine } from "../../src/lib/guide/lines";

const CACHE = join(dirname(fileURLToPath(import.meta.url)), "out", "cache");
const file = (name: string) => join(CACHE, name.replace(/[^a-z0-9]+/gi, "_") + ".json");
const [stages = 3, perSet = 24, seed0 = 1] = process.argv.slice(2).map(Number);

// A small seeded RNG, so a run can be repeated.
let s = seed0 >>> 0 || 1;
const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const CUTOFF = "2017-08-01";
const EXCLUDE = ["Structure Deck", "Starter Deck", "Tournament Pack", "Duelist Pack", "Battle Pack", "Star Pack", "Turbo Pack", "Astral Pack", "Champion Pack", "OTS Tournament Pack", "Premium Pack", "Movie Pack", "Super Starter", "Speed Duel", "Duel Terminal", "Legendary Decks", "Box Set", "Special Edition", "Magic Ruler"];
type SetInfo = { set_name: string; set_code: string; tcg_date: string; num_of_cards: number };
const sets = (JSON.parse(readFileSync(file("cardsets"), "utf8")) as SetInfo[])
    .filter((x) => x.tcg_date && x.tcg_date < CUTOFF && x.num_of_cards > 20 && !EXCLUDE.some((k) => x.set_name.includes(k)))
    .sort((a, b) => a.tcg_date.localeCompare(b.tcg_date) || (a.set_name < b.set_name ? -1 : 1));

const owned = new Map<number, number>();
let said = 0, flips = 0;
for (let stage = 0; stage < stages; stage++) {
    const set = sets[stage]!;
    const cards = JSON.parse(readFileSync(file(`set_${set.set_name}`), "utf8")).data;
    console.log(`\n=== ${set.set_name}: ${perSet} packs`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the cache is YGOPRODeck's shape, as the app's
    const packs = generateBoosterPacks(cards, set as any, perSet, rng);
    for (const [p, pack] of packs.entries()) {
        for (const card of pack) {
            flips++;
            const before = owned.get(card.id) ?? 0;
            owned.set(card.id, before + 1);
            const line = pullLine({ id: card.id, name: card.name, rarity: card.pulled_rarity, isNew: before === 0, copies: before + 1 }, stage, Math.floor(rng() * 1000));
            if (!line) continue;
            said++;
            console.log(`  pack ${String(p + 1).padStart(2)}  ${card.name} (${card.pulled_rarity}, copy ${before + 1})\n            "${line.text}"`);
        }
    }
}
console.log(`\n${said} lines over ${flips} flips (one every ${(flips / Math.max(said, 1)).toFixed(1)} cards)`);
