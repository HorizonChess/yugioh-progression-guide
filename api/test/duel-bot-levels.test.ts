import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelEvent, DuelPrompt } from '@ygo/shared';
import { BOT_LEVELS, type BotLevel } from '../src/duel/bot';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';

// At every level the bot never makes a play that only hurts itself, and Sets what's meant to be Set.
const MST = 5318639, WABOKU = 12607053, DARK_HOLE = 53129443, VORSE_RAIDER = 14898066, MYSTICAL_ELF = 15025844, MAN_EATER_BUG = 54652250;
const CELTIC_GUARDIAN = 91152256, BATTLE_OX = 5053103;

/** The human's side: `idle` never summons or Sets anything, `monsters` summons monsters and nothing else. */
type Human = 'idle' | 'monsters';
function humanAnswer(p: DuelPrompt, how: Human): DuelAnswer {
    switch (p.kind) {
        case 'actions': {
            const act = how === 'monsters' ? p.actions.find((a) => a.verb === 'summon') : undefined;
            if (act) return { kind: 'choice', id: act.id };
            return { kind: 'choice', id: (p.next.find((n) => n.to === 'EP') ?? p.next[p.next.length - 1])!.id };
        }
        case 'chain':
            return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        case 'cards':
            if (p.step) return p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id };
            return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
        case 'place':
            return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
        case 'yesno':
            return { kind: 'choice', id: 1 };
        default:
            return { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };
    }
}

/** A few turns against the bot; what the bot did, from its side of the table. */
async function play(level: BotLevel, bot: number[], human: number[], how: Human, seed: string, turns = 7): Promise<DuelEvent[]> {
    const engine = await loadEngine();
    const duel = new DuelSession(engine, {
        seed: [seed, '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1',
        decks: [{ main: human, extra: [] }, { main: bot, extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 4, botLevel: level,
    });
    duel.start();
    for (let i = 0; i < 400 && !duel.result; i++) {
        const s = duel.state(0, 'd');
        if (s.view.turn > turns) break;
        expect(duel.answer(0, s.seq, humanAnswer(s.prompt!, how))).toBe(true);
    }
    return duel.takeFrames(1).flatMap((f) => f.events);
}
const fill = (...parts: [number, number][]) => parts.flatMap(([code, n]) => Array<number>(n).fill(code));

describe.skipIf(!engineDataAvailable())('the bot, at every level', () => {
    for (const level of BOT_LEVELS) {
        // Its own Set cards are the only Spells and Traps on the field: Mystical Space Typhoon stays in hand.
        it(`${level}: never destroys its own Set card with Mystical Space Typhoon`, async () => {
            for (const seed of ['1', '2']) {
                const events = await play(level, fill([MST, 20], [WABOKU, 20]), fill([CELTIC_GUARDIAN, 20], [BATTLE_OX, 20]), 'monsters', seed);
                expect(events.filter((e) => e.k === 'activate' && e.side === 'me' && e.code === MST)).toEqual([]);
            }
        }, 120_000);

        // The rival never has a monster: Dark Hole would only destroy its own.
        it(`${level}: never wipes its own monsters with Dark Hole`, async () => {
            for (const seed of ['1', '2']) {
                const events = await play(level, fill([DARK_HOLE, 15], [VORSE_RAIDER, 25]), fill([CELTIC_GUARDIAN, 40]), 'idle', seed);
                expect(events.some((e) => e.k === 'summon' && e.side === 'me')).toBe(true);
                expect(events.filter((e) => e.k === 'activate' && e.side === 'me' && e.code === DARK_HOLE)).toEqual([]);
            }
        }, 120_000);

        // A wall (Mystical Elf) and a Flip monster (Man-Eater Bug) are Set, never Normal Summoned, and
        // with no rival monster for it to destroy, Man-Eater Bug is never flipped by choice.
        it(`${level}: Sets walls and Flip monsters`, async () => {
            for (const seed of ['1', '2']) {
                const events = await play(level, fill([MYSTICAL_ELF, 20], [MAN_EATER_BUG, 20]), fill([CELTIC_GUARDIAN, 40]), 'idle', seed);
                expect(events.some((e) => e.k === 'set' && e.side === 'me')).toBe(true);
                expect(events.filter((e) => e.k === 'summon' && e.side === 'me')).toEqual([]);
            }
        }, 120_000);
    }
});
