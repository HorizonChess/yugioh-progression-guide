import { MongoClient, type Db } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateBoosterPack } from '@ygo/shared';
import { createCardCatalog } from '../src/cards/catalog';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { cryptoRng } from '../src/game/rng';
import { startMongo } from './helpers';

let mongo: MongoMemoryReplSet;
let client: MongoClient;
let db: Db;

const CODES: Record<string, string> = { 'Legend of Blue Eyes White Dragon': 'LOB', 'Metal Raiders': 'MRD' };
const set = (set_name: string, tcg_date: string, num_of_cards = 100) => ({ _id: set_name, set_name, set_code: CODES[set_name] ?? set_name.slice(0, 3).toUpperCase(), num_of_cards, tcg_date });

const RARITIES = ['Common', 'Common', 'Common', 'Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare'];
const card = (id: number, setName: string, setCode: string) => ({
    _id: id,
    id,
    name: `Card ${id}`,
    type: 'Normal Monster',
    frameType: 'normal',
    desc: '',
    race: 'Dragon',
    card_sets: [{ set_name: setName, set_code: `${setCode}-EN${String(id).padStart(3, '0')}`, set_rarity: RARITIES[id % RARITIES.length]!, set_rarity_code: '', set_price: '0' }],
    card_images: [{ id, image_url: '', image_url_small: '', image_url_cropped: '' }],
});

beforeAll(async () => {
    mongo = await startMongo();
    client = await MongoClient.connect(mongo.getUri());
});
afterAll(async () => {
    await client.close();
    await mongo.stop();
});
beforeEach(async () => {
    db = client.db(`catalog-${crypto.randomUUID()}`);
    // Inserted out of date order, with a same-day pair, to prove the order is computed.
    await cardSetsCollection(db).insertMany([
        set('Metal Raiders', '2002-06-26'),
        set("Gladiator's Assault", '2007-11-14'),
        set('Legend of Blue Eyes White Dragon', '2002-03-08'),
        set('Dark Revelation Volume 4', '2007-11-14'),
        set('Tournament Pack 1', '2003-05-01', 30),
        set('Structure Deck: Dragon', '2006-04-01'),
        set('Tiny Promo', '2004-01-01', 5),
        set('Code of the Duelist', '2017-08-04'),
    ]);
    await cardsCollection(db).insertMany([
        ...Array.from({ length: 60 }, (_, i) => card(100 + i, 'Legend of Blue Eyes White Dragon', 'LOB')),
        ...Array.from({ length: 10 }, (_, i) => card(300 + i, 'Metal Raiders', 'MRD')),
    ]);
});

describe('card catalog', () => {
    it('builds the same timeline the web app does: booster sets before the cutoff, by date then name', async () => {
        const catalog = createCardCatalog(db);
        expect((await catalog.timeline()).map((s) => s.set_name)).toEqual([
            'Legend of Blue Eyes White Dragon',
            'Metal Raiders',
            'Dark Revelation Volume 4',
            "Gladiator's Assault",
        ]);
        expect((await catalog.tournamentSets()).map((s) => s.set_name)).toEqual(['Tournament Pack 1']);
        expect((await catalog.setDates()).get('Structure Deck: Dragon')).toBe('2006-04-01');
    });

    it('lists the cards of one set, and looks cards up by id', async () => {
        const catalog = createCardCatalog(db);
        const lob = await catalog.cardsInSet('Legend of Blue Eyes White Dragon');
        expect(lob).toHaveLength(60);
        expect(lob[0]).not.toHaveProperty('_id');
        expect(await catalog.cardsInSet('Nope')).toEqual([]);

        const found = await catalog.cardsByIds([300, 300, 101, 999_999]);
        expect(found.map((c) => c.id).sort()).toEqual([101, 300]);
        expect(await catalog.cardsByIds([])).toEqual([]);
    });

    it('caches until invalidated', async () => {
        const catalog = createCardCatalog(db);
        expect(await catalog.timeline()).toHaveLength(4);
        await cardSetsCollection(db).insertOne(set('Pharaoh\'s Servant', '2002-10-20'));
        expect(await catalog.timeline()).toHaveLength(4);
        catalog.invalidate();
        expect(await catalog.timeline()).toHaveLength(5);
    });

    it('feeds pack generation with the crypto RNG', async () => {
        const catalog = createCardCatalog(db);
        const [lobSet] = await catalog.timeline();
        const pool = await catalog.cardsInSet(lobSet!.set_name);
        const pack = generateBoosterPack(pool, lobSet!, cryptoRng);
        expect(pack).toHaveLength(9);
        for (const pulled of pack) expect(pulled.pulled_set_code).toBe('LOB');
    });
});

describe('cryptoRng', () => {
    it('stays in [0, 1) and spreads across it', () => {
        const draws = Array.from({ length: 10_000 }, () => cryptoRng());
        expect(draws.every((d) => d >= 0 && d < 1)).toBe(true);
        const buckets = Array.from({ length: 10 }, (_, b) => draws.filter((d) => Math.floor(d * 10) === b).length);
        // Each tenth should get ~1000; allow generous slack so this never flakes.
        for (const count of buckets) expect(count).toBeGreaterThan(800);
    });
});
