import { describe, expect, it } from 'vitest';
import { isPacksPerSet, openPacksBlock, seriesRulesProblem } from './rules';
import { CreateSeriesBodySchema } from './schemas/series';

describe('packs per set', () => {
    it.each([12, 24, 30])('allows %i', (n) => expect(isPacksPerSet(n)).toBe(true));
    it.each([0, 1, 13, 25, 31, '24', null])('refuses %j', (n) => expect(isPacksPerSet(n)).toBe(false));
});

describe('seriesRulesProblem', () => {
    it('accepts a start set on the timeline', () => {
        expect(seriesRulesProblem({ startSetIndex: 0, packsPerSet: 24 }, 40)).toBeNull();
        expect(seriesRulesProblem({ startSetIndex: 39, packsPerSet: 12 }, 40)).toBeNull();
    });

    it('refuses a start set off the timeline', () => {
        expect(seriesRulesProblem({ startSetIndex: 40, packsPerSet: 24 }, 40)).toMatch(/starting set/);
        expect(seriesRulesProblem({ startSetIndex: -1, packsPerSet: 24 }, 40)).toMatch(/starting set/);
        expect(seriesRulesProblem({ startSetIndex: 1.5, packsPerSet: 24 }, 40)).toMatch(/starting set/);
    });

    it('refuses an unsupported pack count', () => {
        expect(seriesRulesProblem({ startSetIndex: 0, packsPerSet: 99 as never }, 40)).toMatch(/12, 24, 30/);
    });
});

describe('openPacksBlock', () => {
    const base = { setIndex: 5, currentSetIndex: 5, setCount: 40, alreadyOpened: false };

    it('allows the current set, once', () => {
        expect(openPacksBlock(base)).toBeNull();
        expect(openPacksBlock({ ...base, alreadyOpened: true })).toBe('already-opened');
    });

    it('refuses earlier and later sets', () => {
        expect(openPacksBlock({ ...base, setIndex: 4 })).toBe('not-current-set');
        expect(openPacksBlock({ ...base, setIndex: 6 })).toBe('not-current-set');
    });

    it('refuses an index off the timeline before anything else', () => {
        expect(openPacksBlock({ ...base, setIndex: 40, currentSetIndex: 40 })).toBe('unknown-set');
        expect(openPacksBlock({ ...base, setIndex: -1 })).toBe('unknown-set');
    });
});

describe('CreateSeriesBodySchema', () => {
    const good = { name: '  Solo run  ', mode: 'solo', startSetIndex: 0, packsPerSet: 24 };

    it('accepts a solo series and trims the name', () => {
        expect(CreateSeriesBodySchema.parse(good)).toEqual({ ...good, name: 'Solo run' });
    });

    it.each([
        ['an unknown pack count', { packsPerSet: 20 }],
        ['a duo series (Phase 4)', { mode: 'duo' }],
        ['a blank name', { name: '   ' }],
        ['a fractional start', { startSetIndex: 0.5 }],
        ['an extra key', { currentSetIndex: 9 }],
    ])('refuses %s', (_label, over) => {
        expect(CreateSeriesBodySchema.safeParse({ ...good, ...over }).success).toBe(false);
    });
});
