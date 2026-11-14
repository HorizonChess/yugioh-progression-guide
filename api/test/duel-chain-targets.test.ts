import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt, DuelView } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const CHANGE_OF_HEART = 4031928, GEMINI_ELF = 69140098, WABOKU = 12607053;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// You activate Change of Heart on your rival's Gemini Elf; your rival, with a Set Waboku, is asked to
// respond. Their chain link shows what it targets, so the question can say so.
describe.skipIf(!engineDataAvailable())('a chain link that targets', () => {
    it('names its targets in the view of the player asked to respond', async () => {
        const engine = await loadEngine();
        const rival = Array.from({ length: 40 }, (_, i) => (i % 2 ? WABOKU : GEMINI_ELF));
        const duel = new DuelSession(engine, { seed: ['1', '2', '3', '4'], mode: 'MR1', decks: [{ main: Array(40).fill(CHANGE_OF_HEART), extra: [] }, { main: rival, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
        duel.start();
        let seen: DuelView | null = null;
        for (let i = 0; i < 400 && !duel.result && !seen; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 6) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const pick = team === 0
                    ? p.actions.find((x) => x.verb === 'activate' && x.code === CHANGE_OF_HEART && s.view.opp.monsters.some(Boolean))
                    : p.actions.find((x) => x.verb === 'summon') ?? p.actions.find((x) => x.verb === 'set-spell');
                a = { kind: 'choice', id: pick ? pick.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'chain') {
                if (team === 1 && s.view.chain.some((l) => l.code === CHANGE_OF_HEART)) seen = s.view;
                a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
            } else a = generic(p);
            if (!seen) expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        expect(seen).not.toBeNull();
        const link = seen!.chain.find((l) => l.code === CHANGE_OF_HEART)!;
        const elf = seen!.me.monsters.find((m) => m?.code === GEMINI_ELF)!;
        expect(link.side).toBe('opp');
        expect(link.targets).toEqual([elf.uid]);
    });
});
