import { describe, expect, it } from 'vitest';
import { loneMust, type DuelAnswer, type DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DUEL_RULES, DuelSession } from '../src/duel/session';

const IMPERIAL_ORDER = 61740673, WABOKU = 12607053, MASK = 56948373, MESSENGER_OF_PEACE = 44656491, GEMINI_ELF = 69140098;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
    if (p.kind === 'actions') return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
    return { kind: 'choice', id: (p as any).options[0].id };
};

/**
 * Plays team 0 Setting everything it can and activating `activate` once each; team 1 only passes.
 * Returns every forced question team 0 was asked, with the Life Points it had after answering.
 */
async function forcedQuestions(main: number[], activate: number[]) {
    const engine = await loadEngine();
    const duel = new DuelSession(engine, { seed: ['3', '1', '4', '1'], mode: 'MR1', decks: [{ main, extra: [] }, { main: Array(40).fill(GEMINI_ELF), extra: [] }], names: ['A', 'B'], bots: [false, false], rules: DUEL_RULES });
    duel.start();
    const used = new Set<number>();
    const asked: { prompt: Extract<DuelPrompt, { kind: 'chain' }>; lpBefore: number; lpAfter: number; next: DuelPrompt | null }[] = [];
    for (let i = 0; i < 600 && !duel.result; i++) {
        const team = duel.waitingFor();
        if (team === null) break;
        const s = duel.state(team, 'd'); const p = s.prompt!;
        if (s.view.turn > 7) break;
        let a = generic(p);
        if (team === 0 && p.kind === 'actions') {
            const act = p.actions.find((x) => x.verb === 'activate' && x.where === 'spell' && activate.includes(x.code) && !used.has(x.code));
            const play = p.actions.find((x) => x.verb === 'summon') ?? act ?? p.actions.find((x) => x.verb === 'set-spell');
            if (play === act && act) used.add(act.code);
            if (play) a = { kind: 'choice', id: play.id };
        }
        const forced = team === 0 && p.kind === 'chain' && p.forced ? p : null;
        if (forced) a = { kind: 'choice', id: loneMust(forced) ?? forced.options.find((o) => o.must)!.id };
        expect(duel.answer(team, s.seq, a)).toBe(true);
        if (forced) asked.push({ prompt: forced, lpBefore: s.view.me.lp, lpAfter: duel.state(0, 'd').view.me.lp, next: duel.waitingFor() === 0 ? duel.state(0, 'd').prompt : null });
    }
    return asked;
}

// In a Standby Phase the engine lists an upkeep that must be paid together with every Set card
// that could be activated then, as one forced question. Only the upkeep must happen: it's marked,
// so the page lets it happen by itself instead of asking for an order between it and the Set cards.
describe.skipIf(!engineDataAvailable())('one mandatory effect among cards that could be activated', () => {
    it('marks the upkeep alone, and it can go first by itself', async () => {
        const main = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? IMPERIAL_ORDER : i % 3 === 1 ? WABOKU : GEMINI_ELF));
        const asked = await forcedQuestions(main, [IMPERIAL_ORDER]);
        expect(asked.length).toBeGreaterThan(0);
        for (const { prompt, lpBefore, lpAfter, next } of asked) {
            // The face-up Imperial Order's upkeep, among Set Wabokus (and maybe a Set Imperial Order).
            const musts = prompt.options.filter((o) => o.must);
            expect(musts.map((o) => o.code)).toEqual([IMPERIAL_ORDER]);
            expect(prompt.options.length).toBeGreaterThan(1);
            expect(loneMust(prompt)).toBe(musts[0]!.id);
            // Taking it pays the 700, and what's asked next (if anything) can be passed.
            expect(lpAfter).toBe(lpBefore - 700);
            if (next?.kind === 'chain') expect(next.forced).toBe(false);
        }
    });

    it('still asks for an order between two different effects that must happen', async () => {
        // Mask of the Accursed (on your own monster) and Messenger of Peace both act in your Standby Phase.
        const main = Array.from({ length: 40 }, (_, i) => [MESSENGER_OF_PEACE, MASK, WABOKU, GEMINI_ELF][i % 4]!);
        const asked = await forcedQuestions(main, [MESSENGER_OF_PEACE, MASK]);
        const both = asked.filter(({ prompt }) => new Set(prompt.options.filter((o) => o.must).map((o) => o.code)).size === 2);
        expect(both.length).toBeGreaterThan(0);
        for (const { prompt } of both) {
            expect(loneMust(prompt)).toBeNull();
            // The Set cards beside them stay optional.
            expect(prompt.options.some((o) => !o.must && o.code === WABOKU)).toBe(true);
        }
    });
});
