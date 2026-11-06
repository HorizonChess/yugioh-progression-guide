import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardSetsCollection } from '../src/cards/sync';
import { MAX_SERIES_PER_USER, seriesCollection, seriesPlayersCollection } from '../src/game/series';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

const TIMELINE = ['Legend of Blue Eyes White Dragon', 'Metal Raiders', "Spell Ruler", "Pharaoh's Servant"];

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
});
afterEach(async () => {
    await app.close();
});

/** Signs up a fresh account and returns its session cookie header. */
async function player(name: string): Promise<string> {
    const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: `${name.toLowerCase()}@example.com`, password: 'heart of the cards', duelistName: name },
    });
    return `sid=${res.cookies.find((c) => c.name === 'sid')!.value}`;
}

const create = (cookie: string, body: Record<string, unknown> = {}) =>
    app.inject({
        method: 'POST',
        url: '/api/series',
        headers: { cookie },
        payload: { name: 'Solo run', mode: 'solo', startSetIndex: 0, packsPerSet: 24, ...body },
    });

const get = (cookie: string, url: string) => app.inject({ url, headers: { cookie } });

describe('POST /api/series', () => {
    it('creates a solo series starting where asked, with an empty player record', async () => {
        const yami = await player('Yami');
        const res = await create(yami, { name: '  Road to Battle City ', startSetIndex: 1, packsPerSet: 12 });
        expect(res.statusCode).toBe(201);
        const { series, me } = res.json();
        expect(series).toMatchObject({
            name: 'Road to Battle City',
            mode: 'solo',
            status: 'active',
            rules: { startSetIndex: 1, packsPerSet: 12 },
            currentSetIndex: 1,
            currentSetName: 'Metal Raiders',
            finished: false,
            bannedCardIds: [],
            matchHistory: [],
        });
        expect(series.members).toEqual([{ id: series.ownerId, duelistName: 'Yami' }]);
        expect(me).toEqual({ collection: {}, savedDecks: [], rewards: [], ydkImportUsed: false, marks: [] });
        expect(await seriesPlayersCollection(app.db).countDocuments()).toBe(1);
    });

    it('refuses a start set beyond the timeline, an odd pack count, extra keys and guests', async () => {
        const yami = await player('Yami');
        expect((await create(yami, { startSetIndex: TIMELINE.length })).json().error).toMatch(/starting set/);
        expect((await create(yami, { packsPerSet: 25 })).statusCode).toBe(400);
        // The client never chooses where a series currently stands, only where it starts.
        expect((await create(yami, { currentSetIndex: 3 })).statusCode).toBe(400);
        expect((await create(yami, { mode: 'trio' })).statusCode).toBe(400);
        expect((await create('')).statusCode).toBe(401);
        expect(await seriesCollection(app.db).countDocuments()).toBe(0);
    });

    it(`caps a player at ${MAX_SERIES_PER_USER} series`, async () => {
        const yami = await player('Yami');
        const me = await app.db.collection('users').findOne({ duelistNameKey: 'yami' });
        await seriesCollection(app.db).insertMany(
            Array.from({ length: MAX_SERIES_PER_USER }, () => ({
                name: 'x', mode: 'solo', ownerId: me!._id, memberIds: [me!._id], status: 'active',
                rules: { startSetIndex: 0, packsPerSet: 24 }, currentSetIndex: 0, currentSetName: TIMELINE[0], bannedCardIds: [], matchHistory: [],
                version: 1, createdAt: new Date(), updatedAt: new Date(),
            })) as never[],
        );
        const res = await create(yami);
        expect(res.statusCode).toBe(409);
        expect(await seriesPlayersCollection(app.db).countDocuments()).toBe(0);
    });
});

describe('reading series', () => {
    it('stays on its set by name when a card re-sync shifts the timeline', async () => {
        const yami = await player('Yami');
        const id = (await create(yami, { startSetIndex: 2 })).json().series.id;

        // A newly synced set released before everything else pushes every index up by one.
        await cardSetsCollection(app.db).insertOne({ _id: 'Dawn of the Duelists', set_name: 'Dawn of the Duelists', set_code: 'DOD', num_of_cards: 100, tcg_date: '2001-01-01' } as never);
        app.catalog.invalidate();

        const { series } = (await get(yami, `/api/series/${id}`)).json();
        expect(series).toMatchObject({ currentSetIndex: 3, currentSetName: 'Spell Ruler' });
    });

    it('lists only your own series, newest first', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        await create(yami, { name: 'First' });
        await create(yami, { name: 'Second' });
        await create(kaiba, { name: 'Kaiba only' });

        const list = (await get(yami, '/api/series')).json().series;
        expect(list.map((s: { name: string }) => s.name)).toEqual(['Second', 'First']);
        expect((await get('', '/api/series')).statusCode).toBe(401);
    });

    it('shows a member their series and own state, refuses everyone else', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = (await create(yami)).json().series.id;

        const mine = await get(yami, `/api/series/${id}`);
        expect(mine.statusCode).toBe(200);
        expect(mine.json()).toMatchObject({ series: { id, currentSetName: TIMELINE[0] }, me: { collection: {} } });

        expect((await get(kaiba, `/api/series/${id}`)).statusCode).toBe(403);
        expect((await get('', `/api/series/${id}`)).statusCode).toBe(401);
    });

    it('deletes a solo series with its player record, for members only', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = (await create(yami)).json().series.id;
        const del = (cookie: string) => app.inject({ method: 'DELETE', url: `/api/series/${id}`, headers: { cookie } });
        expect((await del(kaiba)).statusCode).toBe(403);
        expect((await del(yami)).statusCode).toBe(204);
        expect(await seriesPlayersCollection(app.db).countDocuments()).toBe(0);
        expect((await get(yami, `/api/series/${id}`)).statusCode).toBe(404);
    });

    it('answers 404 for unknown and malformed ids', async () => {
        const yami = await player('Yami');
        expect((await get(yami, '/api/series/0123456789abcdef01234567')).statusCode).toBe(404);
        expect((await get(yami, '/api/series/not-an-id')).statusCode).toBe(404);
        expect((await get(yami, '/api/series/0123456789ABCDEF01234567')).statusCode).toBe(404);
    });
});
