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

    it('rerolls an unsaved opening only by spending a Redoer Ticket', async () => {
        const { call } = await newSeries();
        const { session } = (await call('POST', '/open')).json();
        expect((await call('POST', `/${session.id}/reroll`)).json().error).toMatch(/Redoer/);

        const ticket = { id: 't1', prizeId: 'redoer-ticket', wonFromPackName: LOB.set_name, wonFromSetIndex: 0, wonDate: '', status: 'available' };
        await seriesPlayersCollection(app.db).updateOne({}, { $push: { rewards: ticket as never } });
        const res = await call('POST', `/${session.id}/reroll`);
        expect(res.statusCode).toBe(201);
        const fresh = res.json().session;
        expect(fresh.packs).toHaveLength(12);
        expect((await call('GET', '/active')).json().session.id).toBe(fresh.id);
        expect((await seriesPlayersCollection(app.db).findOne({}))!.rewards[0]!.status).toBe('claimed');
        expect((await call('POST', `/${fresh.id}/reroll`)).statusCode).toBe(409);
    });
});

describe('reward claims', () => {
    async function setup() {
        const s = await newSeries();
        const give = async (prizeId: string, wonFromPackName = LOB.set_name) => {
            const id = `${prizeId}-${Math.random()}`;
            await seriesPlayersCollection(app.db).updateOne({}, { $push: { rewards: { id, prizeId, wonFromPackName, wonFromSetIndex: 0, wonDate: '', status: 'available' } as never } });
            return (payload: object = {}) =>
                app.inject({ method: 'POST', url: `/api/series/${s.id}/rewards/${id}/claim`, headers: { cookie: s.cookie }, payload });
        };
        const player = async () => (await seriesPlayersCollection(app.db).findOne({}))!;
        const banned = async () => (await seriesCollection(app.db).findOne({}))!.bannedCardIds;
        return { ...s, give, player, banned };
    }
    const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

    it('grants a wildcard card only from the won set at or below its rarity, once', async () => {
        const r = await setup();
        const claim = await r.give('wildcard-rare');
        expect((await claim({ cardId: 106 })).statusCode).toBe(400); // Ultra Rare
        expect((await claim({ cardId: 104 })).statusCode).toBe(201);
        const player = await r.player();
        expect(total(player.collection)).toBe(1);
        expect(player.rewards[0]).toMatchObject({ status: 'claimed', grantedCardId: 104 });
        expect((await claim({ cardId: 100 })).statusCode).toBe(409);
    });

    it('grants a starlight only for cards released before the won set', async () => {
        const r = await setup();
        expect((await (await r.give('wildcard-starlight'))({ cardId: 100 })).statusCode).toBe(400);
        expect((await (await r.give('wildcard-starlight', MRD.set_name))({ cardId: 100 })).statusCode).toBe(201);
    });

    it('bans any card and unbans only banned ones', async () => {
        const r = await setup();
        expect((await (await r.give('ban'))({ cardId: 100 })).statusCode).toBe(201);
        expect(await r.banned()).toEqual([100]);
        const unban = await r.give('unban');
        expect((await unban({ cardId: 101 })).statusCode).toBe(400);
        expect((await unban({ cardId: 100 })).statusCode).toBe(201);
        expect(await r.banned()).toEqual([]);
    });

    it('opens pity packs as a resumable session, and refuses unspun or unknown rewards', async () => {
        const r = await setup();
        const { session } = (await (await r.give('pity-packs'))()).json();
        expect(session).toMatchObject({ source: 'pity', setName: LOB.set_name });
        expect(session.packs).toHaveLength(3);
        expect((await r.call('GET', '/active?kind=reward')).json().session.id).toBe(session.id);
        expect((await r.call('GET', '/active?kind=set')).json().session).toBeNull();
        expect((await r.call('POST', `/${session.id}/save`)).statusCode).toBe(204);
        expect(total((await r.player()).collection)).toBe(27);

        expect((await (await r.give('wheel-spin'))()).json().error).toMatch(/Spin/);
        const unknown = await app.inject({ method: 'POST', url: `/api/series/${r.id}/rewards/nope/claim`, headers: { cookie: r.cookie }, payload: {} });
        expect(unknown.statusCode).toBe(404);
    });
});

describe('decks and collection import', () => {
    async function setup() {
        const s = await newSeries();
        const send = (method: 'PUT' | 'POST' | 'DELETE', path: string, payload?: object) =>
            app.inject({ method, url: `/api/series/${s.id}${path}`, headers: { cookie: s.cookie }, ...(payload ? { payload } : {}) });
        const player = async () => (await seriesPlayersCollection(app.db).findOne({}))!;
        return { send, player };
    }
    const deck = (mainDeck: number[]) => ({ name: 'Beatdown', mainDeck, extraDeck: [], sideDeck: [] });

    it('saves only decks built from owned, unbanned cards, and updates or deletes by id', async () => {
        const { send, player } = await setup();
        expect((await send('POST', '/collection/import', { cardIds: [100, 100, 101, 102], mode: 'add' })).statusCode).toBe(204);
        expect((await send('PUT', '/decks/d1', deck([100, 100, 100]))).json().error).toMatch(/own enough/);
        expect((await send('PUT', '/decks/d1', deck([9999]))).json().error).toMatch(/Unknown/);
        expect((await send('PUT', '/decks/d1', deck([100, 100, 101]))).statusCode).toBe(200);
        expect((await send('PUT', '/decks/d1', deck([102]))).statusCode).toBe(200);
        expect((await player()).savedDecks.map((d) => d.mainDeck)).toEqual([[102]]);

        await seriesCollection(app.db).updateOne({}, { $set: { bannedCardIds: [101] } });
        expect((await send('PUT', '/decks/d2', deck([101]))).json().error).toMatch(/banned/);
        expect((await send('DELETE', '/decks/d1')).statusCode).toBe(204);
        expect((await player()).savedDecks).toEqual([]);
    });

    it('imports anytime in solo, but only once in a duo series that skipped early sets', async () => {
        const { send, player } = await setup();
        await send('POST', '/collection/import', { cardIds: [100], mode: 'add' });
        expect((await send('POST', '/collection/import', { cardIds: [101, 101], mode: 'replace' })).statusCode).toBe(204);
        expect(Object.values((await player()).collection)).toEqual([2]);
        expect((await send('POST', '/collection/import', { cardIds: [9999], mode: 'add' })).statusCode).toBe(400);

        await seriesCollection(app.db).updateOne({}, { $set: { mode: 'duo' } });
        await seriesPlayersCollection(app.db).updateOne({}, { $set: { ydkImportUsed: false } });
        expect((await send('POST', '/collection/import', { cardIds: [100], mode: 'add' })).json().error).toMatch(/first set/);
        await seriesCollection(app.db).updateOne({}, { $set: { 'rules.startSetIndex': 1 } });
        expect((await send('POST', '/collection/import', { cardIds: [100], mode: 'add' })).statusCode).toBe(204);
        expect((await send('POST', '/collection/import', { cardIds: [100], mode: 'add' })).statusCode).toBe(409);
    });
});

describe('match reports and the wheel', () => {
    const report = (s: { id: string; cookie: string }, result: string) =>
        app.inject({ method: 'POST', url: `/api/series/${s.id}/matches`, headers: { cookie: s.cookie }, payload: { result } });
    const spin = (s: { id: string; cookie: string }, rewardId: string) =>
        app.inject({ method: 'POST', url: `/api/series/${s.id}/rewards/${rewardId}/spin`, headers: { cookie: s.cookie } });

    it('needs the set saved, then a win advances the set and spins once on the server', async () => {
        const s = await newSeries();
        expect((await report(s, 'win')).json().error).toMatch(/Save/);
        const { session } = (await s.call('POST', '/open')).json();
        await s.call('POST', `/${session.id}/save`);

        const res = await report(s, 'win');
        expect(res.statusCode).toBe(201);
        const { reward } = res.json();
        expect(reward).toMatchObject({ prizeId: 'wheel-spin', wonFromPackName: LOB.set_name, status: 'available' });
        expect(await seriesCollection(app.db).findOne({})).toMatchObject({ currentSetIndex: 1, currentSetName: MRD.set_name, version: 2 });
        // The set moved on, so the same set can't be reported twice.
        expect((await report(s, 'win')).statusCode).toBe(409);

        const { prize } = (await spin(s, reward.id)).json();
        expect(prize.id).not.toMatch(/snatch-steal|wheel-spin|pity/);
        expect((await seriesPlayersCollection(app.db).findOne({}))!.rewards[0]!.prizeId).toBe(prize.id);
        expect((await spin(s, reward.id)).statusCode).toBe(409);
    });

    it('gives pity packs for a loss, which cannot be spun', async () => {
        const s = await newSeries();
        const { session } = (await s.call('POST', '/open')).json();
        await s.call('POST', `/${session.id}/save`);
        const { reward } = (await report(s, 'loss')).json();
        expect(reward.prizeId).toBe('pity-packs');
        expect((await spin(s, reward.id)).statusCode).toBe(409);
        expect((await report(s, 'draw')).statusCode).toBe(400);
    });
});
