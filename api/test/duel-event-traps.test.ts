import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DUEL_RULES, DuelSession } from '@ygo/duel/session';

const MICHIZURE = 37580756, TRAP_HOLE = 4206964, GEMINI_ELF = 69140098, CELTIC_GUARDIAN = 91152256;
const generic = (p: DuelPrompt): DuelAnswer => {
    if (p.kind === 'cards') return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === 'place') return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === 'yesno') return { kind: 'choice', id: 1 };
    if (p.kind === 'chain') return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
    if (p.kind === 'actions') return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
    return { kind: 'choice', id: (p as any).options[0].id };
};

// Michizure answers a monster of yours going to the Graveyard: that moment is its only chance,
// so it's asked about on your own turn too (where a card usable at any time is left to be tapped).
describe.skipIf(!engineDataAvailable())('a trap that answers what just happened', () => {
    it('Michizure is offered on your own turn, when the rival\'s Trap Hole destroys your monster', async () => {
        const engine = await loadEngine();
        const mine = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? MICHIZURE : CELTIC_GUARDIAN));
        const theirs = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? TRAP_HOLE : GEMINI_ELF));
        const duel = new DuelSession(engine, { seed: ['3', '1', '4', '1'], mode: 'MR1', decks: [{ main: mine, extra: [] }, { main: theirs, extra: [] }], names: ['A', 'B'], bots: [false, false], rules: DUEL_RULES });
        duel.start();
        let offered: Extract<DuelPrompt, { kind: 'chain' }> | null = null, destroyed = false;
        for (let i = 0; i < 400 && !duel.result && !destroyed; i++) {
            const team = duel.waitingFor();
            if (team === null) break;
            const s = duel.state(team, 'd'); const p = s.prompt!;
            if (s.view.turn > 3) break;
            let a = generic(p);
            if (p.kind === 'actions' && p.phase === 'main') {
                // Each Sets one trap; the rival summons at once, you only on turn 3 (into the Trap Hole).
                const find = (v: string) => p.actions.find((x) => x.verb === v);
                const play = (s.view.me.monsters.every((m) => !m) && (team === 1 || s.view.turn >= 3) ? find('summon') : undefined) ?? (s.view.me.spells.every((c) => !c) ? find('set-spell') : undefined);
                if (play) a = { kind: 'choice', id: play.id };
            }
            if (p.kind === 'chain') {
                const use = p.options.find((o) => o.code === MICHIZURE || o.code === TRAP_HOLE);
                if (use?.code === MICHIZURE) {
                    offered = p;
                    expect(s.view.turnPlayer).toBe('me');
                }
                if (use) a = { kind: 'choice', id: use.id };
            }
            const elves = () => duel.state(0, 'd').view.opp.grave.filter((c) => c.code === GEMINI_ELF).length;
            const before = elves();
            expect(duel.answer(team, s.seq, a)).toBe(true);
            if (offered && elves() > before) destroyed = true;
        }
        expect(offered).not.toBeNull();
        // Not a window the page passes by itself, and the question says what happened.
        expect(offered!.quiet).toBeUndefined();
        expect(offered!.ask).toBe('Your Celtic Guardian was sent to the Graveyard. Activate a card?');
        // And it works: the rival's Gemini Elf goes with it.
        expect(destroyed).toBe(true);
    });

    it('reads from the script which cards answer an event', async () => {
        const engine = await loadEngine();
        expect(engine.answersEvents(MICHIZURE)).toBe(true);
        expect(engine.answersEvents(TRAP_HOLE)).toBe(true);
        expect(engine.answersEvents(12607053 /* Waboku */)).toBe(false);
        expect(engine.answersEvents(GEMINI_ELF)).toBe(false);
    });
});
