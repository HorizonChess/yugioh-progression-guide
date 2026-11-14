import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const MON = [91152256, 76184692, 90357090, 15025844, 17814387, 74677422];
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// The pick of what to attack is marked, so the board can ask it with the glowing targets alone.
describe.skipIf(!engineDataAvailable())('attack targets', () => it('are a marked pick, and other picks are not', async () => {
    const engine = await loadEngine();
    const deck = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: deck, extra: [] }, { main: deck, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
    duel.start();
    let target: DuelPrompt | null = null;
    for (let i = 0; i < 800 && !duel.result && !target; i++) {
        const team = duel.waitingFor()!;
        const s = duel.state(team, 'd'); const p = s.prompt!;
        let a: DuelAnswer;
        if (p.kind === 'cards' && p.attack) { target = p; break; }
        if (p.kind === 'cards') expect(p.attack).toBeUndefined();
        if (p.kind === 'actions') {
            const x = p.actions.find((x) => x.verb.startsWith('attack')) ?? p.actions.find((x) => x.verb === 'summon');
            a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'BP') ?? p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else a = generic(p);
        expect(duel.answer(team, s.seq, a), JSON.stringify(p).slice(0, 300)).toBe(true);
    }
    expect(target).not.toBeNull();
}));
