import { describe, expect, it } from 'vitest';
import { lockedOf } from '@ygo/duel/session';

// The engine's FIELD_DISABLED mask: player 0's Monster Zones in bits 0-4, Spell & Trap Zones in
// 8-12; player 1's 16 bits higher.
describe('locked zones', () => {
    it('reads each player\'s own bits', () => {
        const mask = (1 << 2) | (1 << 9) | (1 << (16 + 4));
        expect(lockedOf(mask, 0).locked).toEqual({ monsters: [false, false, true, false, false], spells: [false, true, false, false, false] });
        expect(lockedOf(mask, 1).locked).toEqual({ monsters: [false, false, false, false, true], spells: [false, false, false, false, false] });
    });
    it('says nothing when no zone is locked', () => {
        // The Field, Pendulum and Extra Monster bits aren't drawn as locked zones.
        expect(lockedOf((1 << 5) | (1 << 13), 0)).toEqual({});
        expect(lockedOf(0, 1)).toEqual({});
    });
});
