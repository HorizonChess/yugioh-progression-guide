import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';

const NEGATE_ATTACK = 14315573, GEMINI_ELF = 69140098;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// You Set Negate Attack; the bot's Gemini Elf attacks into it. The board is told the attack
// was negated, and whose it was.
describe.skipIf(!engineDataAvailable())('a negated attack', () => {
    it('is reported to both players', async () => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, { seed: ['5', '6', '7', '8'], mode: 'MR1', decks: [{ main: Array(40).fill(NEGATE_ATTACK), extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
        duel.start();
        for (let i = 0; i < 400 && !duel.result; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 5) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const set = p.actions.find((x) => x.verb === 'set-spell');
                a = { kind: 'choice', id: set ? set.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'chain') {
                const negate = p.options.find((o) => o.code === NEGATE_ATTACK);
                a = { kind: 'choice', id: negate ? negate.id : (p.pass ?? p.options[0]!.id) };
            } else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        const mine = duel.takeFrames(0).flatMap((f) => f.events).filter((e) => e.k === 'attack-negated');
        const theirs = duel.takeFrames(1).flatMap((f) => f.events).filter((e) => e.k === 'attack-negated');
        expect(mine.length).toBeGreaterThan(0);
        expect(mine[0]).toMatchObject({ side: 'opp' });
        expect(theirs[0]).toMatchObject({ side: 'me' });
    });
});
