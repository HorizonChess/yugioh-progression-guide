import { describe, expect, it } from 'vitest';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession, type Team } from '@ygo/duel/session';
import type { DuelAnswer, DuelPrompt, DuelView } from '@ygo/shared';

// A duel is rebuilt from its answers on Back (a move taken back), after a restart and when it comes
// back to memory. The rebuilt duel must call every card by the uid the board already knows it by:
// otherwise the board flies cards out of other cards' places and loses its own (the "card respawns
// somewhere and flies back" seen on the board). The live duel is looked at by both players after
// every step, as the server does; the rebuilt one only at the end. Extra Decks, Fusion Summons from
// them, cards coming back from the Graveyard and board wipes keep every pile busy.

const POLY = 24094653, REBORN = 83764718, DARK_HOLE = 53129443;
const FLAME_MANIPULATOR = 34460851, MASAKI = 44287299, FLAME_SWORDSMAN = 45231177;
const MON = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 28279543, 9159938, 43500484, 40826495, 15025844];
const main = [POLY, POLY, POLY, REBORN, DARK_HOLE, ...Array<number>(3).fill(FLAME_MANIPULATOR), ...Array<number>(3).fill(MASAKI), ...Array.from({ length: 29 }, (_, i) => MON[i % MON.length]!)];
const deck = { main, extra: [FLAME_SWORDSMAN, FLAME_SWORDSMAN, 66889139, 1641882] };

const pile = (v: DuelView) =>
    [v.me, v.opp].flatMap((s, i) => [
        ...s.hand.map((c) => `${i}h:${c.uid}=${c.code}`),
        ...s.monsters.map((c, j) => c && `${i}m${j}:${c.uid}=${c.code}`),
        ...s.spells.map((c, j) => c && `${i}s${j}:${c.uid}=${c.code}`),
        ...s.grave.map((c) => `${i}g:${c.uid}=${c.code}`),
        ...s.banished.map((c) => `${i}b:${c.uid}=${c.code}`),
        ...(s.extraCards ?? []).map((c) => `${i}x:${c.uid}=${c.code}`),
    ]).filter(Boolean).join(' ');

function answerFor(p: DuelPrompt, rand: () => number): DuelAnswer {
    const any = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
    if (p.kind === 'actions') {
        const plays = p.actions.filter((a) => a.verb !== 'reposition');
        if (plays.length && rand() < 0.75) return { kind: 'choice', id: any(plays).id };
        return { kind: 'choice', id: (p.next.find((n) => n.to === 'BP' && rand() < 0.5) ?? p.next.find((n) => n.to === 'EP') ?? p.next[0]!).id };
    }
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? any(p.options).id };
    if (p.kind === 'cards') {
        if (p.step) return p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: any(p.cards).id };
        return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    }
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: rand() < 0.5 ? 1 : 0 };
    return { kind: 'choice', id: any((p as { options: { id: number }[] }).options).id };
}

describe.skipIf(!engineDataAvailable())('card uids in a rebuilt duel', () => {
    for (const seed of [3, 11, 29, 47]) {
        it(`are the ones the live duel used (seed ${seed})`, async () => {
            const engine = await loadEngine();
            let r = seed;
            const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
            const setup = { seed: [String(seed), '11400714819323198485', '77', '2685821657736338717'] as [string, string, string, string], mode: 'MR1' as const, decks: [deck, deck], names: ['A', 'B'], bots: [false, false], rules: 4 as const };
            const live = new DuelSession(engine, setup);
            live.start();
            let checked = 0;
            for (let i = 0; i < 600 && !live.result; i++) {
                const team = live.waitingFor();
                if (team === null) break;
                // Both players look, as the server shows each of them the board after every step.
                live.view(0 as Team);
                live.view(1 as Team);
                const s = live.state(team, 'd');
                if (!s.prompt) break;
                if (!live.answer(team, s.seq, answerFor(s.prompt, rand))) {
                    // (A choice the engine refused: the first plain one instead.)
                    const p = s.prompt;
                    const fallback: DuelAnswer = p.kind === 'actions' ? { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[0]!).id } : answerFor(p, () => 0);
                    if (!live.answer(team, s.seq, fallback)) break;
                }
                if (i % 60 === 59) {
                    const rebuilt = new DuelSession(engine, setup);
                    rebuilt.start([...live.answers]);
                    for (const t of [0, 1] as const) expect(pile(rebuilt.view(t)), `step ${i}, player ${t}`).toBe(pile(live.view(t)));
                    rebuilt.destroy();
                    checked++;
                }
            }
            expect(checked).toBeGreaterThan(2);
            live.destroy();
        }, 120_000);
    }
});
