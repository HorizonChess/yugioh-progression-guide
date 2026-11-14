import { describe, expect, it } from 'vitest';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const MON = [91152256, 76184692, 90357090, 15025844];
const FLAME_SWORDSMAN = 45231177, THOUSAND_DRAGON = 41462083;

describe.skipIf(!engineDataAvailable())('the Extra Deck', () => {
    it('is listed for its owner and stays a count for the rival', async () => {
        const engine = await loadEngine();
        const main = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!);
        const duel = new DuelSession(engine, { seed: ['1', '2', '3', '4'], mode: 'MR1', decks: [{ main, extra: [FLAME_SWORDSMAN, THOUSAND_DRAGON] }, { main, extra: [] }], names: ['A', 'B'], bots: [false, true], rules: 2 });
        duel.start();
        const mine = duel.state(0, 'd').view.me;
        expect(mine.extra).toBe(2);
        expect(mine.extraCards?.map((c) => c.code).sort()).toEqual([FLAME_SWORDSMAN, THOUSAND_DRAGON].sort());
        const seenByRival = duel.state(1, 'd').view.opp;
        expect(seenByRival.extra).toBe(2);
        expect(seenByRival.extraCards).toBeUndefined();
    });
});
