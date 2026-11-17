import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

// Painful Choice: its player picks 5 cards from their Deck and shows them to the rival, who picks the
// one they add to their hand. The rival's pick names all five (they were shown); before the fix it
// held five nameless cards, drawn as "Set card".
const PAINFUL_CHOICE = 74191942;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];

const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
    if (p.kind === 'actions') return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
    return { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };
};

describe.skipIf(!engineDataAvailable())('cards shown from the Deck', () => {
    it("Painful Choice: the rival's pick names the five cards shown; the Deck stays hidden otherwise", async () => {
        const mine = [...Array<number>(10).fill(PAINFUL_CHOICE), ...Array.from({ length: 30 }, (_, i) => MON[i % MON.length]!)];
        const theirs = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
        const duel = new DuelSession(await loadEngine(), { seed: ['2', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: mine, extra: [] }, { main: theirs, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
        duel.start();
        let picks = 0;
        let ownDeckPicks = 0;
        for (let i = 0; i < 400 && !duel.result && picks < 2; i++) {
            duel.takeFrames(0);
            const team = duel.waitingFor()!;
            const { prompt, seq } = duel.state(team, 'd');
            const p = prompt!;
            let a = generic(p);
            if (team === 0 && p.kind === 'actions') {
                const c = p.actions.find((x) => x.verb === 'activate' && x.code === PAINFUL_CHOICE);
                if (c) a = { kind: 'choice', id: c.id };
            }
            if (p.kind === 'cards' && p.cards.some((c) => c.where === 'deck')) {
                const deck = p.cards.filter((c) => c.where === 'deck');
                if (team === 0) {
                    // Choosing the five from your own Deck: your own cards, named.
                    expect(deck.every((c) => c.side === 'me' && c.code > 0)).toBe(true);
                    ownDeckPicks++;
                } else {
                    // The rival picks among the five shown: every one named.
                    expect(deck).toHaveLength(5);
                    expect(deck.every((c) => c.side === 'opp' && c.code > 0)).toBe(true);
                    picks++;
                }
            }
            expect(duel.answer(team, seq, a)).toBe(true);
        }
        expect(ownDeckPicks).toBeGreaterThan(0);
        expect(picks).toBeGreaterThan(0);
    });
});
