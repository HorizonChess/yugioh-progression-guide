// Bot lab: the hard bot with one set of weights against itself with another, for tune.ts.
//   npx tsx scripts/bot-lab/weights-match.ts <weights.json> <pair> [games per pair = 2]
// weights.json: { "a": { feature: weight... }, "b": {...} }. Plays a pair of duelist decks twice
// (each side with each deck, going first once) and prints one line: {"a": wins, "b": wins}.
import { readFileSync } from 'node:fs';
import type { OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer } from '@ygo/duel/bot';
import { WEIGHTS, type Feature } from '@ygo/duel/bot-weights';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const [file, pairArg = '0'] = process.argv.slice(2);
const sets = JSON.parse(readFileSync(file!, 'utf-8')) as { a: Record<Feature, number>; b: Record<Feature, number> };
const pair = Number(pairArg);
const engine = await loadEngine();
const decks = DUELISTS.filter((d) => d.level !== 'easy').flatMap((d) => d.eras.flatMap((e) => [`${d.id}:${e.id}`, ...(e.competitive ? [`${d.id}:${e.id}+`] : [])]))
    .map((key) => { const [id, era] = key.split(':'); return duelistDeck(DUELISTS.find((d) => d.id === id)!, era).deck; });
const x = decks[(pair * 7 + 3) % decks.length]!, y = decks[(pair * 11 + 8) % decks.length]!;
const wins = { a: 0, b: 0 };
for (const aSeat of [0, 1] as const) {
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        Object.assign(WEIGHTS, t === aSeat ? sets.a : sets.b);
        (d.setup as { botLevel?: string }).botLevel = 'hard';
        return botAnswer(m, d, t);
    };
    const duel = new DuelSession(engine, { seed: [String(90000 + pair), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [x, y], names: ['A', 'B'], bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    try {
        duel.start();
    } catch {
        continue;
    }
    const w = duel.result?.winner;
    if (w === 0 || w === 1) wins[w === aSeat ? 'a' : 'b']++;
}
console.log(JSON.stringify(wins));
