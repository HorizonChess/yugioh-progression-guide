// Prototype: EDOPro's rules engine (ocgcore, AGPL-3.0, built to WASM by ocgcore-wasm) playing a
// headless duel between two Legend of Blue Eyes decks. A simple bot answers every question.
//
// What it checks:
//   1. The engine runs in Node with real card scripts (Trap Hole, Man-Eater Bug, Monster Reborn...).
//   2. Speed and memory per duel.
//   3. Determinism: replaying the seed and the recorded answers rebuilds the same duel exactly,
//      which is what lets a server resume a duel after a restart and keep replays.
//
// Usage: node src/duel.mjs [--log] [--duels N] [--mode mr1|goat|mr5]

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import createCore, {
    OcgDuelMode, OcgLocation, OcgMessageType, OcgPosition, OcgProcessResult, OcgResponseType,
    SelectBattleCMDAction, SelectIdleCMDAction, ocgMessageTypeStrings,
} from "ocgcore-wasm";

const VENDOR = path.resolve(import.meta.dirname, "../vendor");
const SCRIPTS = path.join(VENDOR, "scripts");
const args = process.argv.slice(2);
const LOG = args.includes("--log");
const DUELS = Number(args[args.indexOf("--duels") + 1]) || 50;
const MODE = { mr1: OcgDuelMode.MODE_MR1, goat: OcgDuelMode.MODE_GOAT, mr5: OcgDuelMode.MODE_MR5 }[args[args.indexOf("--mode") + 1]] ?? OcgDuelMode.MODE_MR1;

// ---- card data, from EDOPro's own database (BabelCDB cards.cdb) -----------------------------
const db = new DatabaseSync(path.join(VENDOR, "cards.cdb"), { readOnly: true });
const dataRow = db.prepare("SELECT * FROM datas WHERE id = ?");
const nameRow = db.prepare("SELECT name FROM texts WHERE id = ?");
const TYPE_LINK = 0x4000000;
const cache = new Map();
function cardData(code) {
    if (cache.has(code)) return cache.get(code);
    const r = dataRow.get(code);
    if (!r) return null;
    const set = BigInt(r.setcode);
    const setcodes = [0n, 16n, 32n, 48n].map((s) => Number((set >> s) & 0xffffn)).filter(Boolean);
    const link = (r.type & TYPE_LINK) !== 0;
    const data = {
        code: r.id, alias: r.alias, setcodes, type: r.type,
        level: r.level & 0xff, lscale: (r.level >> 24) & 0xff, rscale: (r.level >> 16) & 0xff,
        attribute: r.attribute, race: BigInt(r.race), attack: r.atk,
        defense: link ? 0 : r.def, link_marker: link ? r.def : 0,
    };
    cache.set(code, data);
    return data;
}
const name = (code) => nameRow.get(code)?.name ?? `#${code}`;

let scriptErrors = 0;
function readScript(file) {
    const p = /^c\d+\.lua$/.test(file) ? path.join(SCRIPTS, "official", file) : path.join(SCRIPTS, file);
    return existsSync(p) ? readFileSync(p, "utf-8") : null; // Normal Monsters have no script.
}

// ---- decks: 40 cards each, all from Legend of Blue Eyes White Dragon ------------------------
const DECK = [
    [89631139, 3], [46986414, 2], [74677422, 3], [6368038, 3], [91152256, 3], [76184692, 3],
    [90357090, 3], [15025844, 3], [54652250, 2], // monsters
    [66788016, 2], [83764718, 1], [53129443, 1], [12580477, 1], [59197169, 2], // spells
    [4206964, 3], [17814387, 3], [50045299, 2], // traps
].flatMap(([code, n]) => Array(n).fill(code));

// ---- the bot: answers each question with a simple, legal choice -----------------------------
const firstFree = (mask, player) => {
    // A set bit means the zone can't be chosen. Bits 0-4: own Monster Zones, 8-12: own Spell & Trap
    // Zones, 16+ the same for the opponent.
    for (const base of [0, 8, 16, 24]) for (let i = 0; i < 5; i++) {
        if (!(mask & (1 << (base + i)))) {
            return { player: base >= 16 ? 1 - player : player, location: base % 16 === 0 ? OcgLocation.MZONE : OcgLocation.SZONE, sequence: i };
        }
    }
    throw new Error("no free zone");
};
/** A seeded Fisher-Yates shuffle (mulberry32). */
function shuffled(list, seed) {
    let a = Number(seed % 4294967296n);
    const rand = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
const range = (n) => Array.from({ length: n }, (_, i) => i);

function botAnswer(m, turnActions) {
    switch (m.type) {
        case OcgMessageType.SELECT_IDLECMD: {
            const t = OcgResponseType.SELECT_IDLECMD;
            if (turnActions.n++ < 12) {
                if (m.summons.length) {
                    const best = m.summons.reduce((b, c, i) => (cardData(c.code).attack > cardData(m.summons[b].code).attack ? i : b), 0);
                    return { type: t, action: SelectIdleCMDAction.SELECT_SUMMON, index: best };
                }
                const fromHand = m.activates.findIndex((a) => a.location === OcgLocation.HAND);
                if (fromHand >= 0) return { type: t, action: SelectIdleCMDAction.SELECT_ACTIVATE, index: fromHand };
                if (m.spell_sets.length) return { type: t, action: SelectIdleCMDAction.SELECT_SPELL_SET, index: 0 };
            }
            return { type: t, action: m.to_bp ? SelectIdleCMDAction.TO_BP : SelectIdleCMDAction.TO_EP, index: null };
        }
        case OcgMessageType.SELECT_BATTLECMD:
            if (m.attacks.length) return { type: OcgResponseType.SELECT_BATTLECMD, action: SelectBattleCMDAction.SELECT_BATTLE, index: 0 };
            return { type: OcgResponseType.SELECT_BATTLECMD, action: m.to_m2 ? SelectBattleCMDAction.TO_M2 : SelectBattleCMDAction.TO_EP, index: null };
        case OcgMessageType.SELECT_CHAIN:
            return { type: OcgResponseType.SELECT_CHAIN, index: m.selects.length ? 0 : null };
        case OcgMessageType.SELECT_CARD:
            return { type: OcgResponseType.SELECT_CARD, indicies: range(m.min) };
        case OcgMessageType.SELECT_TRIBUTE:
            return { type: OcgResponseType.SELECT_TRIBUTE, indicies: range(m.min) };
        case OcgMessageType.SELECT_UNSELECT_CARD:
            return { type: OcgResponseType.SELECT_UNSELECT_CARD, index: m.select_cards.length ? 0 : null };
        case OcgMessageType.SELECT_EFFECTYN:
            return { type: OcgResponseType.SELECT_EFFECTYN, yes: true };
        case OcgMessageType.SELECT_YESNO:
            return { type: OcgResponseType.SELECT_YESNO, yes: true };
        case OcgMessageType.SELECT_OPTION:
            return { type: OcgResponseType.SELECT_OPTION, index: 0 };
        case OcgMessageType.SELECT_PLACE:
            return { type: OcgResponseType.SELECT_PLACE, places: range(m.count).map(() => firstFree(m.field_mask, m.player)) };
        case OcgMessageType.SELECT_POSITION:
            return { type: OcgResponseType.SELECT_POSITION, position: [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE, OcgPosition.FACEDOWN_ATTACK].find((p) => m.positions & p) };
        case OcgMessageType.ROCK_PAPER_SCISSORS:
            return { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 1 };
        case OcgMessageType.SORT_CARD:
        case OcgMessageType.SORT_CHAIN:
            return { type: OcgResponseType.SORT_CARD, order: null };
        default:
            throw new Error(`the bot can't answer ${ocgMessageTypeStrings.get?.(m.type) ?? m.type}`);
    }
}

// ---- a readable log of what happened ---------------------------------------------------------
const LOC = { 1: "Deck", 2: "hand", 4: "Monster Zone", 8: "Spell & Trap Zone", 16: "Graveyard", 32: "banished", 64: "Extra Deck" };
const who = (p) => (p === 0 ? "P1" : "P2");
function describe(m) {
    switch (m.type) {
        case OcgMessageType.NEW_TURN: return `\n── Turn: ${who(m.player)} ──`;
        case OcgMessageType.DRAW: return `${who(m.player)} draws ${m.drawn.map((d) => (d.code ? name(d.code) : "a card")).join(", ")}`;
        case OcgMessageType.SUMMONING: return `${who(m.controller)} Normal Summons ${name(m.code)}`;
        case OcgMessageType.SPSUMMONING: return `${who(m.controller)} Special Summons ${name(m.code)}`;
        case OcgMessageType.FLIPSUMMONING: return `${who(m.controller)} Flip Summons ${name(m.code)}`;
        case OcgMessageType.SET: return `${who(m.controller)} sets a card`;
        case OcgMessageType.CHAINING: return `  ⛓ ${who(m.controller)} activates ${name(m.code)} (chain link ${m.chain_size})`;
        case OcgMessageType.CHAIN_SOLVED: return `  ✓ chain link ${m.chain_size} resolves`;
        case OcgMessageType.ATTACK: return `${who(m.card.controller)}'s monster in zone ${m.card.sequence + 1} attacks ${m.target ? `zone ${m.target.sequence + 1}` : "directly"}`;
        case OcgMessageType.DAMAGE: return `  ${who(m.player)} takes ${m.amount} damage`;
        case OcgMessageType.MOVE:
            if (m.to.location === OcgLocation.GRAVE && m.from.location !== OcgLocation.GRAVE)
                return `  ${name(m.card)} goes from ${who(m.from.controller)}'s ${LOC[m.from.location]} to the Graveyard`;
            return null;
        case OcgMessageType.WIN: return `\n🏆 ${who(m.player)} wins (reason ${m.reason})`;
        default: return null;
    }
}

// ---- running a duel --------------------------------------------------------------------------
const core = await createCore({ sync: true });
const [major, minor] = core.getVersion();

/** Plays one duel. With `replay`, the answers come from that list instead of the bot. */
function playDuel(seed, replay) {
    const handle = core.createDuel({
        flags: MODE,
        seed,
        team1: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
        team2: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
        cardReader: cardData,
        scriptReader: readScript,
        errorHandler: (type, text) => {
            scriptErrors++;
            if (LOG) console.warn("engine:", type, text);
        },
    });
    if (!handle) throw new Error("createDuel failed");
    // The shared rule library every card script builds on; utility.lua loads the rest itself.
    for (const lib of ["constant.lua", "utility.lua"]) core.loadScript(handle, lib, readScript(lib));
    for (const team of [0, 1]) {
        // As EDOPro's server does, the host shuffles each deck before handing it to the engine,
        // from the duel's seed, so a replay deals the same cards.
        for (const code of shuffled(DECK, seed[0] * 2n + BigInt(team))) {
            core.duelNewCard(handle, { team, duelist: 0, code, controller: team, location: OcgLocation.DECK, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE });
        }
    }
    core.startDuel(handle);

    const answers = [], lines = [], hash = createHash("sha256");
    const turnActions = { n: 0 };
    let winner = null, turns = 0, questions = 0;
    for (let guard = 0; guard < 100000; guard++) {
        const status = core.duelProcess(handle);
        const messages = core.duelGetMessage(handle);
        for (const m of messages) {
            hash.update(JSON.stringify(m, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
            if (m.type === OcgMessageType.NEW_TURN) {
                turns++;
                turnActions.n = 0;
            }
            if (m.type === OcgMessageType.WIN) winner = m.player;
            const line = describe(m);
            if (line) lines.push(line);
        }
        if (status === OcgProcessResult.END || winner !== null) break;
        if (status === OcgProcessResult.CONTINUE) continue;
        questions++;
        // When the engine waits, its last message is the question.
        const answer = replay ? replay[answers.length] : botAnswer(messages[messages.length - 1], turnActions);
        answers.push(answer);
        core.duelSetResponse(handle, answer);
        if (turns > 80) break; // a stalemate between two bots
    }
    core.destroyDuel(handle);
    return { winner, turns, questions, answers, lines, digest: hash.digest("hex") };
}

const seedFor = (i) => [BigInt(i + 1), 0x9e3779b97f4a7c15n, BigInt(i * 7919 + 13), 0x2545f4914f6cdd1dn];

console.log(`ocgcore ${major}.${minor} (WASM) · mode ${MODE === OcgDuelMode.MODE_MR1 ? "Master Rule 1" : MODE === OcgDuelMode.MODE_GOAT ? "GOAT" : "Master Rule 5"} · Node ${process.version}`);

// 1. One duel, told as it happened.
const first = playDuel(seedFor(0));
if (LOG) console.log(first.lines.join("\n"));
else console.log(first.lines.slice(0, 60).join("\n") + `\n… (${first.lines.length} lines; --log for all)`);
console.log(`\nDuel 1: ${first.turns} turns, ${first.questions} questions answered, winner ${first.winner === null ? "none" : who(first.winner)}`);

// 2. Determinism: replay the same seed with the recorded answers.
const again = playDuel(seedFor(0), first.answers);
console.log(`Replay from seed + ${first.answers.length} recorded answers: ${again.digest === first.digest ? "identical (every engine message matches)" : "DIFFERENT"}`);

// 3. Speed and memory over many duels.
const before = process.memoryUsage().rss;
const t0 = performance.now();
let totalQuestions = 0, decided = 0;
for (let i = 1; i <= DUELS; i++) {
    const r = playDuel(seedFor(i));
    totalQuestions += r.questions;
    if (r.winner !== null) decided++;
}
const ms = performance.now() - t0;
console.log(`\n${DUELS} more duels: ${(ms / DUELS).toFixed(1)} ms per whole duel, ${((ms * 1000) / totalQuestions).toFixed(0)} µs per question, ${decided}/${DUELS} reached a winner`);
console.log(`Memory: ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB for the whole process (was ${(before / 1048576).toFixed(0)} MB before the batch)`);
console.log(`Engine/script errors reported: ${scriptErrors}`);

// 4. Many duels open at once (a server holds one per live match).
{
    const OPEN = 20, base = process.memoryUsage().rss, handles = [];
    for (let i = 0; i < OPEN; i++) {
        const h = core.createDuel({
            flags: MODE, seed: seedFor(1000 + i),
            team1: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
            team2: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
            cardReader: cardData, scriptReader: readScript,
        });
        for (const lib of ["constant.lua", "utility.lua"]) core.loadScript(h, lib, readScript(lib));
        for (const team of [0, 1]) for (const code of shuffled(DECK, BigInt(i * 2 + team)))
            core.duelNewCard(h, { team, duelist: 0, code, controller: team, location: OcgLocation.DECK, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE });
        core.startDuel(h);
        while (core.duelProcess(h) === OcgProcessResult.CONTINUE) core.duelGetMessage(h);
        handles.push(h);
    }
    const per = (process.memoryUsage().rss - base) / OPEN / 1048576;
    console.log(`${OPEN} duels open at once: about ${per.toFixed(1)} MB each`);
    handles.forEach((h) => core.destroyDuel(h));
}
