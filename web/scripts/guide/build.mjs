// Checks Yugi's notes against the real card pool, and writes the timeline he reads them by.
//
//   node scripts/guide/build.mjs
//
// Writes src/data/guide/timeline.json: the timeline's set codes in order, so a note's
// "until" (a set code) can be compared with the player's stage.
//
// Checks src/data/guide/sets.json (the hand-written notes) and fails if:
//  - a note names a card that isn't printed in that set;
//  - an "until" isn't a timeline set, or comes before the set the note is in;
//  - a _multiples card isn't printed on the timeline;
//  - a line (with any wording it's used in) is over 140 characters.
// For checking what a note claims about the pool at a stage, see pool.mjs.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { poolAt, timeline } from "./pool.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "data", "guide");

const sets = await timeline();
const codes = sets.map((s) => s.set_code);
writeFileSync(join(DATA, "timeline.json"), JSON.stringify(codes) + "\n");
console.log(`timeline.json: ${codes.length} sets`);

// Card names printed in each set that has notes.
const notes = JSON.parse(readFileSync(join(DATA, "sets.json"), "utf8"));
const noted = Object.keys(notes).filter((k) => !k.startsWith("_"));
const last = Math.max(...noted.map((c) => codes.indexOf(c)));
const printed = {};
const { pool } = await poolAt(Math.max(last, 0));
for (const code of noted) {
    const set = sets.find((s) => s.set_code === code);
    printed[code] = new Set([...pool.values()].filter((e) => e.firstSet === code || e.card.card_sets?.some((p) => p.set_name === set?.set_name)).map((e) => e.card.name));
}

let bad = 0;
const fail = (msg) => (console.log(`  ${msg}`), bad++);
const checkUntil = (where, until, from) => {
    if (until === undefined) return;
    const at = codes.indexOf(until);
    if (at === -1) fail(`${where}: until "${until}" isn't a timeline set`);
    else if (from !== undefined && at < from) fail(`${where}: until "${until}" is before the set it's in`);
};
for (const code of noted) {
    const note = notes[code];
    if (!codes.includes(code)) { fail(`${code}: not a timeline set`); continue; }
    for (const line of note.intro ?? []) if (line.length > 140) fail(`${code}: intro over 140 characters: "${line.slice(0, 50)}…"`);
    for (const [names, entry] of Object.entries(note.cards ?? {})) {
        const { lines, until } = Array.isArray(entry) ? { lines: entry } : entry;
        for (const name of names.split(" | ")) if (!printed[code].has(name)) fail(`${code}: "${name}" isn't printed in ${code}`);
        for (const line of lines) if (line.length > 140) fail(`${code}: over 140 characters: "${line.slice(0, 50)}…"`);
        checkUntil(`${code} "${names}"`, until, codes.indexOf(code));
    }
}
// Cards worth several copies: printed in a noted set, and every wording fits.
const everywhere = new Set(Object.values(printed).flatMap((names) => [...names]));
for (const [name, m] of Object.entries(notes._multiples ?? {})) {
    if (!everywhere.has(name)) fail(`_multiples: "${name}" isn't printed in any noted set`);
    checkUntil(`_multiples "${name}"`, m.until);
    for (const head of [`That's 3 ${name}, a full set!`, `Your third ${name}!`, `A second ${name}!`, `Another ${name}!`]) {
        if (head.length + 1 + m.why.length > 140) fail(`_multiples: "${head} ${m.why.slice(0, 30)}…" is over 140 characters`);
    }
}
console.log(bad ? `${bad} problem(s) in sets.json` : "sets.json: every card is in its set, every line fits");
process.exit(bad ? 1 : 0);
