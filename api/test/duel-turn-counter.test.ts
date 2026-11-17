import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const SWORDS = 72302403, GEMINI_ELF = 69140098;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// Swords of Revealing Light counts its turns; the board shows the count on the card.
describe.skipIf(!engineDataAvailable())('a card that counts turns', () => {
    it('shows the count on the card, and it grows each turn', async () => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, { seed: ['3', '1', '4', '1'], mode: 'MR1', decks: [{ main: Array(40).fill(SWORDS), extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 4 });
        duel.start();
        const seen: number[] = [];
        for (let i = 0; i < 600 && !duel.result; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            const swords = s.view.me.spells.find((c) => c?.code === SWORDS);
            if (team === 0 && swords?.turns !== undefined && seen.at(-1) !== swords.turns) seen.push(swords.turns);
            if (seen.length >= 2 || s.view.turn > 9) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const play = p.actions.find((x) => x.verb === 'activate' && x.code === SWORDS);
                a = { kind: 'choice', id: play ? play.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
            else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        expect(seen[0]).toBe(0);
        expect(seen[1]).toBeGreaterThan(0);
    });
});
