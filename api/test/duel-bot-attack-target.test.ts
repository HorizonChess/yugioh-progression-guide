import { describe, expect, it } from 'vitest';
import { OcgMessageType as M } from 'ocgcore-wasm';
import { heuristicAnswer } from '@ygo/duel/bot';
import { DuelSession, type DuelSetup } from '@ygo/duel/session';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';

const MON = [91152256, 85639257, 53153481, 17535588];
const deck = { main: Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!), extra: [] };
const setup: DuelSetup = { seed: ['5', '1', '2', '3'], mode: 'MR1', decks: [deck, deck], names: ['A', 'B'], bots: [true, false], rules: 4 };

// The bot remembers the monster it attacked with, to pick that attack's target. A direct attack asks
// for no target: an effect's "choose exactly 2 of your rival's monsters" later must still get 2.
describe.skipIf(!engineDataAvailable())('the bot after it attacked', () => it('answers a question for 2 of the rival\'s monsters with 2', async () => {
    const duel = new DuelSession(await loadEngine(), setup);
    duel.start();
    const selects = [0, 1, 2, 3].map((sequence) => ({ code: MON[sequence]!, controller: 1, location: 4, sequence, position: 1 }));
    const pick = (min: number, max: number) => {
        duel.botAttacker = 1800;
        return heuristicAnswer({ type: M.SELECT_CARD, player: 0, can_cancel: false, min, max, selects } as never, duel, 0) as { indicies: number[] };
    };
    expect(pick(2, 2).indicies).toHaveLength(2);
    expect(new Set(pick(2, 2).indicies).size).toBe(2);
    // An attack's own target question is still one card.
    expect(pick(1, 1).indicies).toHaveLength(1);
    duel.destroy();
}));
