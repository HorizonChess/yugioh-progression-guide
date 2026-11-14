// Bot lab: positions from bot-vs-bot games with the duelists' decks, each with who went on to win,
// to fit the bot's weights to (fit-weights.py).
//   npx tsx scripts/bot-lab/record.ts <games> <out.jsonl> [from]
// Each line: one player's view at one of their chances to act on their own turn: the features
// (bot-eval.ts, in FEATURES order), and y = 1 if that player won. Both seats play the normal or
// the hard bot, by turns, so the positions are ones the bot reaches.
import { appendFileSync, writeFileSync } from 'node:fs';
import { OcgMessageType as M, type OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer, type BotLevel } from '@ygo/duel/bot';
import { evaluate, features } from '@ygo/duel/bot-eval';
import { HAND_SET, type Feature } from '@ygo/duel/bot-weights';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const [games = '20', out = 'positions.jsonl', fromArg = '0'] = process.argv.slice(2);
const from = Number(fromArg);
export const FEATURES = Object.keys(HAND_SET) as Feature[];
const engine = await loadEngine();
const decks = DUELISTS.flatMap((d) => d.eras.flatMap((e) => [`${d.id}:${e.id}`, ...(e.competitive ? [`${d.id}:${e.id}+`] : [])]))
    .map((key) => { const [id, era] = key.split(':'); return { key, deck: duelistDeck(DUELISTS.find((d) => d.id === id)!, era).deck }; });

if (from === 0) writeFileSync(out, '');
let written = 0, mismatch = 0;
for (let g = from; g < from + Number(games); g++) {
    const a = decks[(g * 17 + 1) % decks.length]!, b = decks[(g * 29 + 11) % decks.length]!;
    const levels: [BotLevel, BotLevel] = [g % 3 === 0 ? 'hard' : 'normal', g % 3 === 1 ? 'hard' : 'normal'];
    const rows: { team: Team; turn: number; f: number[] }[] = [];
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        if (m.type === M.SELECT_IDLECMD && d.currentTurnPlayer === t) {
            const view = d.view(t);
            const f = features(view, engine);
            // (The weighted features are the score: a check that they add up.)
            const sum = FEATURES.reduce((s, k) => s + HAND_SET[k] * f[k], 0);
            if (view.me.lp > 0 && view.opp.lp > 0 && Math.abs(sum - evaluate(view, engine)) > 1e-6) mismatch++;
            rows.push({ team: t, turn: view.turn, f: FEATURES.map((k) => Math.round(f[k] * 1000) / 1000) });
        }
        (d.setup as { botLevel?: BotLevel }).botLevel = levels[t];
        return botAnswer(m, d, t);
    };
    const duel = new DuelSession(engine, { seed: [String(20000 + g), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [a.deck, b.deck], names: [a.key, b.key], bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    try {
        duel.start();
    } catch (e) {
        console.log(`game ${g}: error ${(e as Error).message}`);
        continue;
    }
    const w = duel.result?.winner;
    if (w === undefined || w === null) continue;
    const turns = duel.view(0).turn;
    appendFileSync(out, rows.map((r) => JSON.stringify({ g, y: r.team === w ? 1 : 0, turn: r.turn, left: turns - r.turn, f: r.f })).join('\n') + (rows.length ? '\n' : ''));
    written += rows.length;
    console.log(`game ${g}: ${a.key} v ${b.key} (${levels.join(' v ')}): ${w === 0 ? a.key : b.key} wins in ${turns} turns, ${rows.length} positions`);
}
console.log(`${written} positions${mismatch ? `; ${mismatch} where the features don't add up to the score` : ''}`);
