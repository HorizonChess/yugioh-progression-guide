import { describe, expect, it } from 'vitest';
import { cardVersionAt, errataBetween } from './versions';

describe('card versions by date', () => {
    it("plays Sangan as printed until its 2016 errata", () => {
        expect(cardVersionAt('Sangan', '2002-06-26')?.kind).toBe('pre-errata');
        expect(cardVersionAt('Sangan', '2016-09-14')?.kind).toBe('pre-errata');
        expect(cardVersionAt('Sangan', '2016-09-15')).toBeNull();
    });
    it('uses GOAT versions up to the end of the GOAT format, then today\'s card', () => {
        expect(cardVersionAt('Scapegoat', '2005-08-17')?.kind).toBe('goat');
        expect(cardVersionAt('Scapegoat', '2006-02-18')).toBeNull();
    });
    it('keeps the original when the errata came after the timeline', () => {
        expect(cardVersionAt('Makyura the Destructor', '2017-07-29')?.kind).toBe('pre-errata');
    });
    it('leaves every other card alone', () => {
        expect(cardVersionAt('Blue-Eyes White Dragon', '2002-03-08')).toBeNull();
    });
    it('lists the errata a step through the timeline brings', () => {
        expect(errataBetween('2015-02-12', '2015-03-19').map((v) => v.name)).toEqual(expect.arrayContaining(['Crush Card Virus', 'Ring of Destruction', 'Sinister Serpent']));
        expect(errataBetween('2015-03-19', '2015-05-09')).toEqual([]);
    });
});
