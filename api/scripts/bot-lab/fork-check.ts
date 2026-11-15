// Bot lab: the look-ahead forked from a saved copy (bot-sim.ts) against rebuilding the copy for
// every try: at each of the hard bot's decisions, both must choose the same.
//   npx tsx scripts/bot-lab/fork-check.ts [games = 3]
import type { OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer } from '@ygo/duel/bot';
import { simStats, simTuning } from '@ygo/duel/bot-sim';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const games = Number(process.argv[2] ?? 3);
const engine = await loadEngine();
engine.simCore();
while (!engine.simCore()) await new Promise((r) => setTimeout(r, 20));
const decks = DUELISTS.filter((d) => d.level !== 'easy').flatMap((d) => d.eras.flatMap((e) => [e.id, ...(e.competitive ? [`${e.id}+`] : [])].map((era) => duelistDeck(d, era).deck)));
let decisions = 0, differ = 0, msFork = 0, msReplay = 0;
const json = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));
for (let g = 0; g < games; g++) {
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        (d.setup as { botLevel?: string }).botLevel = 'hard';
        const state = d.saveState();
        simTuning.fork = false;
        let t0 = performance.now();
        const slow = botAnswer(m, d, t);
        msReplay += performance.now() - t0;
        d.loadState(state);
        simTuning.fork = true;
        t0 = performance.now();
        const fast = botAnswer(m, d, t);
        msFork += performance.now() - t0;
        decisions++;
        if (json(slow) !== json(fast)) {
            differ++;
            if (differ <= 5) console.log(`  differ at answer ${d.answers.length} (type ${m.type}): replay ${json(slow)}, fork ${json(fast)}`);
        }
        return fast;
    };
    const duel = new DuelSession(engine, { seed: [String(41000 + g), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [decks[(g * 5 + 2) % decks.length]!, decks[(g * 7 + 9) % decks.length]!], names: ['A', 'B'], bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    try {
        duel.start();
    } catch (e) {
        console.log(`game ${g}: error ${(e as Error).stack}`);
    }
    console.log(`game ${g}: ${duel.view(0).turn} turns, winner ${duel.result?.winner}`);
}
console.log(`${decisions} decisions, ${differ} differ; thinking ${(msReplay / 1000).toFixed(1)} s rebuilding every try, ${(msFork / 1000).toFixed(1)} s forked (${simStats.forks} forks)`);
