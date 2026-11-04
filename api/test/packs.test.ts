import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { seriesCollection, seriesPlayersCollection } from '../src/game/series';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

const LOB = { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB', num_of_cards: 100, tcg_date: '2002-03-08' };
const MRD = { set_name: 'Metal Raiders', set_code: 'MRD', num_of_cards: 100, tcg_date: '2002-06-26' };
const RARITIES = ['Common', 'Common', 'Common', 'Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare'];

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    ({ app } = await testApp(mongo));
    await cardSetsCollection(app.db).insertMany([LOB, MRD].map((s) => ({ _id: s.set_name, ...s })));
    await cardsCollection(app.db).insertMany(
        Array.from({ length: 60 }, (_, i) => ({
            _id: 100 + i, id: 100 + i, name: `Card ${i}`, type: 'Normal Monster', frameType: 'normal', desc: '', race: 'Dragon',
            card_sets: [{ set_name: LOB.set_name, set_code: `LOB-EN${100 + i}`, set_rarity: RARITIES[i % 8]!, set_rarity_code: '', set_price: '0' }],
            card_images: [],
        })),
    );
});
afterEach(async () => {
    await app.close();
});

async function newSeries(name = 'Yami') {
    const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: `${name}@example.com`, password: 'heart of the cards', duelistName: name } });
    const cookie = `sid=${signup.cookies.find((c) => c.name === 'sid')!.value}`;
    const created = await app.inject({ method: 'POST', url: '/api/series', headers: { cookie }, payload: { name: 'Run', mode: 'solo', startSetIndex: 0, packsPerSet: 12 } });
    const id: string = created.json().series.id;
    const call = (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) =>
        app.inject({ method, url: `/api/series/${id}/packs${path}`, headers: { cookie }, ...(payload ? { payload } : {}) });
    return { id, cookie, call };
}

describe('pack sessions', () => {
    it("rolls the series' pack count from the current set, with full card data", async () => {
        const { call } = await newSeries();
        const res = await call('POST', '/open');
        expect(res.statusCode).toBe(201);
        const { session } = res.json();
        expect(session).toMatchObject({ setIndex: 0, setName: LOB.set_name, stage: 'opening', flipped: [] });
        expect(session.packs).toHaveLength(12);
        expect(session.packs[0]).toHaveLength(9);
        expect(session.packs[0][0]).toMatchObject({ name: expect.stringMatching(/^Card/), pulled_set_code: 'LOB' });
    });

    it('opens once per set, even when two requests race', async () => {
        const { call } = await newSeries();
        const both = await Promise.all([call('POST', '/open'), call('POST', '/open')]);
        expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
        expect((await call('POST', '/open')).statusCode).toBe(409);
    });

    it('resumes the unsaved opening with its flips, and rejects flips that are not in it', async () => {
        const { call } = await newSeries();
        const { session } = (await call('POST', '/open')).json();
        expect((await call('PATCH', `/${session.id}/flips`, { flipped: [0, 1, 101] })).statusCode).toBe(204);
        expect((await call('PATCH', `/${session.id}/flips`, { flipped: [9999] })).statusCode).toBe(400);

        const resumed = (await call('GET', '/active')).json().session;
        expect(resumed.id).toBe(session.id);
        expect(resumed.flipped.sort()).toEqual([0, 1, 101]);
        expect(resumed.packs).toEqual(session.packs);
    });

    it('saves into the collection exactly once', async () => {
        const { call } = await newSeries();
        const { session } = (await call('POST', '/open')).json();
        const results = await Promise.all([call('POST', `/${session.id}/save`), call('POST', `/${session.id}/save`)]);
        expect(results.map((r) => r.statusCode).sort()).toEqual([204, 409]);

        const player = await seriesPlayersCollection(app.db).findOne({});
        const total = Object.values(player!.collection).reduce((a, b) => a + b, 0);
        expect(total).toBe(12 * 9);
        expect((await call('GET', '/active')).json().session).toBeNull();
        // Saving doesn't unlock a second opening of the same set.
        expect((await call('POST', '/open')).statusCode).toBe(409);
    });

    it("refuses other players' series and sessions", async () => {
        const yami = await newSeries('Yami');
        const kaiba = await newSeries('Kaiba');
        const { session } = (await yami.call('POST', '/open')).json();

        const steal = await app.inject({ method: 'POST', url: `/api/series/${yami.id}/packs/open`, headers: { cookie: kaiba.cookie } });
        expect(steal.statusCode).toBe(403);
        // Kaiba's own series doesn't reach Yami's session either.
        expect((await kaiba.call('POST', `/${session.id}/save`)).statusCode).toBe(404);
    });

    it('opens the next set only after the series moves on, and nothing past the last set', async () => {
        const { call } = await newSeries();
        await call('POST', '/open');
        await seriesCollection(app.db).updateOne({}, { $set: { currentSetIndex: 1, currentSetName: MRD.set_name } });
        expect((await call('POST', '/open')).json().session.setName).toBe(MRD.set_name);

        await seriesCollection(app.db).updateOne({}, { $set: { currentSetIndex: 2, currentSetName: 'none' } });
        expect((await call('POST', '/open')).json().error).toMatch(/every set/);
    });
});
