import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { seriesCollection } from '../src/game/series';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

const TIMELINE = ['Legend of Blue Eyes White Dragon', 'Metal Raiders', 'Spell Ruler', "Pharaoh's Servant"];

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    ({ app } = await testApp(mongo));
    await cardSetsCollection(app.db).insertMany(
        TIMELINE.map((set_name, i) => ({ _id: set_name, set_name, set_code: `S${i}`, num_of_cards: 100, tcg_date: `2002-0${i + 1}-01` })),
    );
    await cardsCollection(app.db).insertMany(
        [100, 101].map((id) => ({ _id: id, id, name: `Card ${id}`, type: 'Normal Monster', frameType: 'normal', desc: '', race: 'Dragon', card_sets: [], card_images: [] })) as never,
    );
});
afterEach(async () => {
    await app.close();
});

async function player(name: string): Promise<string> {
    const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: `${name.toLowerCase()}@example.com`, password: 'heart of the cards', duelistName: name },
    });
    return `sid=${res.cookies.find((c) => c.name === 'sid')!.value}`;
}

const guestSave = (overrides: Record<string, unknown> = {}) => ({
    saveId: 'b5a1c0de-0000-4000-8000-000000000001',
    name: 'Old Run',
    startSetIndex: 0,
    // The index is stale; the name says where the run really stands.
    currentSetIndex: 0,
    currentSetName: 'Spell Ruler',
    packsPerSet: 24,
    collection: { '100_LOB-EN001_Ultra Rare': 2, '101_UNKNOWN_Common': 1, '999_MRD-EN001_Common': 3 },
    matchHistory: [
        { won: true, setName: 'Legend of Blue Eyes White Dragon', at: '2026-01-01T00:00:00.000Z' },
        { won: false, setName: 'Metal Raiders', at: 'not a date' },
    ],
    rewards: [
        { prizeId: 'wildcard-rare', wonFromPackName: 'Legend of Blue Eyes White Dragon', wonFromSetIndex: 3, wonDate: '2026-01-01T00:00:00.000Z', status: 'available' },
    ],
    bannedCardIds: [100, 999],
    savedDecks: [{ id: 'deck-1', name: 'Dragons', mainDeck: [100, 100, 999], extraDeck: [], sideDeck: [101], createdAt: 1767225600000 }],
    ...overrides,
});

const move = (cookie: string, body: unknown) => app.inject({ method: 'POST', url: '/api/series/import', headers: { cookie }, payload: body as object });

describe('POST /api/series/import', () => {
    it('moves a guest save in as a legacy solo series, placed by set name, leaving unknown cards behind', async () => {
        const yami = await player('Yami');
        const res = await move(yami, guestSave());
        expect(res.statusCode).toBe(201);
        const { series, dropped } = res.json();
        expect(dropped).toBe(3);
        expect(series).toMatchObject({ name: 'Old Run', mode: 'solo', status: 'active', currentSetIndex: 2, currentSetName: 'Spell Ruler', bannedCardIds: [100] });
        expect(series.matchHistory.map((m: { winnerId: string | null }) => m.winnerId)).toEqual([series.ownerId, null]);
        expect((await seriesCollection(app.db).findOne({}))?.legacy).toBe(true);

        const { me } = (await app.inject({ url: `/api/series/${series.id}`, headers: { cookie: yami } })).json();
        expect(me.collection).toEqual({ '100_LOB-EN001_Ultra Rare': 2, '101_UNKNOWN_Common': 1 });
        expect(me.savedDecks[0]).toMatchObject({ id: 'deck-1', mainDeck: [100, 100], sideDeck: [101] });
        expect(me.rewards[0]).toMatchObject({ prizeId: 'wildcard-rare', wonFromSetIndex: 0, status: 'available' });
        expect(me.rewards[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('moves a save in only once', async () => {
        const yami = await player('Yami');
        const first = (await move(yami, guestSave())).json();
        const again = await move(yami, guestSave());
        expect(again.statusCode).toBe(200);
        expect(again.json().series.id).toBe(first.series.id);
        expect(await seriesCollection(app.db).countDocuments()).toBe(1);
        // The same save is a different series in someone else's account.
        expect((await move(await player('Kaiba'), guestSave())).statusCode).toBe(201);
    });

    it('refuses malformed saves and guests', async () => {
        const yami = await player('Yami');
        expect((await move(yami, guestSave({ collection: { '100.x_LOB_Rare': 1 } }))).statusCode).toBe(400);
        expect((await move(yami, guestSave({ packsPerSet: 25 }))).statusCode).toBe(400);
        expect((await move(yami, guestSave({ rewards: [{ ...guestSave().rewards[0], prizeId: 'jackpot' }] }))).statusCode).toBe(400);
        expect((await move(yami, { ...guestSave(), version: 99 })).statusCode).toBe(400);
        expect((await move('', guestSave())).statusCode).toBe(401);
        expect(await seriesCollection(app.db).countDocuments()).toBe(0);
    });
});
