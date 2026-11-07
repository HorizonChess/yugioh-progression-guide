import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';

const LILY = 79575620;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };
};

// Injection Fairy Lily can only be used during damage calculation: on your own attack too, that
// moment is asked about (not passed quietly like the other chances on your own turn).
describe.skipIf(!engineDataAvailable())('the damage step', () => it('asks about Injection Fairy Lily when she attacks', async () => {
    const engine = await loadEngine();
    const me = Array.from({ length: 40 }, (_, i) => (i % 2 ? LILY : MON[i % MON.length]!));
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: MON.concat(MON, MON, MON, MON, MON), extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
    duel.start();
    let offered: DuelPrompt | null = null;
    for (let i = 0; i < 800 && !duel.result && !offered; i++) {
        const team = duel.waitingFor();
        if (team === null) throw new Error('nobody to answer');
        const s = duel.state(team, 'd'); const p = s.prompt!;
        let a: DuelAnswer;
        if (p.kind === 'chain' && team === 0 && p.options.some((o) => o.code === LILY)) {
            offered = p;
            break;
        }
        if (p.kind === 'actions') {
            // A: summon Lily and attack with her. B: Set a monster, then pass.
            const lily = team === 0 ? p.actions.find((x) => (x.verb === 'summon' && x.code === LILY) || (x.verb === 'attack' && x.code === LILY) || (x.verb === 'attack-direct' && x.code === LILY)) : undefined;
            const set = team === 1 && !s.view.me.monsters.some(Boolean) ? p.actions.find((x) => x.verb === 'set') : undefined;
            const bp = team === 0 && s.view.me.monsters.some((c) => c?.code === LILY) ? p.next.find((n) => n.to === 'BP') : undefined;
            const x = lily ?? set;
            a = { kind: 'choice', id: x ? x.id : (bp ?? p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else a = generic(p);
        expect(duel.answer(team, s.seq, a), JSON.stringify(p).slice(0, 300)).toBe(true);
    }
    expect(offered).not.toBeNull();
    expect(offered!.kind === 'chain' && offered!.quiet).toBeFalsy();
}));

// A page that lost its connection is shown what it missed: the frames after its cursor.
describe.skipIf(!engineDataAvailable())('reconnecting', () => it('replays the frames after the cursor', async () => {
    const engine = await loadEngine();
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: MON.concat(MON, MON, MON, MON, MON), extra: [] }, { main: MON.concat(MON, MON, MON, MON, MON), extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
    duel.start();
    duel.takeFrames(0);
    const cursor = duel.cursor(0);
    expect(duel.framesSince(0, cursor)).toEqual([]);
    // A few moves while the page is away.
    for (let i = 0; i < 6; i++) {
        const team = duel.waitingFor()!;
        const s = duel.state(team, 'd'); const p = s.prompt!;
        const a: DuelAnswer = p.kind === 'actions' ? { kind: 'choice', id: (p.actions.find((x) => x.verb === 'summon') ?? p.next.find((n) => n.to === 'EP') ?? p.next[0]!).id } : p.kind === 'chain' ? { kind: 'choice', id: p.pass ?? p.options[0]!.id } : generic(p);
        expect(duel.answer(team, s.seq, a)).toBe(true);
    }
    const missed = duel.framesSince(0, cursor)!;
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.at(-1)!.view).toEqual(duel.state(0, 'd').view);
    // Another session's cursor, or nonsense, isn't known: the page gets the board as it is.
    expect(duel.framesSince(0, 'elsewhere:0')).toBeNull();
    expect(duel.framesSince(0, `${cursor.split(':')[0]}:99999`)).toBeNull();
}));
