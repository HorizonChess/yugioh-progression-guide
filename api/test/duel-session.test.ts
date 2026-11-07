import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession, type DuelSetup } from '../src/duel/session';

// Two Legend of Blue Eyes decks (40 cards each).
const LOB = [
    [89631139, 3], [46986414, 2], [74677422, 3], [6368038, 3], [91152256, 3], [76184692, 3], [90357090, 3], [15025844, 3], [54652250, 2],
    [66788016, 2], [83764718, 1], [53129443, 1], [12580477, 1], [59197169, 2], [4206964, 3], [17814387, 3], [50045299, 2],
].flatMap(([code, n]) => Array<number>(n!).fill(code!));

const setup = (bots: [boolean, boolean], seed = 1): DuelSetup => ({
    seed: [String(seed), '11400714819323198485', '77', '2685821657736338717'],
    mode: 'MR1',
    decks: [{ main: LOB, extra: [] }, { main: LOB, extra: [] }],
    names: ['Yugi', 'Kaiba'],
    bots,
});

/** A plain human: summons and attacks when offered, takes the first legal choice otherwise. */
function humanAnswer(p: DuelPrompt): DuelAnswer {
    switch (p.kind) {
        case 'actions': {
            const act = p.actions.find((a) => a.verb === 'summon' || a.verb === 'attack' || a.verb === 'attack-direct' || a.verb === 'set-spell');
            if (act) return { kind: 'choice', id: act.id };
            const next = p.next.find((n) => n.to === 'BP') ?? p.next.find((n) => n.to === 'EP') ?? p.next[0];
            return { kind: 'choice', id: next!.id };
        }
        case 'chain':
            return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        case 'cards':
            if (p.step) return p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id };
            return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
        case 'yesno':
            return { kind: 'choice', id: 1 };
        case 'option':
        case 'position':
        case 'number':
            return { kind: 'choice', id: p.options[0]!.id };
        case 'declare':
            return { kind: 'many', ids: p.options.slice(0, p.count).map((o) => o.id) };
        case 'card-name':
            return { kind: 'name', name: 'Dark Magician' };
        case 'place':
            return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    }
}

describe.skipIf(!engineDataAvailable())('duel session', () => {
    it('plays a whole duel between two bots', async () => {
        const duel = new DuelSession(await loadEngine(), setup([true, true]));
        duel.start();
        expect(duel.result).not.toBeNull();
        expect(duel.answers.length).toBeGreaterThan(20);
    });

    it('asks the human, hides what they may not see, and replays exactly', async () => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, setup([false, true], 7));
        duel.start();
        let asked = 0, quiet = 0;
        const kinds = new Set<string>();
        while (!duel.result && asked < 2000) {
            const state = duel.state(0, 'd');
            expect(state.prompt).not.toBeNull();
            // The rival's hand and Set cards are hidden; your own are not.
            expect(state.view.opp.hand.every((c) => c.code === 0 && !c.faceUp)).toBe(true);
            for (const c of [...state.view.opp.monsters, ...state.view.opp.spells]) if (c && !c.faceUp) expect(c.code).toBe(0);
            expect(state.view.me.hand.every((c) => c.code > 0)).toBe(true);
            kinds.add(state.prompt!.kind);
            // A quiet chain window is never forced...
            if (state.prompt!.kind === 'chain' && state.prompt!.quiet) {
                quiet++;
                expect(state.prompt!.forced).toBe(false);
                // ...and has no rival link to answer.
                expect(state.view.chain.at(-1)?.side ?? "me").toBe("me");
            }
            if (state.prompt!.kind === 'chain') {
                // Your own turn, nothing to answer: you're never asked (cards are offered as actions),
                // except in a battle's damage step, the only time a card like Reinforcements can be used there.
                if (!state.prompt!.forced && state.view.chain.length === 0 && state.view.turnPlayer === 'me' && state.view.phase !== 'BP') expect(state.prompt!.quiet).toBe(true);
                // One mandatory effect is no choice: it just happens.
                if (state.prompt!.forced) expect(state.prompt!.options.length).toBeGreaterThan(1);
            }
            // A stale or out-of-range answer is refused without touching the duel.
            expect(duel.answer(0, state.seq + 1, { kind: 'choice', id: 0 })).toBe(false);
            expect(duel.answer(1, state.seq, { kind: 'choice', id: 0 })).toBe(false);
            expect(duel.answer(0, state.seq, humanAnswer(state.prompt!))).toBe(true);
            asked++;
        }
        expect(duel.result).not.toBeNull();
        expect(kinds).toContain('actions');
        // Summoning or setting asks where, as on EDOPro.
        expect(kinds).toContain('place');
        // Set Reinforcements and Trap Holes offer themselves at many moments that don't call for them.
        expect(quiet).toBeGreaterThan(0);
        expect(duel.takeFrames(0).length).toBeGreaterThan(10);

        // The seed and the answers rebuild the same duel.
        const again = new DuelSession(engine, setup([false, true], 7));
        again.start(duel.answers);
        expect(again.result).toEqual(duel.result);
        expect(again.answers).toEqual(duel.answers);
    });

    it('resumes mid-duel from stored answers', async () => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, setup([false, true], 3));
        duel.start();
        for (let i = 0; i < 15 && !duel.result; i++) {
            const s = duel.state(0, 'd');
            duel.answer(0, s.seq, humanAnswer(s.prompt!));
        }
        const resumed = new DuelSession(engine, setup([false, true], 3));
        resumed.start(JSON.parse(JSON.stringify(duel.answers, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)), (_k, v) => (typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v)));
        const a = duel.state(0, 'd'), b = resumed.state(0, 'd');
        expect(b.seq).toBe(a.seq);
        expect(b.prompt).toEqual(a.prompt);
        expect(JSON.stringify(b.view)).toBe(JSON.stringify(a.view));
    });

    // Ekibyo Drakmord: equip it to a rival monster; two turns later it destroys that monster and
    // returns to the hand, both mandatory: no choice, so (rules 2) never asked.
    const EKIBYO = 69954399;
    const ekibyo = (rules: number | undefined, seed: number): DuelSetup => ({
        ...setup([false, true], seed),
        decks: [{ main: [...Array<number>(20).fill(EKIBYO), ...LOB.slice(0, 20)], extra: [] }, { main: LOB, extra: [] }],
        ...(rules ? { rules } : {}),
    });
    const playEkibyo = (duel: DuelSession) => {
        let forcedSingles = 0, equipped = 0, marked = 0;
        for (let asked = 0; asked < 600 && !duel.result; asked++) {
            const { prompt, seq, view } = duel.state(0, 'd');
            // The monster Ekibyo is equipped to shows it, from both sides of the table.
            if (view.opp.monsters.some((m) => m?.by?.some((b) => b.code === EKIBYO))) {
                marked++;
                expect(duel.state(1, 'd').view.me.monsters.some((m) => m?.by?.some((b) => b.code === EKIBYO))).toBe(true);
            }
            if (prompt!.kind === 'chain' && prompt!.forced && prompt!.options.length === 1) forcedSingles++;
            let a = humanAnswer(prompt!);
            if (prompt!.kind === 'actions') {
                const eq = prompt!.actions.find((x) => x.verb === 'activate' && x.code === EKIBYO);
                if (eq) (a = { kind: 'choice', id: eq.id }), equipped++;
            }
            duel.answer(0, seq, a);
        }
        return { forcedSingles, equipped, marked };
    };

    it('a lone mandatory effect just happens, and older duels still replay', async () => {
        const engine = await loadEngine();
        let oldForced = 0;
        for (const seed of [1, 2, 3]) {
            // Started before rules 2: the mandatory effect was asked, and that answer is in its history.
            const old = new DuelSession(engine, ekibyo(undefined, seed));
            old.start();
            const { forcedSingles, equipped, marked } = playEkibyo(old);
            oldForced += forcedSingles;
            expect(equipped).toBeGreaterThan(0);
            expect(marked).toBeGreaterThan(0);
            const again = new DuelSession(engine, ekibyo(undefined, seed));
            again.start(old.answers);
            expect(again.state(0, 'd').view).toEqual(old.state(0, 'd').view);

            const now = new DuelSession(engine, ekibyo(2, seed));
            now.start();
            expect(playEkibyo(now).forcedSingles).toBe(0);
        }
        expect(oldForced).toBeGreaterThan(0);
    });

    it('shows the opening hands being drawn to every look until the first move', async () => {
        const duel = new DuelSession(await loadEngine(), setup([false, true], 3));
        duel.start();
        const first = duel.framesOnConnect(0);
        expect(first[0]!.events.every((e) => e.k === 'draw')).toBe(true);
        // The page connected again while loading: the opening plays again, from the top.
        expect(duel.framesOnConnect(0)).toEqual(first);
        // Quiet windows the page passes by itself don't count as a move.
        let { prompt, seq } = duel.state(0, 'd');
        while (prompt!.kind === 'chain' && prompt!.quiet) {
            expect(duel.answer(0, seq, { kind: 'choice', id: prompt!.pass! })).toBe(true);
            ({ prompt, seq } = duel.state(0, 'd'));
            expect(duel.framesOnConnect(0)[0]).toEqual(first[0]);
        }
        expect(duel.answer(0, seq, humanAnswer(prompt!))).toBe(true);
        // After a move, a fresh look gets the board as it is.
        expect(duel.framesOnConnect(0)).toEqual([]);
    });

    it('the bot never attacks a monster that beats it', async () => {
        const engine = await loadEngine();
        let attacks = 0;
        for (const seed of Array.from({ length: 24 }, (_, i) => 11 + i)) {
            const duel = new DuelSession(engine, setup([false, true], seed));
            duel.start();
            for (let asked = 0; asked < 1500 && !duel.result; asked++) {
                const { prompt, seq } = duel.state(0, 'd');
                expect(duel.answer(0, seq, humanAnswer(prompt!))).toBe(true);
                // From the bot's side of the table: each of its attacks on a face-up monster is one it wins or ties.
                for (const f of duel.takeFrames(1)) {
                    for (const e of f.events) {
                        if (e.k !== 'attack' || e.side !== 'me' || !e.target) continue;
                        const attacker = f.view.me.monsters.find((c) => c?.uid === e.attacker);
                        const target = f.view.opp.monsters.find((c) => c?.uid === e.target);
                        if (!attacker || !target || !target.faceUp || attacker.atk === undefined) continue;
                        attacks++;
                        expect(attacker.atk).toBeGreaterThanOrEqual(target.defense ? target.def! : target.atk!);
                    }
                }
            }
        }
        expect(attacks).toBeGreaterThan(0);
    });
});
