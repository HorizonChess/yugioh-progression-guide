import { MongoClient, type Db } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardSetsCollection, cardsCollection, syncCardData, type CardDataSource } from '../src/cards/sync';
import { startMongo } from './helpers';

const set = (set_name: string, tcg_date?: string) => ({ set_name, set_code: set_name.slice(0, 4).toUpperCase(), num_of_cards: 100, tcg_date });

const card = (id: number, printedIn: string[]) => ({
    id,
    name: `Card ${id}`,
    type: 'Normal Monster',
    frameType: 'normal',
    desc: '',
    race: 'Dragon',
    atk: 1000,
    def: null,
    card_prices: [{ tcgplayer_price: '1.00' }],
    card_sets: printedIn.map((set_name) => ({ set_name, set_code: 'X-EN001', set_rarity: 'Common', set_rarity_code: '(C)', set_price: '0' })),
    card_images: [{ id, image_url: 'a', image_url_small: 'b', image_url_cropped: 'c' }],
});

const SETS = [
    set('Legend of Blue Eyes White Dragon', '2002-03-08'),
    set('Structure Deck: Dragon', '2006-04-01'),
    set('Code of the Duelist', '2017-08-04'),
    set('Undated Promo'),
];

const CARDS = [
    card(1, ['Legend of Blue Eyes White Dragon']),
    card(2, ['Structure Deck: Dragon']), // pre-cutoff, off-timeline: still kept (Starlight can grant it)
    card(3, ['Code of the Duelist']), // post-cutoff only: skipped
    card(4, ['Undated Promo']), // undatable: skipped
    card(5, ['Code of the Duelist', 'Legend of Blue Eyes White Dragon']),
];

const source = (sets: unknown[], cards: unknown[]): CardDataSource => ({
    fetchSets: async () => sets,
    fetchCards: async () => ({ data: cards }),
});

let mongo: MongoMemoryReplSet;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
    mongo = await startMongo();
    client = await MongoClient.connect(mongo.getUri());
});

afterAll(async () => {
    await client.close();
    await mongo.stop();
});

beforeEach(() => {
    db = client.db(`sync-${crypto.randomUUID()}`);
});

describe('syncCardData', () => {
    it('stores every set and every card that existed by the cutoff', async () => {
        const report = await syncCardData(db, source(SETS, CARDS));

        expect(report).toMatchObject({ sets: 4, cards: 3, skippedCards: 2, rejectedSets: 0, rejectedCards: 0 });
        expect((await cardsCollection(db).find().toArray()).map((c) => c._id).sort()).toEqual([1, 2, 5]);
        expect(await cardSetsCollection(db).findOne({ _id: 'Undated Promo' })).toMatchObject({ tcg_date: '' });
    });

    it('stores trimmed cards and indexes them by printing set', async () => {
        await syncCardData(db, source(SETS, CARDS));

        const stored = await cardsCollection(db).findOne({ _id: 1 });
        expect(stored).not.toHaveProperty('card_prices');
        expect(stored).not.toHaveProperty('def');
        const indexes = await cardsCollection(db).indexes();
        expect(indexes.some((i) => 'card_sets.set_name' in i.key)).toBe(true);
        expect(await db.collection('meta').findOne({ _id: 'card-sync' as never })).toMatchObject({ sets: 4, cards: 3 });
    });

    it('updates changed cards and removes ones no longer listed', async () => {
        const pool = Array.from({ length: 40 }, (_, i) => card(100 + i, ['Legend of Blue Eyes White Dragon']));
        await syncCardData(db, source(SETS, pool));

        const [first, ...rest] = pool;
        const renamed = { ...first, name: 'Blue-Eyes White Dragon' };
        const report = await syncCardData(db, source(SETS, [renamed, ...rest.slice(0, -1)]));

        expect(report.removedCards).toBe(1);
        expect(await cardsCollection(db).findOne({ _id: 100 })).toMatchObject({ name: 'Blue-Eyes White Dragon' });
        expect(await cardsCollection(db).findOne({ _id: 139 })).toBeNull();
    });

    it('skips a few malformed records but refuses a broken response', async () => {
        const many = Array.from({ length: 40 }, (_, i) => card(100 + i, ['Legend of Blue Eyes White Dragon']));
        const report = await syncCardData(db, source(SETS, [...many, { id: 'not-a-card' }]));
        expect(report.rejectedCards).toBe(1);

        const broken = many.map(({ card_images: _, ...rest }) => rest);
        await expect(syncCardData(db, source(SETS, broken))).rejects.toThrow(/failed validation/);
        await expect(syncCardData(db, source({ error: 'down' } as never, CARDS))).rejects.toThrow(/not an array/);
    });

    it('refuses to shrink the stored card pool unless allowed', async () => {
        const many = Array.from({ length: 40 }, (_, i) => card(100 + i, ['Legend of Blue Eyes White Dragon']));
        await syncCardData(db, source(SETS, many));

        await expect(syncCardData(db, source(SETS, many.slice(0, 10)))).rejects.toThrow(/shrink/);
        expect(await cardsCollection(db).countDocuments()).toBe(40);

        const report = await syncCardData(db, source(SETS, many.slice(0, 10)), { allowShrink: true });
        expect(report.removedCards).toBe(30);
    });
});
