import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelEvent, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DUEL_RULES, DuelSession } from '../src/duel/session';

const QUESTION = 38723936, REVERSAL_QUIZ = 5990062, OOKAZI = 19523799, GEMINI_ELF = 69140098, CELTIC_GUARDIAN = 91152256;
const first = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
    if (p.kind === 'actions') return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
    return { kind: 'choice', id: 1 };
};
const setup = (mine: number[]) => ({ seed: ['3', '1', '4', '1'] as [string, string, string, string], mode: 'MR1' as const, decks: [{ main: mine, extra: [] }, { main: Array<number>(40).fill(GEMINI_ELF), extra: [] }] as [{ main: number[]; extra: number[] }, { main: number[]; extra: number[] }], names: ['A', 'B'] as [string, string], bots: [false, false] as [boolean, boolean], rules: DUEL_RULES });

// Question: the rival names the first monster in your Graveyard from memory. While it's on the
// chain your Graveyard is closed to them: its cards come without names, in questions too.
describe.skipIf(!engineDataAvailable())('Question', () => {
    const playQuestion = async (guess: string) => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, setup(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? QUESTION : CELTIC_GUARDIAN))));
        duel.start();
        let asked: { prompt: DuelPrompt; rivalGrave: { code: number; faceUp: boolean }[]; hidden: boolean | undefined; ownGrave: number[]; before: number[] } | null = null;
        for (let i = 0; i < 400 && !duel.result && duel.state(0, 'd').view.turn <= 6; i++) {
            const team = duel.waitingFor()!;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            let a = first(p);
            // Team 0 discards a Celtic Guardian at the end of turn 3 (seven cards in hand), then plays Question.
            if (team === 0 && p.kind === 'cards' && p.title.includes('discard')) a = { kind: 'many', ids: [p.cards.find((c) => c.code === CELTIC_GUARDIAN)!.id] };
            if (team === 0 && p.kind === 'actions' && !asked) {
                const act = p.actions.find((x) => x.verb === 'activate' && x.code === QUESTION);
                if (act) a = { kind: 'choice', id: act.id };
            }
            if (p.kind === 'card-name') {
                expect(team).toBe(1);
                asked = { prompt: p, rivalGrave: s.view.opp.grave, hidden: s.view.opp.graveHidden, ownGrave: duel.state(0, 'd').view.me.grave.map((c) => c.code), before: [] };
                a = { kind: 'name', name: guess };
            }
            expect(duel.answer(team, s.seq, a)).toBe(true);
            // Once Question has resolved (a wrong guess first asks its owner where the monster goes).
            if (asked && !duel.state(1, 'd').view.chain.length) return { asked, after: duel.state(1, 'd').view, mine: duel.state(0, 'd').view };
        }
        throw new Error('Question was never asked');
    };

    it('closes the Graveyard to the player who has to name its first monster', async () => {
        const { asked, after } = await playQuestion('Gemini Elf');
        expect(asked.prompt).toMatchObject({ kind: 'card-name', only: 'monster', title: "Declare a monster's name" });
        // The owner still sees their Graveyard; the rival sees only that cards are there.
        expect(asked.ownGrave).toContain(CELTIC_GUARDIAN);
        expect(asked.hidden).toBe(true);
        expect(asked.rivalGrave.length).toBe(asked.ownGrave.length);
        expect(asked.rivalGrave.every((c) => c.code === 0 && !c.faceUp)).toBe(true);
        // Once it has resolved the Graveyard is open again.
        expect(after.opp.graveHidden).toBeUndefined();
        expect(after.opp.grave.every((c) => c.code > 0)).toBe(true);
    });

    it('Special Summons the monster on a wrong guess and banishes it on a right one', async () => {
        const wrong = await playQuestion('Gemini Elf');
        expect(wrong.mine.me.monsters.some((c) => c?.code === CELTIC_GUARDIAN)).toBe(true);
        const right = await playQuestion('Celtic Guardian');
        expect(right.mine.me.banished.map((c) => c.code)).toContain(CELTIC_GUARDIAN);
        expect(right.mine.me.monsters.every((c) => !c)).toBe(true);
    });
});

// Reversal Quiz: declare a card type, reveal the top of your Deck, and swap Life Points on a hit.
describe.skipIf(!engineDataAvailable())('Reversal Quiz', () => {
    it('asks for a card type by name, and the swapped Life Points are an event of their own', async () => {
        const engine = await loadEngine();
        // Every card is a Spell, so "Spell Cards" is always right. Ookazi first, so the totals differ.
        const duel = new DuelSession(engine, setup(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? REVERSAL_QUIZ : OOKAZI))));
        duel.start();
        const events: DuelEvent[] = [];
        let title = '', burned = false, quizzed = false;
        for (let i = 0; i < 400 && !duel.result && !events.some((e) => e.k === 'lp'); i++) {
            const team = duel.waitingFor()!;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 6) break;
            let a = first(p);
            if (team === 0 && p.kind === 'actions') {
                const act = p.actions.find((x) => x.verb === 'activate' && x.code === (burned ? REVERSAL_QUIZ : OOKAZI));
                if (act && !quizzed) {
                    a = { kind: 'choice', id: act.id };
                    if (burned) quizzed = true;
                    burned = true;
                }
            }
            if (p.kind === 'option') {
                title = p.title;
                expect(p.options.map((o) => o.text)).toEqual(['Monster Cards', 'Spell Cards', 'Trap Cards']);
                a = { kind: 'choice', id: 1 };
            }
            expect(duel.answer(team, s.seq, a)).toBe(true);
            for (const f of duel.takeFrames(0)) events.push(...f.events);
        }
        expect(title).toBe('Declare 1 card type');
        // Ookazi took the rival to 7200: after the swap you have 7200 and they have 8000.
        expect(events.filter((e) => e.k === 'lp')).toEqual([{ k: 'lp', side: 'me', lp: 7200, was: 8000 }, { k: 'lp', side: 'opp', lp: 8000, was: 7200 }]);
        const view = duel.state(0, 'd').view;
        expect([view.me.lp, view.opp.lp]).toEqual([7200, 8000]);
    });
});

// Convulsion of Nature turns both Decks over: each one's top card is in the view, for both players.
describe.skipIf(!engineDataAvailable())('Decks turned over', () => {
    it('shows the top card of each Deck to both players, and it is the card drawn next', async () => {
        const CONVULSION = 62966332;
        const engine = await loadEngine();
        const duel = new DuelSession(engine, setup(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? CONVULSION : CELTIC_GUARDIAN))));
        duel.start();
        expect(duel.state(0, 'd').view.me.deckTop).toBeUndefined();
        let used = false, seen = 0, drawn = 0;
        // Each player's Deck as last seen: its size, its top card, and the hand then.
        const last: ({ deck: number; top: number | undefined; hand: number[] } | null)[] = [null, null];
        for (let i = 0; i < 400 && !duel.result; i++) {
            const team = duel.waitingFor()!;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 8) break;
            const [mine, theirs] = [duel.state(0, 'd').view, duel.state(1, 'd').view];
            if (mine.me.spells.some((c) => c?.code === CONVULSION && c.faceUp) && !mine.chain.length) {
                // Both players see the same two top cards.
                expect(mine.me.deckTop).toBeGreaterThan(0);
                expect(mine.opp.deckTop).toBe(GEMINI_ELF);
                expect(theirs.opp.deckTop).toBe(mine.me.deckTop);
                expect(theirs.me.deckTop).toBe(GEMINI_ELF);
                seen++;
            }
            for (const t of [0, 1] as const) {
                const v = t === 0 ? mine.me : theirs.me, was = last[t];
                // One card drawn since the last look: it's the card that was on top. (The hand is
                // shuffled after a draw everyone saw, so it's found by what the hand gained.)
                const hand = v.hand.map((c) => c.code);
                if (was?.top && v.deck === was.deck - 1 && hand.length === was.hand.length + 1) {
                    const gained = [...hand];
                    for (const code of was.hand) gained.splice(gained.indexOf(code), 1);
                    expect(gained).toEqual([was.top]);
                    drawn++;
                }
                last[t] = { deck: v.deck, top: v.deckTop, hand };
            }
            let a = first(p);
            const act = team === 0 && !used && p.kind === 'actions' ? p.actions.find((x) => x.verb === 'activate' && x.code === CONVULSION) : undefined;
            if (act) {
                used = true;
                a = { kind: 'choice', id: act.id };
            }
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        expect(seen).toBeGreaterThan(2);
        expect(drawn).toBeGreaterThan(2);
    });
});
