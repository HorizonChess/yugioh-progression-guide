import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { counterSplits, DuelSession } from '../src/duel/session';

const SPELLBOOK_ORGANIZATION = 96677818, GEMINI_ELF = 69140098;
// Normal Monsters, all different, so the top of the Deck can be read off the next draw.
const NORMALS = [85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 91152256, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 16353197];
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// Spellbook Organization: "place the top 3 cards of your Deck in any order". You're asked, and the
// card you choose first is the one you draw next.
describe.skipIf(!engineDataAvailable())('ordering the top of the Deck', () => {
    it('asks the player, and the first card chosen goes on top', async () => {
        const engine = await loadEngine();
        const main = Array.from({ length: 40 }, (_, i) => (i % 4 === 0 ? SPELLBOOK_ORGANIZATION : NORMALS[i % NORMALS.length]!));
        const duel = new DuelSession(engine, { seed: ['3', '1', '4', '1'], mode: 'MR1', decks: [{ main, extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 4 });
        duel.start();
        let first: number | null = null, sortedOn = 0, played = false;
        for (let i = 0; i < 400 && !duel.result; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (first !== null && team === 0 && s.view.turn > sortedOn && p.kind === 'actions') {
                // The card drawn this turn is the newest in hand.
                expect(s.view.me.hand.at(-1)!.code).toBe(first);
                // The answers go to storage as plain data, and the duel rebuilds from them to the same place.
                const stored = JSON.parse(JSON.stringify(duel.answers));
                const rebuilt = new DuelSession(engine, duel.setup);
                rebuilt.start(stored);
                expect(rebuilt.state(0, 'd').view).toEqual(s.view);
                return;
            }
            if (s.view.turn > 9) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const play = played ? undefined : p.actions.find((x) => x.verb === 'activate' && x.code === SPELLBOOK_ORGANIZATION);
                if (play) played = true;
                a = { kind: 'choice', id: play ? play.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'cards' && p.ordered) {
                // A three-step cycle (the second card first), so the engine's reading of the answer shows.
                expect(p.cards).toHaveLength(3);
                expect(p.cards.every((c) => c.code > 0)).toBe(true);
                const ids = [p.cards[1]!.id, p.cards[2]!.id, p.cards[0]!.id];
                first = p.cards[1]!.code;
                sortedOn = s.view.turn;
                a = { kind: 'many', ids };
            } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
            else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        throw new Error(first === null ? 'never asked to order the cards' : 'never drew again');
    });
});

describe('ways to take counters', () => {
    it('lists every split, the first cards first', () => {
        expect(counterSplits(2, [2, 1])).toEqual([[2, 0], [1, 1]]);
        expect(counterSplits(1, [1, 1, 1])).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
        expect(counterSplits(3, [1, 1])).toEqual([]);
    });
});
