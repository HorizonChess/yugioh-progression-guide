import { describe, expect, it, vi } from 'vitest';
import { BOX_SIZE, generateBoosterPack, generateBoosterPacks } from './pack-logic';
import { seededRng } from './rng';
import type { Card, CardSet } from './types';

const LOB: CardSet = {
    set_name: 'Legend of Blue Eyes White Dragon',
    set_code: 'LOB',
    num_of_cards: 126,
    tcg_date: '2002-03-08',
};

function card(id: number, rarity: string): Card {
    return {
        id,
        name: `Card ${id}`,
        type: 'Normal Monster',
        frameType: 'normal',
        desc: '',
        race: 'Dragon',
        card_sets: [{
            set_name: LOB.set_name,
            set_code: `LOB-EN${String(id).padStart(3, '0')}`,
            set_rarity: rarity,
            set_rarity_code: '',
            set_price: '0',
        }],
        card_images: [],
    };
}

// A small LOB-shaped pool: plenty of commons, a few of each foil.
const POOL: Card[] = [
    ...Array.from({ length: 40 }, (_, i) => card(i + 1, 'Common')),
    ...Array.from({ length: 10 }, (_, i) => card(i + 101, 'Rare')),
    ...Array.from({ length: 5 }, (_, i) => card(i + 201, 'Super Rare')),
    ...Array.from({ length: 5 }, (_, i) => card(i + 301, 'Ultra Rare')),
    ...Array.from({ length: 3 }, (_, i) => card(i + 401, 'Secret Rare')),
];

const ids = (pack: { id: number; pulled_rarity: string }[]) => pack.map(c => `${c.id}:${c.pulled_rarity}`);

describe('generateBoosterPack', () => {
    it('pulls the same pack for the same seed', () => {
        const a = generateBoosterPack(POOL, LOB, seededRng(42));
        const b = generateBoosterPack(POOL, LOB, seededRng(42));
        expect(ids(a)).toEqual(ids(b));
    });

    it('pulls different packs for different seeds', () => {
        const packs = new Set(
            [1, 2, 3, 4, 5].map(seed => ids(generateBoosterPack(POOL, LOB, seededRng(seed))).join(',')),
        );
        expect(packs.size).toBeGreaterThan(1);
    });

    it('builds a pre-SOD core pack: 9 cards, 7 commons, a guaranteed rare, then the ninth slot', () => {
        const pack = generateBoosterPack(POOL, LOB, seededRng(7));
        expect(pack).toHaveLength(9);
        expect(pack.slice(0, 7).every(c => c.pulled_rarity === 'Common')).toBe(true);
        expect(pack[7]?.pulled_rarity).toBe('Rare');
        expect(pack.every(c => c.pulled_set_code === 'LOB')).toBe(true);
    });

    it('never puts the same card in a pack twice', () => {
        // 9 cards from 8 commons: before, about 1 pack in 4 of a small set repeated a common.
        const small = [...POOL.slice(0, 8), ...POOL.slice(40)];
        for (let seed = 0; seed < 500; seed++) {
            const pack = generateBoosterPack(small, LOB, seededRng(seed));
            expect(new Set(pack.map(c => c.id)).size).toBe(pack.length);
        }
    });

    it('repeats a card only when a slot has run out of others', () => {
        const pack = generateBoosterPack([...POOL.slice(0, 3), ...POOL.slice(40)], LOB, seededRng(1));
        expect(pack).toHaveLength(9);
        expect(new Set(pack.slice(0, 3).map(c => c.id)).size).toBe(3);
    });

    it("reads a card's rarity from its printing in this exact set, not another product with the same code prefix", () => {
        // A LOB Short Print that the 25th Anniversary reprint (codes LOB-EN…, another set name) lists as a Common.
        const sp = card(500, 'Short Print');
        sp.card_sets!.push({ set_name: `${LOB.set_name} (25th Anniversary Edition)`, set_code: 'LOB-EN500', set_rarity: 'Ultra Rare', set_rarity_code: '', set_price: '0' });
        const pool = [sp, ...POOL.slice(0, 40), ...POOL.slice(40, 50)];
        for (let seed = 0; seed < 300; seed++) {
            const hit = generateBoosterPack(pool, LOB, seededRng(seed)).find(c => c.id === 500);
            if (hit) expect(hit.pulled_rarity).toBe('Short Print');
        }
    });

    it('rolls foils at roughly the documented 1:6 / 1:12 / 1:31 LOB ratios', () => {
        const rng = seededRng(2002);
        const counts: Record<string, number> = {};
        const N = 20_000;
        for (let i = 0; i < N; i++) {
            const ninth = generateBoosterPack(POOL, LOB, rng)[8]?.pulled_rarity ?? 'none';
            counts[ninth] = (counts[ninth] ?? 0) + 1;
        }
        // Hat of 372: 62 super, 31 ultra, 12 secret, the rest common.
        expect((counts['Super Rare'] ?? 0) / N).toBeCloseTo(62 / 372, 1);
        expect((counts['Ultra Rare'] ?? 0) / N).toBeCloseTo(31 / 372, 1);
        expect((counts['Secret Rare'] ?? 0) / N).toBeCloseTo(12 / 372, 1);
    });

    it('only draws from the given rng, and returns to Math.random afterwards', () => {
        const spy = vi.spyOn(Math, 'random');
        generateBoosterPack(POOL, LOB, seededRng(1));
        expect(spy).not.toHaveBeenCalled();

        generateBoosterPack(POOL, LOB);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('generateBoosterPacks (a box)', () => {
    const count = (packs: { pulled_rarity: string }[][], rarity: string) => packs.flat().filter(c => c.pulled_rarity === rarity).length;

    it('holds the foils its ratios give a box: 4 Supers, 2 Ultras and 0 or 1 Secret in 24 LOB packs', () => {
        for (let seed = 0; seed < 200; seed++) {
            const box = generateBoosterPacks(POOL, LOB, BOX_SIZE, seededRng(seed));
            expect(box).toHaveLength(24);
            expect(count(box, 'Super Rare')).toBe(4);
            expect(count(box, 'Ultra Rare')).toBe(2);
            expect(count(box, 'Secret Rare')).toBeLessThanOrEqual(1);
        }
    });

    it('keeps the per-pack odds of loose packs: a Secret in about 24/31 of boxes', () => {
        let secrets = 0;
        const N = 3000;
        for (let seed = 0; seed < N; seed++) secrets += count(generateBoosterPacks(POOL, LOB, BOX_SIZE, seededRng(seed)), 'Secret Rare');
        expect(secrets / N).toBeCloseTo(24 / 31, 1);
    });

    it('spreads the cards evenly: every common comes round before any comes again', () => {
        const box = generateBoosterPacks(POOL, LOB, BOX_SIZE, seededRng(11));
        const seen = new Map<number, number>();
        for (const c of box.flat()) if (c.pulled_rarity === 'Common') seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
        // ~186 commons over 40 cards: each 4 or 5 times (6 at most where a pack skipped one it already held).
        expect(seen.size).toBe(40);
        expect(Math.max(...seen.values()) - Math.min(...seen.values())).toBeLessThanOrEqual(2);
        // 24 rares over 10: each 2 or 3 times.
        const rares = new Map<number, number>();
        for (const c of box.flat()) if (c.pulled_rarity === 'Rare') rares.set(c.id, (rares.get(c.id) ?? 0) + 1);
        expect(Math.min(...rares.values())).toBeGreaterThanOrEqual(2);
        expect(Math.max(...rares.values())).toBeLessThanOrEqual(3);
    });

    it('still never puts a card in a pack twice', () => {
        for (const pack of generateBoosterPacks(POOL, LOB, 48, seededRng(3))) expect(new Set(pack.map(c => c.id)).size).toBe(pack.length);
    });

    it('opens a few packs as the first ones out of a box, and more than 24 as several boxes', () => {
        const few = generateBoosterPacks(POOL, LOB, 5, seededRng(5));
        expect(new Set(few.map(p => p[7]!.id)).size).toBe(5); // five different rares
        const two = generateBoosterPacks(POOL, LOB, 48, seededRng(5));
        expect(count(two.slice(0, 24), 'Super Rare')).toBe(4);
        expect(count(two.slice(24), 'Super Rare')).toBe(4);
    });

    it('is reproducible from a seed', () => {
        const a = generateBoosterPacks(POOL, LOB, 24, seededRng(9)).map(ids);
        const b = generateBoosterPacks(POOL, LOB, 24, seededRng(9)).map(ids);
        expect(a).toEqual(b);
    });
});
