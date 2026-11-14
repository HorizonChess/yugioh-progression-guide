import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession, type DuelSetup } from '@ygo/duel/session';
const JINZO = 77585513;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};
// Backing out of a Tribute Summon puts you back where you were, with the monster still in hand.
describe.skipIf(!engineDataAvailable())('tribute summons', () => it('can be cancelled at the tribute pick', async () => {
    const engine = await loadEngine();
    const me = Array.from({ length: 40 }, (_, i) => (i % 2 ? JINZO : MON[i % MON.length]!));
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: MON.concat(MON, MON, MON, MON, MON), extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
    duel.start();
    let cancelled = false, after: DuelPrompt | null = null;
    for (let i = 0; i < 600 && !duel.result && !after; i++) {
        const team = duel.waitingFor();
        if (team === null) throw new Error('nobody to answer');
        const s = duel.state(team, 'd'); const p = s.prompt!;
        let a: DuelAnswer;
        if (p.kind === 'cards' && p.tribute && team === 0 && !cancelled) { a = { kind: 'cancel' }; cancelled = true; }
        else if (p.kind === 'actions') {
            if (cancelled && team === 0) { after = p; break; }
            const jinzo = team === 0 ? p.actions.find((x) => x.verb === 'summon' && x.code === JINZO) : undefined;
            const set = s.view.me.monsters.some(Boolean) ? undefined : p.actions.find((x) => x.verb === 'set');
            const x = jinzo ?? set;
            a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else a = generic(p);
        expect(duel.answer(team, s.seq, a), JSON.stringify(p).slice(0, 300)).toBe(true);
    }
    expect(cancelled).toBe(true);
    expect(after).not.toBeNull();
    expect(duel.state(0, 'd').view.me.hand.some((c) => c.code === JINZO)).toBe(true);
    // Then go through with it: the Set monster goes, Jinzo comes out.
    let summoned = false;
    for (let i = 0; i < 50 && !summoned; i++) {
        const team = duel.waitingFor()!;
        const s = duel.state(team, 'd'); const p = s.prompt!;
        let a: DuelAnswer;
        if (p.kind === 'actions') {
            if (team === 0 && s.view.me.monsters.some((c) => c?.code === JINZO)) { summoned = true; break; }
            const jinzo = team === 0 ? p.actions.find((x) => x.verb === 'summon' && x.code === JINZO) : undefined;
            a = { kind: 'choice', id: jinzo ? jinzo.id : (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else a = generic(p);
        expect(duel.answer(team, s.seq, a), JSON.stringify(p).slice(0, 300)).toBe(true);
    }
    expect(summoned).toBe(true);
}));

// "Back": a move still being set up (its zone, its Tributes) is taken back by rebuilding the duel
// from the answers before it: the monster is back in hand and the turn goes on.
describe.skipIf(!engineDataAvailable())('taking a move back', () => it('rebuilds the duel from before it', async () => {
    const engine = await loadEngine();
    const me = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
    const setup: DuelSetup = { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: me, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 };
    const duel = new DuelSession(engine, setup);
    duel.start();
    let back: ReturnType<DuelSession['backAnswers']> = null, summoned = 0;
    for (let i = 0; i < 100 && !back; i++) {
        const team = duel.waitingFor()!;
        const s = duel.state(team, 'd'); const p = s.prompt!;
        if (team === 0 && p.kind === 'place') {
            expect(p.back).toBe(true);
            back = duel.backAnswers(0);
            break;
        }
        let a: DuelAnswer;
        if (p.kind === 'actions') {
            const x = team === 0 ? p.actions.find((x) => x.verb === 'summon') : undefined;
            if (x) summoned = x.code;
            a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else a = generic(p);
        expect(duel.answer(team, s.seq, a)).toBe(true);
    }
    expect(back).not.toBeNull();
    const rebuilt = new DuelSession(engine, setup);
    rebuilt.start(back!);
    const s = rebuilt.state(0, 'd');
    expect(s.prompt?.kind).toBe('actions');
    expect(s.view.me.hand.some((c) => c.code === summoned)).toBe(true);
    expect(s.view.me.monsters.some(Boolean)).toBe(false);
    // Once something shows on the board, there's no going back.
    expect(rebuilt.backAnswers(0)).toBeNull();
}));
