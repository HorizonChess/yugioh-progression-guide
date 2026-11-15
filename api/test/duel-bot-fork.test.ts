import { describe, expect, it } from 'vitest';
import type { OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer } from '@ygo/duel/bot';
import { simStats, simTuning } from '@ygo/duel/bot-sim';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

// The hard bot's look-ahead plays on from a saved copy of the duel (forked): it must choose just as
// it does rebuilding the copy from the duel's answers for every try.
describe.skipIf(!engineDataAvailable())('the bot looking ahead from a saved copy of the duel', () => {
    it('chooses as it does rebuilding the duel each time', async () => {
        const engine = await loadEngine();
        engine.simCore();
        while (!engine.simCore()) await new Promise((r) => setTimeout(r, 10));
        const deck = (id: string, era: string) => duelistDeck(DUELISTS.find((d) => d.id === id)!, era).deck;
        const json = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));
        const differ: string[] = [];
        let decisions = 0;
        const forks = simStats.forks;
        const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
            if (decisions++ > 120) throw new Error('enough');
            const state = d.saveState();
            simTuning.fork = false;
            const rebuilt = botAnswer(m, d, t);
            d.loadState(state);
            simTuning.fork = true;
            const forked = botAnswer(m, d, t);
            if (json(rebuilt) !== json(forked)) differ.push(`answer ${d.answers.length}: ${json(rebuilt)} / ${json(forked)}`);
            return forked;
        };
        const duel = new DuelSession(engine, { seed: ['41001', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [deck('kaiba', 'bc+'), deck('joey', 'bc')], names: ['A', 'B'], bots: [true, true], rules: DUEL_RULES, botLevel: 'hard' } as never, { answerer });
        try {
            duel.start();
        } catch (e) {
            if ((e as Error).message !== 'enough') throw e;
        }
        expect(decisions).toBeGreaterThan(60);
        expect(differ).toEqual([]);
        // One copy, kept up with the duel (not one per decision).
        expect(simStats.forks - forks).toBe(1);
    }, 120_000);
});
