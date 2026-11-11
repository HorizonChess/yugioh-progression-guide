import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession, type DuelSetup } from '../src/duel/session';

const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];
const deck = { main: Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!), extra: [] };
const answer = (p: DuelPrompt): DuelAnswer =>
    p.kind === 'actions' ? { kind: 'choice', id: (p.actions.find((x) => x.verb === 'summon') ?? p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id }
    : p.kind === 'chain' ? { kind: 'choice', id: p.pass ?? p.options[0]!.id }
    : p.kind === 'place' ? { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) }
    : p.kind === 'cards' ? { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) }
    : { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };

// Duels stored before the fix lost the answers the server gave by itself before the first move
// (it counted them as stored without storing them), and couldn't be rebuilt after a restart.
// Rebuilding with `repair` gives those again and lands where the duel was.
describe.skipIf(!engineDataAvailable())('a duel that lost its opening answers', () => it('is repaired', async () => {
    const engine = await loadEngine();
    let checked = 0;
    for (let n = 1; n <= 12 && checked < 3; n++) {
        const setup: DuelSetup = { seed: [String(n), '2', '3', '4'], mode: 'MR1', decks: [deck, deck], names: ['A', 'B'], bots: [false, true], rules: 3 };
        const duel = new DuelSession(engine, setup);
        duel.start();
        const lost = duel.answers.length;
        if (!lost) continue;
        for (let i = 0; i < 8; i++) {
            const t = duel.waitingFor()!;
            const s = duel.state(t, 'd');
            expect(duel.answer(t, s.seq, answer(s.prompt!))).toBe(true);
        }
        const stored = duel.answers.slice(lost);
        expect(() => new DuelSession(engine, setup).start(stored)).toThrow(/could not be rebuilt/);
        const repaired = new DuelSession(engine, setup);
        repaired.start(stored, { repair: true });
        expect(repaired.answers).toEqual(duel.answers);
        expect(repaired.state(0, 'd').view).toEqual(duel.state(0, 'd').view);
        checked++;
    }
    expect(checked).toBeGreaterThan(0);
}));
