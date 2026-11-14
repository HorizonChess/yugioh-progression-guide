import { describe, expect, it } from 'vitest';
import { DUELISTS, duelistDeck, type DuelAnswer, type DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';

// Every duelist's deck, in every era, is one the engine plays: a few turns of the bot with it
// against a player summoning from a copy of it, without the engine refusing a move or failing.

function playerAnswer(p: DuelPrompt): DuelAnswer {
    switch (p.kind) {
        case 'actions': {
            const summon = p.actions.find((a) => a.verb === 'summon');
            if (summon) return { kind: 'choice', id: summon.id };
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

describe.skipIf(!engineDataAvailable())('the duelists from the anime', () => {
    for (const duelist of DUELISTS) {
        for (const era of duelist.eras) {
            it(`${duelist.name} (${era.label}) plays their deck`, async () => {
                const engine = await loadEngine();
                const { deck } = duelistDeck(duelist, era.id);
                const duel = new DuelSession(engine, {
                    seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3',
                    decks: [deck, deck], names: ['Player', duelist.name], bots: [false, true], rules: 4, botLevel: 'plain',
                });
                duel.start();
                for (let i = 0; i < 300 && !duel.result; i++) {
                    const s = duel.state(0, 'd');
                    if (s.view.turn > 6) break;
                    expect(duel.answer(0, s.seq, playerAnswer(s.prompt!))).toBe(true);
                }
                expect(duel.state(0, 'd').view.turn).toBeGreaterThan(2);
                duel.destroy();
            }, 60_000);
        }
    }
});
