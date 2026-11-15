// Bot lab: what the hard bot's look-ahead costs, and how much of it is rebuilding the duel (replaying
// it from its seed) rather than playing the tried answer on.
//   npx tsx scripts/bot-lab/sim-cost.ts [games = 4]
// Per game and by stage of the duel (turns 1-4, 5-8, 9+): look-aheads, ms each, and the replay's share.
import type { OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer } from '@ygo/duel/bot';
import { simStats, simTuning } from '@ygo/duel/bot-sim';
simTuning.fork = process.env.FORK !== '0';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const games = Number(process.argv[2] ?? 4);
const engine = await loadEngine();
engine.simCore();
while (!engine.simCore()) await new Promise((r) => setTimeout(r, 20));
const decks = DUELISTS.filter((d) => d.level !== 'easy').flatMap((d) => d.eras.map((e) => duelistDeck(d, e.id).deck));
const stages = [0, 0, 0].map(() => ({ runs: 0, ms: 0, replayMs: 0 }));
for (let g = 0; g < games; g++) {
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        (d.setup as { botLevel?: string }).botLevel = 'hard';
        const before = { ...simStats };
        const r = botAnswer(m, d, t);
        const turn = d.view(t).turn, s = stages[turn <= 4 ? 0 : turn <= 8 ? 1 : 2]!;
        s.runs += simStats.runs - before.runs;
        s.ms += simStats.ms - before.ms;
        s.replayMs += simStats.replayMs - before.replayMs;
        return r;
    };
    const duel = new DuelSession(engine, { seed: [String(31000 + g), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [decks[(g * 5 + 1) % decks.length]!, decks[(g * 7 + 4) % decks.length]!], names: ['A', 'B'], bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    const t0 = performance.now();
    try {
        duel.start();
    } catch (e) {
        console.log(`game ${g}: error ${(e as Error).message}`);
    }
    console.log(`game ${g}: ${duel.view(0).turn} turns, ${duel.answers.length} answers, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
for (const [i, s] of stages.entries()) {
    console.log(`turns ${['1-4', '5-8', '9+'][i]}: ${s.runs} look-aheads, ${(s.ms / (s.runs || 1)).toFixed(1)} ms each, replay ${(100 * s.replayMs / (s.ms || 1)).toFixed(0)}%`);
}
