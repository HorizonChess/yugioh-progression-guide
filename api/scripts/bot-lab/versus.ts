// Bot lab: the bot against the bot as it was (scripts/bot-lab/prev/, a copy taken before a change),
// with the duelists' own decks.
//   npx tsx scripts/bot-lab/versus.ts [level] [pairs] [prev level]
// Before a change, take the copy: duel/src/bot.ts, bot-sim.ts and bot-eval.ts into scripts/bot-lab/prev/,
// with their './session' and './engine' imports made '@ygo/duel/session' and '@ygo/duel/engine'.
// FROM=n starts at pair n (to run a few at once).
// Each pair of decks is played twice, each bot with each deck (and going first once), so the decks
// and the coin even out. Prints the score, and how long each bot thought.
import type { OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer, type BotLevel } from '@ygo/duel/bot';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';
import { botAnswer as prevAnswer } from './prev/bot';

const [level = 'hard', pairs = '10', prevLevel = level] = process.argv.slice(2);
const engine = await loadEngine();
const decks = DUELISTS.filter((d) => d.level !== 'easy').flatMap((d) => d.eras.flatMap((e) => [`${d.id}:${e.id}`, ...(e.competitive ? [`${d.id}:${e.id}+`] : [])]))
    .map((key) => { const [id, era] = key.split(':'); return { key, deck: duelistDeck(DUELISTS.find((d) => d.id === id)!, era).deck }; });

const score = { now: 0, prev: 0, draw: 0, errors: 0 };
let last = '';
const only = process.env.PAIR;
const think = { now: [] as number[], prev: [] as number[] };
const from = Number(process.env.FROM ?? 0);
for (let p = from; p < from + Number(pairs); p++) {
    if (only !== undefined && String(p) !== only) continue;
    const a = decks[(p * 7 + 3) % decks.length]!, b = decks[(p * 11 + 8) % decks.length]!;
    for (const nowSeat of [0, 1] as const) {
        const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
            const now = t === nowSeat;
            (d.setup as { botLevel?: BotLevel }).botLevel = (now ? level : prevLevel) as BotLevel;
            const t0 = performance.now();
            const r = now ? botAnswer(m, d, t) : prevAnswer(m, d, t);
            think[now ? 'now' : 'prev'].push(performance.now() - t0);
            last = `${now ? 'now' : 'prev'} t${d.view(t).turn} ${JSON.stringify(m, (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 900)}
  => ${JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? String(v) : v))}`;
            return r;
        };
        const names: [string, string] = nowSeat === 0 ? [`now ${a.key}`, `prev ${b.key}`] : [`prev ${a.key}`, `now ${b.key}`];
        const duel = new DuelSession(engine, { seed: [String(7000 + p), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [a.deck, b.deck], names, bots: [true, true], rules: DUEL_RULES } as never, { answerer });
        try {
            duel.start();
        } catch (e) {
            score.errors++;
            console.log(`pair ${p}: error ${(e as Error).message}
${last}`);
            continue;
        }
        const w = duel.result?.winner;
        const who = w === undefined || w === null ? 'draw' : w === nowSeat ? 'now' : 'prev';
        score[who]++;
        console.log(`pair ${p} ${names.join(' v ')}: ${who === 'draw' ? `draw (${duel.result?.reason})` : `${who} wins`} in ${duel.view(0).turn} turns`);
    }
}
const stats = (xs: number[]) => {
    xs.sort((x, y) => x - y);
    const q = (p: number) => xs[Math.floor(p * (xs.length - 1))]!.toFixed(0);
    return `median ${q(0.5)} ms, p90 ${q(0.9)}, p99 ${q(0.99)}, max ${q(1)}, total ${(xs.reduce((s, x) => s + x, 0) / 1000).toFixed(0)} s`;
};
console.log(`\nnow ${score.now}, prev ${score.prev}, draws ${score.draw}, errors ${score.errors}`);
console.log(`now thinks:  ${stats(think.now)}\nprev thinks: ${stats(think.prev)}`);
