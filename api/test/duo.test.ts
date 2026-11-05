import type { FastifyInstance } from 'fastify';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardSetsCollection } from '../src/cards/sync';
import { invitesCollection } from '../src/game/invites';
import { seriesPlayersCollection } from '../src/game/series';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

const TIMELINE = ['Legend of Blue Eyes White Dragon', 'Metal Raiders', 'Spell Ruler'];

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

/** A signed-up player and a way to call the API as them. */
async function player(name: string) {
    const res = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: `${name.toLowerCase()}@example.com`, password: 'heart of the cards', duelistName: name },
    });
    const cookie = `sid=${res.cookies.find((c) => c.name === 'sid')!.value}`;
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
        app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    const notifications = async () => {
        await app.settleBackground();
        return (await call('GET', '/api/notifications')).json().notifications as { type: string; payload: Record<string, unknown> }[];
    };
    return { name, call, notifications };
}

type Player = Awaited<ReturnType<typeof player>>;

async function duo(owner: Player, startSetIndex = 0): Promise<string> {
    const res = await owner.call('POST', '/api/series', { name: 'Battle City', mode: 'duo', startSetIndex, packsPerSet: 12 });
    expect(res.statusCode).toBe(201);
    return res.json().series.id;
}

describe('duo series invites', () => {
    it('invites a rival by name, who accepts from their invites', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = await duo(yami);
        expect((await yami.call('GET', `/api/series/${id}`)).json().series).toMatchObject({ mode: 'duo', status: 'awaiting_rival' });

        const invited = await yami.call('POST', `/api/series/${id}/invites`, { duelistName: 'kaiba' });
        expect(invited.json()).toMatchObject({ invite: { to: 'Kaiba' } });
        expect((await kaiba.notifications())[0]).toMatchObject({ type: 'invite', payload: { seriesName: 'Battle City', from: 'Yami' } });

        const [invite] = (await kaiba.call('GET', '/api/invites')).json().invites;
        expect(invite).toMatchObject({ from: 'Yami', series: { id, name: 'Battle City', startSetName: TIMELINE[0] } });
        // Nobody else can use an invite by name.
        const joey = await player('Joey');
        expect((await joey.call('POST', '/api/invites/accept', { inviteId: invite.id })).statusCode).toBe(404);

        expect((await kaiba.call('POST', '/api/invites/accept', { inviteId: invite.id })).json()).toEqual({ seriesId: id });
        const { series, me } = (await kaiba.call('GET', `/api/series/${id}`)).json();
        expect(series.status).toBe('active');
        expect(series.members.map((m: { duelistName: string }) => m.duelistName)).toEqual(['Yami', 'Kaiba']);
        expect(me).toEqual({ collection: {}, savedDecks: [], rewards: [], ydkImportUsed: false });
        expect((await yami.notifications())[0]).toMatchObject({ type: 'invite-accepted', payload: { from: 'Kaiba' } });
        expect((await kaiba.call('GET', '/api/invites')).json().invites).toEqual([]);
    });

    it('shares a link anyone can open, and only the newest link works', async () => {
        const yami = await player('Yami');
        const id = await duo(yami, 1);
        const old: string = (await yami.call('POST', `/api/series/${id}/invites`)).json().code;
        const code: string = (await yami.call('POST', `/api/series/${id}/invites`)).json().code;

        const preview = await app.inject({ url: `/api/invites/link?code=${code}` });
        expect(preview.json().invite).toMatchObject({ from: 'Yami', series: { name: 'Battle City', rules: { startSetIndex: 1, packsPerSet: 12 }, startSetName: TIMELINE[1] } });
        expect((await app.inject({ url: `/api/invites/link?code=${old}` })).statusCode).toBe(404);

        expect((await yami.call('POST', '/api/invites/accept', { code })).json().error).toMatch(/your own/);
        const kaiba = await player('Kaiba');
        expect((await kaiba.call('POST', '/api/invites/accept', { code: old })).statusCode).toBe(404);
        expect((await kaiba.call('POST', '/api/invites/accept', { code })).statusCode).toBe(201);
        // The seat is taken: the link is spent and the series takes no third player.
        const joey = await player('Joey');
        expect((await joey.call('POST', '/api/invites/accept', { code })).statusCode).toBe(404);
        expect(await seriesPlayersCollection(app.db).countDocuments()).toBe(2);
    });

    it('only lets the owner invite, only while the seat is free, and only real duelists', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = await duo(yami);
        expect((await yami.call('POST', `/api/series/${id}/invites`, { duelistName: 'Nobody Here' })).statusCode).toBe(404);
        expect((await yami.call('POST', `/api/series/${id}/invites`, { duelistName: 'Yami' })).statusCode).toBe(400);
        expect((await kaiba.call('POST', `/api/series/${id}/invites`)).statusCode).toBe(403);

        const solo = (await yami.call('POST', '/api/series', { name: 'Alone', mode: 'solo', startSetIndex: 0, packsPerSet: 12 })).json().series.id;
        expect((await yami.call('POST', `/api/series/${solo}/invites`, { duelistName: 'Kaiba' })).statusCode).toBe(409);
    });

    it('tells the owner when an invite is declined', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = await duo(yami);
        const { invite } = (await yami.call('POST', `/api/series/${id}/invites`, { duelistName: 'Kaiba' })).json();
        expect((await yami.call('POST', `/api/invites/${invite.id}/decline`)).statusCode).toBe(404);
        expect((await kaiba.call('POST', `/api/invites/${invite.id}/decline`)).statusCode).toBe(204);
        expect((await yami.notifications())[0]).toMatchObject({ type: 'invite-declined', payload: { from: 'Kaiba' } });
        expect((await kaiba.call('POST', '/api/invites/accept', { inviteId: invite.id })).statusCode).toBe(404);
    });
});

describe('leaving a duo series', () => {
    it('pauses the series for the rival, who can then delete it', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = await duo(yami);
        const { code } = (await yami.call('POST', `/api/series/${id}/invites`)).json();
        await kaiba.call('POST', '/api/invites/accept', { code });

        expect((await kaiba.call('DELETE', `/api/series/${id}`)).statusCode).toBe(204);
        expect((await kaiba.call('GET', '/api/series')).json().series).toEqual([]);
        const { series } = (await yami.call('GET', `/api/series/${id}`)).json();
        expect(series).toMatchObject({ status: 'paused', members: [{ duelistName: 'Yami' }] });
        expect((await yami.notifications())[0]).toMatchObject({ type: 'rival-left', payload: { from: 'Kaiba' } });

        expect((await yami.call('DELETE', `/api/series/${id}`)).statusCode).toBe(204);
        expect((await yami.call('GET', `/api/series/${id}`)).statusCode).toBe(404);
        expect(await invitesCollection(app.db).countDocuments()).toBe(0);
    });
});
