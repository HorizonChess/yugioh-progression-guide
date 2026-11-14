import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const REINFORCEMENT = 32807846, CELTIC_GUARDIAN = 91152256, GEMINI_ELF = 69140098;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// You play Reinforcement of the Army: the Warrior it adds is shown to the rival, and the board
// says who showed what to whom. Both players see the card (the searcher knows it already).
describe.skipIf(!engineDataAvailable())('a card searched from the Deck', () => {
    it('is revealed to the rival', async () => {
        const engine = await loadEngine();
        const main = Array.from({ length: 40 }, (_, i) => (i % 2 ? REINFORCEMENT : CELTIC_GUARDIAN));
        const duel = new DuelSession(engine, { seed: ['1', '2', '3', '4'], mode: 'MR1', decks: [{ main, extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
        duel.start();
        for (let i = 0; i < 400 && !duel.result; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 3) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const play = p.actions.find((x) => x.verb === 'activate' && x.code === REINFORCEMENT);
                a = { kind: 'choice', id: play ? play.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
            else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        const mine = duel.takeFrames(0).flatMap((f) => f.events).filter((e) => e.k === 'reveal');
        const theirs = duel.takeFrames(1).flatMap((f) => f.events).filter((e) => e.k === 'reveal');
        expect(theirs.length).toBeGreaterThan(0);
        expect(theirs[0]).toMatchObject({ side: 'opp', by: 'me', codes: [CELTIC_GUARDIAN], count: 1 });
        expect(mine[0]).toMatchObject({ side: 'me', by: 'opp', codes: [CELTIC_GUARDIAN] });
    });
});
