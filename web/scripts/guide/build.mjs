// Builds what Yugi knows, from the real card pool at each stage of the series.
//
//   node scripts/guide/build.mjs
//
// Writes src/data/guide/facts.json: for every timeline set (keyed by set code), the
// strongest monsters in the pool up to and including that set, by how many tributes
// they need. Yugi's "nothing hits harder" lines read these, never memory.
//
// Also checks src/data/guide/sets.json (the hand-written notes): every card a note
// names must be printed in that set, and the run fails if one isn't.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { poolAt, timeline } from "./pool.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "guide");
const ONLY = process.argv[2] ? Number(process.argv[2]) : undefined; // stages to build, for a quick run

/** A monster you can Normal Summon (no fusion, ritual or "Cannot be Normal Summoned"), and how many tributes it needs. */
function tributes(card) {
    if (!card.type.includes("Monster") || /Fusion|Ritual|Synchro|XYZ|Link|Token/.test(card.type)) return null;
    if (/[Cc]annot be Normal Summoned/.test(card.desc)) return null;
    const lv = card.level ?? 0;
    return lv <= 4 ? 0 : lv <= 6 ? 1 : 2;
}

/**
 * A monster whose ATK comes with a catch: a coin toss, a Life Point cost, destroying itself,
 * shrinking, or not attacking. It isn't counted as "hits hardest"; Yugi mentions it as the catch.
 */
const CATCH = /toss a coin|pay \d+ (Life Points|LP)|cost of \d+ of your own Life Points|destroy this card|Summoned, destroy it|this card loses|decrease the ATK|opponent draws|changed to Defense Position|cannot (declare an )?attack/i;
const notes0 = JSON.parse(readFileSync(join(DATA, "sets.json"), "utf8"));
const hasCatch = (card) => notes0._catch?.includes(card.name) || (card.type.includes("Effect") && !notes0._noCatch?.includes(card.name) && CATCH.test(card.desc));

const sets = await timeline();
const stages = ONLY === undefined ? sets.length : Math.min(ONLY, sets.length);
const facts = {};
const printed = {}; // set code → card names printed in it
for (let i = 0; i < stages; i++) {
    const { pool } = await poolAt(i);
    const top = [[], [], []], risky = [[], [], []];
    for (const { card, rarity } of pool.values()) {
        const t = tributes(card);
        if (t !== null && card.atk != null) (hasCatch(card) ? risky : top)[t].push({ id: card.id, name: card.name, atk: card.atk, common: rarity === "Common" });
    }
    const byAtk = (a, b) => b.atk - a.atk || a.name.localeCompare(b.name);
    // Each tier: the strongest monsters without a catch, and the strongest one with a catch that outhits them (if any).
    const tier = (t) => {
        const clean = top[t].sort(byAtk).slice(0, 4);
        const catchy = risky[t].sort(byAtk)[0];
        return { top: clean, ...(catchy && clean[0] && catchy.atk > clean[0].atk && { catch: catchy }) };
    };
    facts[sets[i].set_code] = { stage: i, name: sets[i].set_name, tiers: [tier(0), tier(1), tier(2)] };
    printed[sets[i].set_code] = new Set([...pool.values()].filter((e) => e.firstSet === sets[i].set_code || e.card.card_sets?.some((p) => p.set_name === sets[i].set_name)).map((e) => e.card.name));
    process.stdout.write(`\r${i + 1}/${stages} ${sets[i].set_code}   `);
}
writeFileSync(join(DATA, "facts.json"), JSON.stringify(facts) + "\n");
console.log(`\nfacts.json: ${Object.keys(facts).length} sets`);

// Check the notes.
const notes = JSON.parse(readFileSync(join(DATA, "sets.json"), "utf8"));
let bad = 0;
for (const [code, note] of Object.entries(notes)) {
    if (code.startsWith("_")) continue;
    if (!printed[code]) { console.log(`  ${code}: not a built timeline set`); bad++; continue; }
    for (const name of Object.keys(note.cards ?? {}).flatMap((n) => n.split(" | "))) {
        if (!printed[code].has(name)) { console.log(`  ${code}: "${name}" isn't printed in ${facts[code].name}`); bad++; }
    }
    for (const line of [...(note.intro ?? []), ...Object.values(note.cards ?? {}).flat()]) {
        if (line.length > 140) { console.log(`  ${code}: over 140 characters: "${line.slice(0, 50)}…"`); bad++; }
    }
}
console.log(bad ? `${bad} problem(s) in sets.json` : "sets.json: every card is in its set");
process.exit(bad ? 1 : 0);
