import { loadEngine } from '../../src/duel/engine';
import { DuelSession } from '../../src/duel/session';
import { BEATDOWN, TRICKS } from './decks';
const engine = await loadEngine();
for (let i = 0; i < 5; i++) {
    const setup = { seed: [String(i + 1), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1' as const, decks: [{ main: BEATDOWN, extra: [] }, { main: TRICKS, extra: [] }], names: ['A', 'B'] as [string, string], bots: [true, true] as [boolean, boolean], rules: 2 };
    let t = performance.now();
    const duel = new DuelSession(engine, setup as never);
    try { duel.start(); } catch (e) { console.log('error', (e as Error).message); }
    const play = performance.now() - t;
    const answers = [...duel.answers];
    t = performance.now();
    const again = new DuelSession(engine, { ...setup, bots: [false, false] } as never);
    again.start(answers);
    const replay = performance.now() - t;
    console.log(`duel ${i}: ${answers.length} answers, result ${JSON.stringify(duel.result)}, play ${play.toFixed(0)}ms, replay ${replay.toFixed(0)}ms`);
}
