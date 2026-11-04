import { describe, expect, it } from 'vitest';
import { timelineSets } from './sets';

const set = (set_name: string, tcg_date: string) => ({ set_name, set_code: 'X', num_of_cards: 100, tcg_date });

describe('timelineSets order', () => {
    it('is the same whatever order the sets arrive in, even for sets released on one day', () => {
        const sets = [
            set('Gladiator\'s Assault', '2007-11-14'),
            set('Legend of Blue Eyes White Dragon', '2002-03-08'),
            set('Dark Revelation Volume 4', '2007-11-14'),
        ];
        const forward = timelineSets(sets).map((s) => s.set_name);
        const backward = timelineSets([...sets].reverse()).map((s) => s.set_name);
        expect(forward).toEqual(backward);
        expect(forward).toEqual(['Legend of Blue Eyes White Dragon', 'Dark Revelation Volume 4', 'Gladiator\'s Assault']);
    });
});
