import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const MIND_CRUSH = 15800838, DNA_SURGERY = 74701381, GEMINI_ELF = 69140098;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id }) : { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// You Set Mind Crush and spring it on the bot's turn, declaring Gemini Elf. Both players are told
// what you declared, and by whom.
describe.skipIf(!engineDataAvailable())('a declared card', () => {
    it('is told to both players', async () => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, { seed: ['5', '6', '7', '8'], mode: 'MR1', decks: [{ main: Array(40).fill(MIND_CRUSH), extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
        duel.start();
        for (let i = 0; i < 400 && !duel.result; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 4) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const set = p.actions.find((x) => x.verb === 'set-spell');
                a = { kind: 'choice', id: set ? set.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'chain') {
                const crush = p.options.find((o) => o.code === MIND_CRUSH);
                a = { kind: 'choice', id: crush ? crush.id : (p.pass ?? p.options[0]!.id) };
            } else if (p.kind === 'card-name') a = { kind: 'name', name: 'Gemini Elf' };
            else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        const mine = duel.takeFrames(0).flatMap((f) => f.events).filter((e) => e.k === 'declare');
        const theirs = duel.takeFrames(1).flatMap((f) => f.events).filter((e) => e.k === 'declare');
        expect(theirs[0]).toMatchObject({ side: 'opp', what: 'card', text: 'Gemini Elf', code: GEMINI_ELF });
        expect(mine[0]).toMatchObject({ side: 'me', what: 'card', text: 'Gemini Elf' });
    });
});

// DNA Surgery declares a Type and keeps it: the card wears it as a note while it stays face up,
// and both players can read it.
describe.skipIf(!engineDataAvailable())('a Type declared by DNA Surgery', () => {
    it('is written on the card', async () => {
        const engine = await loadEngine();
        const duel = new DuelSession(engine, { seed: ['5', '6', '7', '8'], mode: 'MR1', decks: [{ main: Array(40).fill(DNA_SURGERY), extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
        duel.start();
        let declared = false;
        for (let i = 0; i < 400 && !duel.result && !declared; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 4) break;
            let a: DuelAnswer;
            if (p.kind === 'actions') {
                const set = p.actions.find((x) => x.verb === 'set-spell');
                a = { kind: 'choice', id: set ? set.id : (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
            } else if (p.kind === 'chain') {
                const dna = p.options.find((o) => o.code === DNA_SURGERY);
                a = { kind: 'choice', id: dna ? dna.id : (p.pass ?? p.options[0]!.id) };
            } else if (p.kind === 'declare') {
                a = { kind: 'many', ids: [p.options.find((o) => o.label === 'Dragon')!.id] };
                declared = true;
            } else a = generic(p);
            expect(duel.answer(team, s.seq, a)).toBe(true);
        }
        expect(declared).toBe(true);
        for (const team of [0, 1] as const) {
            const v = duel.state(team, 'd').view;
            const side = team === 0 ? v.me : v.opp;
            expect(side.spells.some((c) => c?.code === DNA_SURGERY && c.notes?.includes('Dragon'))).toBe(true);
        }
    });
});
