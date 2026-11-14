import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

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
    // The question says what moment it is, and which cards are battling.
    expect(offered!.kind === 'chain' && offered!.ask).toMatch(/^Damage calculation: your Injection Fairy Lily (battles B's .+|attacks B directly)\. Activate a card\?$/);
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

// Each attack asks once per usable card: Reinforcements right before damage calculation, Lily
// during it (the one moment she can be used), never the same card twice in one attack.
describe.skipIf(!engineDataAvailable())('asking in the damage step', () => it('asks once per card per attack', async () => {
    const engine = await loadEngine();
    const REIN = 17814387;
    const me = Array.from({ length: 40 }, (_, i) => (i % 2 ? LILY : i % 4 === 0 ? REIN : MON[i % MON.length]!));
    const foe = [91152256, 76184692, 90357090, 15025844, 4206964, 74677422];
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: foe.concat(foe, foe, foe, foe, foe, foe), extra: [] }], names: ['A', 'B'], bots: [false, false], rules: 2 });
    duel.start();
    const asks: string[] = [];
    for (let i = 0; i < 600 && !duel.result; i++) {
        const team = duel.waitingFor()!;
        const s = duel.state(team, 'd'); const p = s.prompt!;
        let a: DuelAnswer;
        if (p.kind === 'chain' && !p.quiet && team === 0) asks.push(s.view.turn + s.view.phase + ':' + p.options.map((o) => (o.code === LILY ? 'lily' : 'rein')).join(','));
        if (p.kind === 'actions') {
            const x = team === 0
                ? p.actions.find((x) => x.verb === 'set-spell') ?? p.actions.find((x) => (x.verb === 'summon' && x.code === LILY) || x.verb === 'attack' || x.verb === 'attack-direct')
                : !s.view.me.monsters.some(Boolean) ? p.actions.find((x) => x.verb === 'summon') : undefined;
            const bp = team === 0 && s.view.me.monsters.some(Boolean) ? p.next.find((n) => n.to === 'BP') : undefined;
            a = { kind: 'choice', id: x ? x.id : (bp ?? p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else a = generic(p);
        expect(duel.answer(team, s.seq, a)).toBe(true);
    }
    expect(asks.length).toBeGreaterThan(2);
    // Reinforcements (all copies on one question), then Lily, attack after attack: never the same
    // question twice in a row within a turn's battle. (Late on, Lily can't pay her 2000 LP.)
    for (let i = 1; i < asks.length; i++) expect(asks[i]).not.toBe(asks[i - 1]);
    expect(asks[0]).toMatch(/^\d+BP:rein(,rein)*$/);
    expect(asks[1]).toMatch(/^\d+BP:lily$/);
    expect(asks.filter((x) => x.includes('lily')).length).toBeGreaterThan(0);
}));

// Copies of one mandatory effect at once (Masks of the Accursed in the Standby Phase): the order
// changes nothing, so nobody is asked. Duels started under the older rules still are (replays).
describe.skipIf(!engineDataAvailable())('copies of a mandatory effect', () => it('happen without a question', async () => {
    const engine = await loadEngine();
    const MASK = 56948373;
    const me = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? MON[i % MON.length]! : MASK));
    const forcedAsks = async (rules: number) => {
        const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: MON.concat(MON, MON, MON, MON, MON), extra: [] }], names: ['A', 'B'], bots: [false, false], rules });
        duel.start();
        let asked = 0;
        for (let i = 0; i < 400 && !duel.result; i++) {
            const team = duel.waitingFor()!;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 7) break;
            if (p.kind === 'chain' && p.forced) asked++;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const x = team === 0 ? (p.actions.find((x) => x.verb === 'activate' && x.code === MASK) ?? p.actions.find((x) => x.verb === 'summon')) : undefined;
                a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
            } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
            else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        return { asked, lp: duel.state(0, 'd').view.me.lp };
    };
    const now = await forcedAsks(3), before = await forcedAsks(2);
    expect(before.asked).toBeGreaterThan(0);
    expect(now.asked).toBe(0);
    // The damage is dealt all the same.
    expect(now.lp).toBe(before.lp);
    expect(now.lp).toBeLessThan(8000);
}));
