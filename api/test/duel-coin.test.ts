import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';
const FAIRY_BOX = 21598948;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};
// Fairy Box: attack into it and its owner calls a coin toss; right, and the attacker's ATK is 0.
// Both the call and the toss reach the attacker's screen.
describe.skipIf(!engineDataAvailable())('coin tosses', () => it('shows the call and the toss to both players', async () => {
    const engine = await loadEngine();
    const me = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
    const box = [...Array(20).fill(FAIRY_BOX), ...me.slice(0, 20)];
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: box, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
    duel.start();
    const log: string[] = [];
    for (let i = 0; i < 800 && !duel.result; i++) {
        const team = duel.waitingFor();
        if (team === null) { log.push('NOBODY TO ANSWER'); break; }
        const s = duel.state(team, 'd'); const p = s.prompt!;
        const up = duel.state(1, 'd').view.me.spells.some((c) => c?.code === FAIRY_BOX && c.faceUp);
        let a: DuelAnswer;
        if (p.kind === 'actions') {
            const x = team === 0 ? (p.actions.find((a) => a.verb.startsWith('attack')) ?? p.actions.find((a) => a.verb === 'summon')) : (p.actions.find((a) => a.verb === 'set-spell') ?? p.actions.find((a) => a.verb === 'summon'));
            if (x?.verb.startsWith('attack') && up) log.push(`t${s.view.turn} A attacks into face-up Fairy Box`);
            a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'BP') ?? p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') {
            const o = team === 1 ? p.options.find((o) => o.code === FAIRY_BOX) : undefined;
            a = { kind: 'choice', id: o ? o.id : (p.pass ?? p.options[0]!.id) };
        } else a = generic(p);
        if (p.kind === 'option' && log.length < 60) log.push(`  ${team === 0 ? 'A' : 'B'} ${p.kind} ${JSON.stringify(p).slice(0, 110)}`);
        if (!duel.answer(team, s.seq, a)) { log.push('REFUSED ' + JSON.stringify(p).slice(0, 200)); break; }
    }
    const coins = duel.takeFrames(0).flatMap((f) => f.events).filter((e) => e.k === 'coin');
    expect(log.some((l) => l.includes('attacks into face-up Fairy Box'))).toBe(true);
    expect(coins.length).toBeGreaterThan(0);
    expect(coins[0]).toMatchObject({ side: 'opp', call: { side: 'opp' } });
    expect(log.some((l) => l.includes('Call the coin toss'))).toBe(true);
}));
