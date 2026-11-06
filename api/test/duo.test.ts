import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { invitesCollection } from '../src/game/invites';
import { packSessions } from '../src/game/packs';
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
        expect(me).toEqual({ collection: {}, savedDecks: [], rewards: [], ydkImportUsed: false, marks: [] });
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

/** A duo series both players are in. */
async function pair() {
    const yami = await player('Yami');
    const kaiba = await player('Kaiba');
    const id = await duo(yami);
    const { code } = (await yami.call('POST', `/api/series/${id}/invites`)).json();
    await kaiba.call('POST', '/api/invites/accept', { code });
    const members = await seriesPlayersCollection(app.db).find({}).toArray();
    /** Stands in for opening and saving the current set's packs. */
    const saveSet = (who: 'Yami' | 'Kaiba', setIndex = 0) =>
        packSessions(app.db).insertOne({
            _id: new ObjectId(), seriesId: new ObjectId(id), userId: members[who === 'Yami' ? 0 : 1]!.userId, setIndex, setName: TIMELINE[setIndex]!,
            source: 'set', packs: [], flipped: [], stage: 'saved', active: true, createdAt: new Date(),
        });
    const series = async (as: Player = yami) => (await as.call('GET', `/api/series/${id}`)).json();
    return { yami, kaiba, id, saveSet, series };
}

describe('duo match results', () => {
    it('wait for the rival, then advance the set and reward both players', async () => {
        const { yami, kaiba, id, saveSet, series } = await pair();
        const report = (who: Player, result: 'win' | 'loss') => who.call('POST', `/api/series/${id}/matches`, { result });

        expect((await report(yami, 'win')).json().error).toMatch(/^Save this set/);
        await saveSet('Yami');
        expect((await report(yami, 'win')).json().error).toMatch(/rival hasn't saved/);
        await saveSet('Kaiba');
        expect((await series()).series.openingsSaved).toHaveLength(2);

        const reported = await report(yami, 'win');
        expect(reported.statusCode).toBe(202);
        const { report: pending } = reported.json();
        expect((await kaiba.notifications())[0]).toMatchObject({ type: 'report', payload: { from: 'Yami', setName: TIMELINE[0], reportId: pending.id, youWon: false } });
        expect((await series(kaiba)).series.pendingReport).toMatchObject({ id: pending.id, setName: TIMELINE[0] });
        expect((await report(kaiba, 'loss')).json().error).toMatch(/already waiting/);
        expect((await yami.call('POST', `/api/series/${id}/matches/${pending.id}/confirm`)).json().error).toMatch(/Your rival confirms/);

        const confirmed = await kaiba.call('POST', `/api/series/${id}/matches/${pending.id}/confirm`);
        expect(confirmed.json().reward).toMatchObject({ prizeId: 'pity-packs', wonFromPackName: TIMELINE[0] });
        expect((await kaiba.call('POST', `/api/series/${id}/matches/${pending.id}/confirm`)).statusCode).toBe(409);

        const after = await series();
        expect(after.series).toMatchObject({ currentSetIndex: 1, pendingReport: null, openingsSaved: [] });
        expect(after.series.matchHistory[0]).toMatchObject({ setName: TIMELINE[0], winnerId: after.series.members[0].id, loserId: after.series.members[1].id });
        expect(after.me.rewards).toEqual([expect.objectContaining({ prizeId: 'wheel-spin', status: 'available' })]);
        expect((await yami.notifications())[0]).toMatchObject({ type: 'report-confirmed', payload: { from: 'Kaiba', youWon: true } });
    });

    it('lets the rival reject a result, after which either player reports again', async () => {
        const { yami, kaiba, id, saveSet, series } = await pair();
        await saveSet('Yami');
        await saveSet('Kaiba');
        const { report } = (await kaiba.call('POST', `/api/series/${id}/matches`, { result: 'win' })).json();
        expect((await kaiba.call('POST', `/api/series/${id}/matches/${report.id}/reject`)).statusCode).toBe(409);
        expect((await yami.call('POST', `/api/series/${id}/matches/${report.id}/reject`)).statusCode).toBe(204);
        expect((await kaiba.notifications())[0]).toMatchObject({ type: 'report-rejected', payload: { from: 'Yami' } });
        expect((await series()).series).toMatchObject({ currentSetIndex: 0, pendingReport: null });
        expect((await yami.call('POST', `/api/series/${id}/matches`, { result: 'win' })).statusCode).toBe(202);
    });

    it('takes one of two reports sent at once, and none without a rival', async () => {
        const { yami, kaiba, id, saveSet } = await pair();
        await saveSet('Yami');
        await saveSet('Kaiba');
        const both = await Promise.all([yami, kaiba].map((p) => p.call('POST', `/api/series/${id}/matches`, { result: 'win' })));
        expect(both.map((r) => r.statusCode).sort()).toEqual([202, 409]);

        const joey = await player('Joey');
        const waiting = await duo(joey);
        expect((await joey.call('POST', `/api/series/${waiting}/matches`, { result: 'win' })).json().error).toMatch(/no rival/);
    });
});

describe('rival rewards', () => {
    /** Books an available reward for `who` and returns its id. */
    const give = async (seriesId: string, userId: ObjectId, prizeId: string) => {
        const id = crypto.randomUUID();
        await seriesPlayersCollection(app.db).updateOne(
            { seriesId: new ObjectId(seriesId), userId },
            { $push: { rewards: { id, prizeId, wonFromPackName: TIMELINE[0], wonFromSetIndex: 0, wonDate: new Date().toISOString(), status: 'available' } as never } },
        );
        return id;
    };

    it('Snatch Steal copies a card from the rival, who keeps it and is told', async () => {
        const { yami, kaiba, id, series } = await pair();
        const [me, rival] = (await series()).series.members.map((m: { id: string }) => new ObjectId(m.id));
        await seriesPlayersCollection(app.db).updateOne({ userId: rival }, { $set: { collection: { '100_LOB-EN100_Ultra Rare': 2, '101_LOB-EN101_Common': 1 } } });

        expect((await yami.call('GET', `/api/series/${id}/rival-binder`)).statusCode).toBe(409);
        const reward = await give(id, me!, 'snatch-steal');
        expect((await yami.call('GET', `/api/series/${id}/rival-binder`)).json().collection).toEqual({ '100_LOB-EN100_Ultra Rare': 2, '101_LOB-EN101_Common': 1 });
        expect((await kaiba.call('GET', `/api/series/${id}/rival-binder`)).statusCode).toBe(409);

        const claim = (printing?: string) => yami.call('POST', `/api/series/${id}/rewards/${reward}/claim`, printing ? { printing } : {});
        expect((await claim()).statusCode).toBe(400);
        expect((await claim('102_LOB-EN102_Common')).statusCode).toBe(400);
        expect((await claim('101_LOB-EN101_Common')).statusCode).toBe(201);
        expect((await claim('100_LOB-EN100_Ultra Rare')).statusCode).toBe(409);

        expect((await series(kaiba)).me.collection).toEqual({ '100_LOB-EN100_Ultra Rare': 2, '101_LOB-EN101_Common': 1 });
        const mine = (await series()).me;
        expect(mine.collection).toEqual({ '101_LOB-EN101_Common': 1 });
        expect(mine.rewards[0]).toMatchObject({ status: 'claimed', grantedCardId: 101 });
        expect((await kaiba.notifications())[0]).toMatchObject({ type: 'snatched', payload: { from: 'Yami', cardId: 101 } });
    });

    it("shows each player the rewards their rival claimed, never the ones still held", async () => {
        const { yami, kaiba, id, series } = await pair();
        const [me, rival] = (await series()).series.members.map((m: { id: string }) => new ObjectId(m.id));
        await seriesPlayersCollection(app.db).updateOne({ userId: rival }, { $set: { collection: { '101_LOB-EN101_Common': 1 } } });
        await give(id, rival!, 'ban');
        const snatch = await give(id, me!, 'snatch-steal');
        expect((await kaiba.call('GET', `/api/series/${id}/rival-rewards`)).json().rewards).toEqual([]);
        expect((await yami.call('POST', `/api/series/${id}/rewards/${snatch}/claim`, { printing: '101_LOB-EN101_Common' })).statusCode).toBe(201);

        const seen = (await kaiba.call('GET', `/api/series/${id}/rival-rewards`)).json().rewards;
        expect(seen).toEqual([expect.objectContaining({ id: snatch, prizeId: 'snatch-steal', wonFromPackName: TIMELINE[0], cardId: 101 })]);
        expect(seen[0].claimedDate).toBeTruthy();
        expect(seen[0]).not.toHaveProperty('status');
        expect((await yami.call('GET', `/api/series/${id}/rival-rewards`)).json().rewards).toEqual([]);
    });

    it('a ban applies to both players, and the rival is told', async () => {
        const { yami, kaiba, id, series } = await pair();
        await cardsCollection(app.db).insertOne({
            _id: 100, id: 100, name: 'Pot of Greed', type: 'Spell Card', frameType: 'spell', desc: '', race: 'Normal',
            card_sets: [{ set_name: TIMELINE[0]!, set_code: 'LOB-EN100', set_rarity: 'Rare', set_rarity_code: '', set_price: '0' }], card_images: [],
        } as never);
        const [me] = (await series()).series.members.map((m: { id: string }) => new ObjectId(m.id));
        const reward = await give(id, me!, 'ban');
        expect((await yami.call('POST', `/api/series/${id}/rewards/${reward}/claim`, { cardId: 100 })).statusCode).toBe(201);
        expect((await series(kaiba)).series.bannedCardIds).toEqual([100]);
        expect((await kaiba.notifications())[0]).toMatchObject({ type: 'banlist', payload: { from: 'Yami', cardId: 100, banned: true } });
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
