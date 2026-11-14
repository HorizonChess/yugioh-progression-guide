import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, engineFaulted, loadEngine } from '../src/duel/engine';
import { DUEL_RULES, DuelSession } from '@ygo/duel/session';

const DOUBLE_SPELL = 24096228, GEMINI_ELF = 69140098;
const first = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
    if (p.kind === 'actions') return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
    return { kind: 'choice', id: 1 };
};
/** Both players only end their turns (discarding when their hand is over six), up to `turns`. */
function passTurns(duel: DuelSession, turns: number) {
    for (let i = 0; i < 400 && !duel.result; i++) {
        const team = duel.waitingFor();
        if (team === null) return;
        const s = duel.state(team, 'd');
        if (s.view.turn > turns) return;
        duel.answer(team, s.seq, first(s.prompt!));
    }
}

// Double Spell checks whether a Spell in the rival's Graveyard could be activated. With a Double
// Spell in each Graveyard they check each other without end, and the WASM core's stack runs out:
// not an error the core reports, but the core itself failing, for every duel running on it.
describe.skipIf(!engineDataAvailable())('the engine failing', () => {
    it('is told apart from a refused move, and a new engine plays on', async () => {
        const engine = await loadEngine();
        const decks = [{ main: Array<number>(40).fill(DOUBLE_SPELL), extra: [] }, { main: Array<number>(40).fill(DOUBLE_SPELL), extra: [] }] as [{ main: number[]; extra: number[] }, { main: number[]; extra: number[] }];
        const doomed = new DuelSession(engine, { seed: ['3', '1', '4', '1'], mode: 'MR1', decks, names: ['A', 'B'], bots: [false, false], rules: DUEL_RULES });
        doomed.start();
        // By turn 5 each has discarded a Double Spell, and the turn player holds more.
        let fault: unknown = null;
        try {
            passTurns(doomed, 8);
        } catch (error) {
            fault = error;
        }
        expect(fault).not.toBeNull();
        expect(engineFaulted(fault)).toBe(true);
        expect(engineFaulted(new Error('The bot gave an answer the engine refused'))).toBe(false);

        // The old core is finished: even a new duel on it fails. A revived engine plays normally.
        const broken = engine.core;
        await engine.revive();
        expect(engine.core).not.toBe(broken);
        const elves = { main: Array<number>(40).fill(GEMINI_ELF), extra: [] };
        const duel = new DuelSession(engine, { seed: ['3', '1', '4', '1'], mode: 'MR1', decks: [elves, elves], names: ['A', 'B'], bots: [false, false], rules: DUEL_RULES });
        duel.start();
        passTurns(duel, 6);
        expect(duel.state(0, 'd').view.turn).toBeGreaterThan(6);
        duel.destroy();
    });
});
