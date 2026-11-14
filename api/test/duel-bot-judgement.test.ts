import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';
const REINFORCEMENTS = 17814387, RAIGEKI = 12580477, DARK_HOLE = 53129443;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 74677422];
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};
describe.skipIf(!engineDataAvailable())('the practice bot', () => {
    it('knows a boost from a wipe', async () => {
        const engine = await loadEngine();
        expect(engine.effectKind(REINFORCEMENTS)).toBe('buff');
        expect(engine.effectKind(DARK_HOLE)).toBe('wipe');
        expect(engine.effectKind(RAIGEKI)).toBe('other');
        expect(engine.isContinuousTrap(50045299)).toBe(true); // Dragon Capture Jar
        expect(engine.isContinuousTrap(4206964)).toBe(false); // Trap Hole
    });

    // With no monster of its own, a boost could only go on the rival's: it keeps it.
    it("never boosts the rival's monster", async () => {
        const engine = await loadEngine();
        const me = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
        const bot = Array(40).fill(REINFORCEMENTS);
        for (const seed of ['1', '2', '3']) {
            const duel = new DuelSession(engine, { seed: [seed, '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: bot, extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
            duel.start();
            for (let i = 0; i < 300 && !duel.result; i++) {
                const team = duel.waitingFor();
                if (team === null) break;
                const s = duel.state(team, 'd'); const p = s.prompt!;
                if (s.view.turn > 6) break;
                let a: DuelAnswer;
                if (p.kind === 'actions') {
                    const x = p.actions.find((a) => a.verb === 'summon');
                    a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
                } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
                else a = generic(p);
                expect(duel.answer(team, s.seq, a)).toBe(true);
            }
            const used = duel.takeFrames(0).flatMap((f) => f.events).filter((e) => e.k === 'activate' && e.code === REINFORCEMENTS);
            expect(used).toEqual([]);
        }
    });

    // A face-down monster's stats are hidden from the bot as from a player: facing a set
    // Mystical Elf (DEF 2000) with 1900-ATK Gemini Elves, it attacks, as a player who can't see
    // the Elf would. (Reading the hidden DEF, it used to hold back forever.)
    it("doesn't see a face-down monster's DEF", async () => {
        const engine = await loadEngine();
        const MYSTICAL_ELF = 15025844, GEMINI_ELF = 69140098;
        const me = Array(40).fill(MYSTICAL_ELF);
        const bot = Array(40).fill(GEMINI_ELF);
        let attacks = 0;
        for (const seed of ['1', '2', '3']) {
            const duel = new DuelSession(engine, { seed: [seed, '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: me, extra: [] }, { main: bot, extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
            duel.start();
            for (let i = 0; i < 400 && !duel.result; i++) {
                const team = duel.waitingFor();
                if (team === null) break;
                const s = duel.state(team, 'd'); const p = s.prompt!;
                if (s.view.turn > 6) break;
                let a: DuelAnswer;
                if (p.kind === 'actions') {
                    // Set one Elf face-down, then end the turn without attacking.
                    const x = p.actions.find((a) => a.verb === 'set');
                    a = { kind: 'choice', id: x ? x.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
                } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
                else a = generic(p);
                expect(duel.answer(team, s.seq, a)).toBe(true);
            }
            attacks += duel.takeFrames(0).flatMap((f) => f.events).filter((e) => e.k === 'attack' && e.side !== 'me').length;
        }
        expect(attacks).toBeGreaterThan(0);
    });
});
