import { describe, expect, it } from 'vitest';
import { sumPick } from '@ygo/duel/bot';

// Ritual materials and the like: cards whose levels add up to a number (Kaiba's Chaos Form for an 8).
describe('the bot picking cards that add up to a number', () => {
    const cost = (i: number) => i;

    it('adds up exactly, never overshooting', () => {
        // Levels 7, 10, 8, 4 for a Level 8: Blue-Eyes alone, not the first two it comes to.
        expect(sumPick([], [7, 10, 8, 4], 8, false, 1, 4, cost)).toEqual([2]);
    });

    it('takes the fewest cards, then the ones it can best do without', () => {
        expect(sumPick([], [4, 4, 8], 8, false, 1, 3, cost)).toEqual([2]);
        expect(sumPick([], [4, 4, 4, 4], 8, false, 1, 4, (i) => 10 - i)).toEqual([2, 3]);
    });

    it('counts a card at its second level when it has one', () => {
        // A card that can count as 2 or 6 (high half), with a 2: 6 + 2 = 8.
        expect(sumPick([], [2 | (6 << 16), 2], 8, false, 1, 2, cost)).toEqual([0, 1]);
    });

    it('reaching the number with none to spare', () => {
        // At least 8: 10 alone works; 7 + 4 too, but 10 is one card.
        expect(sumPick([], [7, 10, 4], 8, true, 1, 3, cost)).toEqual([1]);
        // 4 + 4 + 1 reaches 8 only with a spare 1, so 4 + 4 (or 7 + 4: a higher cost) it is.
        expect(sumPick([], [4, 4, 1, 7], 8, true, 2, 4, cost)).toEqual([0, 1]);
    });

    it('keeps the cards it must use', () => {
        expect(sumPick([3], [7, 5, 2], 8, false, 1, 3, cost)).toEqual([1]);
    });

    it('says so when nothing adds up', () => {
        expect(sumPick([], [7, 10], 8, false, 1, 2, cost)).toBeNull();
    });
});
