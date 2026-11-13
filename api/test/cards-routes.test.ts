import { MongoClient } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { MAX_IDS } from '../src/routes/cards';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let client: MongoClient;
let app: FastifyInstance;

const card = (id: number, name: string, setName: string) => ({
    _id: id, id, name, type: 'Normal Monster', frameType: 'normal', desc: '', race: 'Dragon',
    card_sets: [{ set_name: setName, set_code: 'LOB-EN001', set_rarity: 'Common', set_rarity_code: '', set_price: '0' }],
    card_images: [{ id, image_url: '', image_url_small: '', image_url_cropped: '' }],
});

beforeAll(async () => {
    mongo = await startMongo();
    client = await MongoClient.connect(mongo.getUri());
    const built = await testApp(mongo);
    app = built.app;
    const db = client.db(built.config.MONGODB_DB);
    await cardSetsCollection(db).insertMany([
        { _id: 'Legend of Blue Eyes White Dragon', set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB', num_of_cards: 126, tcg_date: '2002-03-08' },
        { _id: 'Tournament Pack: 1st Season', set_name: 'Tournament Pack: 1st Season', set_code: 'TP1', num_of_cards: 60, tcg_date: '2002-09-01' },
    ]);
    await cardsCollection(db).insertMany([
        card(89631139, 'Blue-Eyes White Dragon', 'Legend of Blue Eyes White Dragon'),
        card(46986414, 'Dark Magician', 'Legend of Blue Eyes White Dragon'),
        card(38033121, 'Dark Magician Girl', 'Tournament Pack: 1st Season'),
    ]);
});
afterAll(async () => {
    await app.close();
    await client.close();
    await mongo.stop();
});

describe('card data routes', () => {
    it('lists every set, unfiltered, like cardsets.php', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/cards/sets' });
        expect(res.statusCode).toBe(200);
        expect(res.json().map((s: { set_code: string }) => s.set_code).sort()).toEqual(['LOB', 'TP1']);
        expect(res.headers['cache-control']).toContain('max-age');
    });

    it('answers cardinfo.php queries by id, set and name, without Mongo ids', async () => {
        const byId = await app.inject({ method: 'GET', url: '/api/cards?id=89631139,38033121,1' });
        expect(byId.json().data.map((c: { id: number }) => c.id).sort()).toEqual([38033121, 89631139]);
        expect(byId.json().data[0]).not.toHaveProperty('_id');

        const bySet = await app.inject({ method: 'GET', url: `/api/cards?set=${encodeURIComponent('Legend of Blue Eyes White Dragon')}` });
        expect(bySet.json().data).toHaveLength(2);

        const byName = await app.inject({ method: 'GET', url: '/api/cards?fname=dark%20MAGICIAN' });
        expect(byName.json().data.map((c: { name: string }) => c.name)).toEqual(['Dark Magician', 'Dark Magician Girl']);
        // Regex characters are matched literally.
        expect((await app.inject({ method: 'GET', url: '/api/cards?fname=.*' })).json().data).toEqual([]);
    });

    it('rejects a missing or malformed query and over-long id lists', async () => {
        expect((await app.inject({ method: 'GET', url: '/api/cards' })).statusCode).toBe(400);
        expect((await app.inject({ method: 'GET', url: '/api/cards?id=1,abc' })).statusCode).toBe(400);
        const many = Array.from({ length: MAX_IDS + 1 }, (_, i) => i + 1).join(',');
        expect((await app.inject({ method: 'GET', url: `/api/cards?id=${many}` })).statusCode).toBe(400);
    });
});
