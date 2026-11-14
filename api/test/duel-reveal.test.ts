import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelEvent, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';

// Confiscation: look at your opponent's hand, pick a card from it. The pick names their cards
// (they were shown to you); anywhere else, the rival's hand stays hidden in a question. The look
// comes just before the pick and the pick holds every card shown, so the board shows them once:
// in the pick, with no banner first.
const CONFISCATION = 17375316;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];

const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
    if (p.kind === 'actions') return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
    return { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };
};

describe.skipIf(!engineDataAvailable())('seeing the rival\'s cards', () => {
    it('Confiscation picks from their hand by name; otherwise their hand stays hidden', async () => {
        const mine = [...Array<number>(20).fill(CONFISCATION), ...Array.from({ length: 20 }, (_, i) => MON[i % MON.length]!)];
        const theirs = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
        const duel = new DuelSession(await loadEngine(), { seed: ['2', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: mine, extra: [] }, { main: theirs, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
        duel.start();
        let picks = 0;
        let look: Extract<DuelEvent, { k: 'reveal' }> | undefined;
        for (let i = 0; i < 300 && !duel.result && picks < 2; i++) {
            for (const f of duel.takeFrames(0)) for (const e of f.events) if (e.k === 'reveal') look = e;
            const team = duel.waitingFor()!;
            const { prompt, seq } = duel.state(team, 'd');
            const p = prompt!;
            let a = generic(p);
            if (team === 0 && p.kind === 'actions') {
                const c = p.actions.find((x) => x.verb === 'activate' && x.code === CONFISCATION);
                if (c) a = { kind: 'choice', id: c.id };
            }
            if (p.kind === 'cards' && p.cards.some((c) => c.side === 'opp' && c.where === 'hand')) {
                const hand = p.cards.filter((c) => c.side === 'opp' && c.where === 'hand');
                if (team === 0 && p.title !== '') {
                    // Confiscation showed their hand: the pick names every card.
                    expect(hand.every((c) => c.code > 0)).toBe(true);
                    expect(look).toMatchObject({ side: 'opp', by: 'me', from: 'hand' });
                    expect(look!.codes.length).toBe(hand.length);
                    expect(look!.codes.every((code) => hand.some((c) => c.code === code))).toBe(true);
                    look = undefined;
                    picks++;
                }
            }
            expect(duel.answer(team, seq, a)).toBe(true);
        }
        expect(picks).toBeGreaterThan(0);
    });
});
