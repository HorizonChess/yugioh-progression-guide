import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardVersionAt, collectionKey, type DuelAnswer, type DuelPrompt, type DuelServerMessage } from '@ygo/shared';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { engineDataAvailable } from '../src/duel/engine';
import { packSessions } from '../src/game/packs';
import { seriesCollection, seriesPlayersCollection } from '../src/game/series';
import { startMongo, testApp } from './helpers';

let mongo: MongoMemoryReplSet;
let app: FastifyInstance;

const TIMELINE = ['Legend of Blue Eyes White Dragon', 'Metal Raiders'];
const CARDS: [number, string, string, number][] = [
    [89631139, 'Blue-Eyes White Dragon', 'Normal Monster', 3], [46986414, 'Dark Magician', 'Normal Monster', 3], [74677422, 'Red-Eyes B. Dragon', 'Normal Monster', 3],
    [6368038, 'Gaia The Fierce Knight', 'Normal Monster', 3], [91152256, 'Celtic Guardian', 'Normal Monster', 3], [76184692, 'Hitotsu-Me Giant', 'Normal Monster', 3],
    [90357090, 'Silver Fang', 'Normal Monster', 3], [15025844, 'Mystical Elf', 'Normal Monster', 3], [54652250, 'Man-Eater Bug', 'Flip Effect Monster', 3],
    [66788016, 'Fissure', 'Spell Card', 2], [83764718, 'Monster Reborn', 'Spell Card', 1], [53129443, 'Dark Hole', 'Spell Card', 1],
    [59197169, 'Yami', 'Spell Card', 2], [4206964, 'Trap Hole', 'Trap Card', 3], [17814387, 'Reinforcements', 'Trap Card', 3], [50045299, 'Dragon Capture Jar', 'Trap Card', 2],
    [26202165, 'Sangan', 'Effect Monster', 3],
];
// 40 cards: everything above, as many copies as listed, minus a few to land on 40.
const DECK = [26202165, ...CARDS.flatMap(([id, , , n]) => Array<number>(n).fill(id)).slice(0, 39)];

beforeAll(async () => {
    mongo = await startMongo();
});
afterAll(async () => {
    await mongo.stop();
});
beforeEach(async () => {
    ({ app } = await testApp(mongo));
    await cardSetsCollection(app.db).insertMany(TIMELINE.map((set_name, i) => ({ _id: set_name, set_name, set_code: `S${i}`, num_of_cards: 100, tcg_date: `2002-0${i + 3}-08` })));
    await cardsCollection(app.db).insertMany(CARDS.map(([id, name, type]) => ({
        _id: id, id, name, type, frameType: type.startsWith('Spell') ? 'spell' : type.startsWith('Trap') ? 'trap' : 'normal', desc: '', race: 'Warrior',
        card_sets: [{ set_name: TIMELINE[0]!, set_code: 'LOB-EN001', set_rarity: 'Common', set_rarity_code: '', set_price: '0' }], card_images: [],
    })) as never);
});
afterEach(async () => {
    await app.close();
});

async function player(name: string) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: `${name.toLowerCase()}@example.com`, password: 'heart of the cards', duelistName: name } });
    const cookie = `sid=${res.cookies.find((c) => c.name === 'sid')!.value}`;
    const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
    return { name, cookie, call };
}
type Player = Awaited<ReturnType<typeof player>>;

/** Gives the player the deck's cards and saves the deck as "main". */
async function withDeck(p: Player, seriesId: string) {
    const user = await app.db.collection('users').findOne({ duelistName: p.name });
    const collection = Object.fromEntries(CARDS.map(([id]) => [collectionKey(id, 'LOB-EN001', 'Common'), 3]));
    await seriesPlayersCollection(app.db).updateOne({ seriesId: new ObjectId(seriesId), userId: user!._id }, { $set: { collection } });
    const saved = await p.call('PUT', `/api/series/${seriesId}/decks/main`, { name: 'Main', mainDeck: DECK, extraDeck: [], sideDeck: [] });
    expect(saved.statusCode).toBe(200);
    return user!._id;
}

/** A plain human: summons and attacks when offered, otherwise takes the first legal choice. */
function humanAnswer(p: DuelPrompt): DuelAnswer {
    switch (p.kind) {
        case 'actions': {
            const act = p.actions.find((a) => a.verb === 'summon' || a.verb.startsWith('attack'));
            return { kind: 'choice', id: act ? act.id : (p.next.find((n) => n.to === 'BP') ?? p.next.find((n) => n.to === 'EP') ?? p.next[0])!.id };
        }
        case 'chain': return { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        case 'cards':
            if (p.step) return p.step.canFinish && p.step.chosen.length >= p.min ? { kind: 'done' } : { kind: 'choice', id: p.cards[0]!.id };
            return { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
        case 'yesno': return { kind: 'choice', id: 1 };
        case 'declare': return { kind: 'many', ids: p.options.slice(0, p.count).map((o) => o.id) };
        case 'card-name': return { kind: 'name', name: 'Dark Magician' };
        case 'place': return { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
        default: return { kind: 'choice', id: p.options[0]!.id };
    }
}

/** Plays a duel over its socket, answering every question, until it's over (or after `moves` answers). Resolves with the last state. */
async function play(p: Pick<Player, 'name'> & { cookie?: string }, duelId: string, token?: string, moves = Infinity) {
    // The injected upgrade has no socket of its own; the rate limiter needs an address.
    const url = `/api/duels/${duelId}/live${token ? `?token=${token}` : ''}`;
    const socket = await app.injectWS(url, { headers: p.cookie ? { cookie: p.cookie } : {}, socket: { remoteAddress: '127.0.0.1' } } as never);
    return new Promise<DuelServerMessage['state'] & { frames: number }>((resolve, reject) => {
        let frames = 0, answered = 0;
        const timer = setTimeout(() => reject(new Error(`${p.name}: the duel never ended`)), 25_000);
        socket.on('message', (raw: Buffer) => {
            const msg = JSON.parse(raw.toString()) as DuelServerMessage;
            frames += msg.frames.length;
            const { state } = msg;
            if (state.result || (answered >= moves && state.prompt)) {
                clearTimeout(timer);
                socket.terminate();
                return resolve({ ...state, frames });
            }
            if (state.prompt) {
                answered++;
                socket.send(JSON.stringify({ type: 'answer', seq: state.seq, answer: humanAnswer(state.prompt) }));
            }
        });
    });
}

describe.skipIf(!engineDataAvailable())('duels', () => {
    it('plays a practice duel against the bot over the live socket', async () => {
        const yugi = await player('Yugi');
        const id = (await yugi.call('POST', '/api/series', { name: 'Solo', mode: 'solo', startSetIndex: 0, packsPerSet: 12 })).json().series.id;
        await withDeck(yugi, id);

        const started = await yugi.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'bot' });
        expect(started.statusCode).toBe(201);
        const duel = started.json().duel;
        expect(duel).toMatchObject({ kind: 'practice', status: 'active', mode: 'MR1', setName: TIMELINE[0] });
        // One practice duel at a time.
        expect((await yugi.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'bot' })).statusCode).toBe(409);

        const { state } = (await yugi.call('GET', `/api/duels/${duel.id}`)).json();
        expect(state.rival).toEqual({ name: 'Practice Bot', bot: true });
        expect(state.view.me.deck + state.view.me.hand.length).toBe(40 - (state.view.me.monsters.filter(Boolean).length + state.view.me.spells.filter(Boolean).length + state.view.me.grave.length));

        const end = await play(yugi, duel.id);
        expect(end.result).not.toBeNull();
        expect(end.frames).toBeGreaterThan(5);
        const stored = await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) });
        expect(stored).toMatchObject({ status: 'finished' });
        expect(stored!.openKey).toBeUndefined();
        // A 2002 series plays Sangan as first printed (its errata came in 2016), and shows it as the player's own Sangan.
        const sangan = cardVersionAt('Sangan', '2002-03-08')!;
        expect(stored!.setup.decks[0].main).toContain(sangan.code);
        expect(stored!.setup.decks[0].main).not.toContain(26202165);
        expect(stored!.setup.shown).toMatchObject({ [sangan.code]: 26202165 });
        // Reinforcements has a 2005 GOAT version, which a 2002 set plays too.
        expect(Object.values(stored!.setup.shown)).toContain(17814387);
        // Practice records nothing on the series.
        expect((await seriesCollection(app.db).findOne({ _id: new ObjectId(id) }))!.matchHistory).toEqual([]);
    });

    it('lets a guest practice solo: the duel opens only with its token, and the opponent never plays', async () => {
        const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'solo' } });
        expect(started.statusCode).toBe(201);
        const { duel, token } = started.json();
        expect(duel).toMatchObject({ kind: 'practice', status: 'active', mode: 'MR1', guest: true, seriesId: null });

        // Without the token (or with another), it's no one's duel.
        expect((await app.inject({ method: 'GET', url: `/api/duels/${duel.id}` })).statusCode).toBe(404);
        expect((await app.inject({ method: 'GET', url: `/api/duels/${duel.id}`, headers: { 'x-duel-token': 'nope' } })).statusCode).toBe(404);
        const { state } = (await app.inject({ method: 'GET', url: `/api/duels/${duel.id}`, headers: { 'x-duel-token': token } })).json();
        expect(state.rival).toEqual({ name: 'Solo Practice', bot: true, solo: true });

        const end = await play({ name: 'Guest' }, duel.id, token);
        // The opponent only passes, so the guest's attacks win it.
        expect(end.result).toMatchObject({ winner: 'me' });
        expect(end.view.opp.monsters.every((m) => m === null)).toBe(true);
        const stored = await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) });
        expect(stored).toMatchObject({ status: 'finished', seriesId: null });
        // Storage drops a guest's duel after a day; the token itself is never stored.
        expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(JSON.stringify(stored)).not.toContain(token);
    });

    it('takes back a summon while its zone is being chosen', async () => {
        const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'solo' } });
        const { duel, token } = started.json();
        const socket = await app.injectWS(`/api/duels/${duel.id}/live?token=${token}`, { socket: { remoteAddress: '127.0.0.1' } } as never);
        const steps: string[] = [];
        const done = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`no take-back: ${steps.join(', ')}`)), 15_000);
            let stage: 'summon' | 'place' | 'back' = 'summon', before: string | undefined;
            socket.on('message', (raw: Buffer) => {
                void (async () => {
                    const { state } = JSON.parse(raw.toString()) as DuelServerMessage;
                    const p = state.prompt;
                    if (!p) return;
                    steps.push(p.kind);
                    if (stage === 'back') {
                        // Back where it was: the same monster can be summoned again, and nothing is on the field.
                        expect(p.kind === 'actions' && p.actions.some((a) => a.verb === 'summon' && a.uid === before)).toBe(true);
                        expect(state.view.me.monsters.every((m) => m === null)).toBe(true);
                        clearTimeout(timer);
                        socket.terminate();
                        return resolve();
                    }
                    if (stage === 'place' && p.kind === 'place') {
                        expect(p.back).toBe(true);
                        stage = 'back';
                        return socket.send(JSON.stringify({ type: 'back', seq: state.seq }));
                    }
                    const summon = p.kind === 'actions' ? p.actions.find((a) => a.verb === 'summon') : undefined;
                    if (stage === 'summon' && summon) {
                        before = summon.uid;
                        stage = 'place';
                        return socket.send(JSON.stringify({ type: 'answer', seq: state.seq, answer: { kind: 'choice', id: summon.id } }));
                    }
                    socket.send(JSON.stringify({ type: 'answer', seq: state.seq, answer: humanAnswer(p) }));
                })().catch(reject);
            });
        });
        await done;
    });

    it('picks a duel up again after a restart, the answers the server gave by itself included', async () => {
        // Several duels, so some open with questions the server or the bot answers before your first move.
        for (let n = 0; n < 4; n++) {
            const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'bot' } });
            const { duel, token } = started.json();
            await play({ name: 'Guest' }, duel.id, token, 6);
            // A restart: a fresh server on the same database rebuilds the duel from storage.
            const db = app.db.databaseName;
            await app.close();
            ({ app } = await testApp(mongo, { MONGODB_DB: db }));
            const look = (await app.inject({ method: 'GET', url: `/api/duels/${duel.id}`, headers: { 'x-duel-token': token } })).json();
            expect(look.broken).toBeUndefined();
            expect(look.state?.view).toBeTruthy();
            await app.inject({ method: 'POST', url: `/api/duels/${duel.id}/concede`, headers: { 'x-duel-token': token } });
        }
    });

    it('can always give up a duel, even one that can no longer be rebuilt', async () => {
        const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'bot' } });
        const { duel, token } = started.json();
        // A stored copy whose answers no longer fit the duel (as when the rules changed under it).
        const original = await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) });
        const broken = { ...original!, _id: new ObjectId(), openKey: `broken:${duel.id}`, answers: Array(30).fill({ t: 'bogus' }) };
        await app.db.collection('duels').insertOne(broken);
        // Opening it says why it can't go on (no bare server error), and offers no board.
        const look = await app.inject({ method: 'GET', url: `/api/duels/${broken._id.toHexString()}`, headers: { 'x-duel-token': token } });
        expect(look.statusCode).toBe(200);
        expect(look.json()).toMatchObject({ state: null, broken: expect.any(String) });
        // Its record can be downloaded by a player in it, to replay it and find the fault.
        const record = await app.inject({ method: 'GET', url: `/api/duels/${broken._id.toHexString()}/record`, headers: { 'x-duel-token': token } });
        expect(record.json()).toMatchObject({ setup: { seed: expect.any(Array) }, answers: expect.any(Array) });
        expect(record.json().answers).toHaveLength(30);
        expect((await app.inject({ method: 'GET', url: `/api/duels/${broken._id.toHexString()}/record` })).statusCode).toBeGreaterThanOrEqual(400);
        const res = await app.inject({ method: 'POST', url: `/api/duels/${broken._id.toHexString()}/concede`, headers: { 'x-duel-token': token } });
        expect(res.statusCode).toBeLessThan(300);
        const stored = await app.db.collection('duels').findOne({ _id: broken._id });
        // Seats are drawn at random: the bot's seat wins.
        const botSeat = (original!.players as { bot: boolean }[]).findIndex((p) => p.bot);
        expect(stored).toMatchObject({ status: 'finished', winner: botSeat, reason: 'Guest surrendered' });
        expect(stored!.openKey).toBeUndefined();
    });

    it('refuses a guest deck that is too small, has unknown cards, or is at a set that does not exist', async () => {
        const post = (payload: object) => app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'bot', ...payload } });
        expect((await post({ deck: { main: DECK.slice(0, 30), extra: [] } })).statusCode).toBe(400);
        expect((await post({ deck: { main: [...DECK.slice(1), 12345678], extra: [] } })).statusCode).toBe(409);
        expect((await post({ deck: { main: [...DECK.slice(4), 46986414, 46986414, 46986414, 46986414], extra: [] } })).statusCode).toBe(409);
        expect((await post({ setName: 'Nope' })).statusCode).toBe(404);
        expect((await post({})).statusCode).toBe(201);
    });

    it('lets the rival accept a challenge, plays it out, and records the result on the series', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = (await yami.call('POST', '/api/series', { name: 'Battle City', mode: 'duo', startSetIndex: 0, packsPerSet: 12 })).json().series.id;
        const { code } = (await yami.call('POST', `/api/series/${id}/invites`)).json();
        await kaiba.call('POST', '/api/invites/accept', { code });
        const ids = [await withDeck(yami, id), await withDeck(kaiba, id)];
        for (const userId of ids) {
            await packSessions(app.db).insertOne({ _id: new ObjectId(), seriesId: new ObjectId(id), userId, setIndex: 0, setName: TIMELINE[0]!, source: 'set', packs: [], flipped: [], stage: 'saved', active: true, createdAt: new Date() } as never);
        }

        const challenge = (await yami.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'rival' })).json().duel;
        expect(challenge).toMatchObject({ kind: 'rival', status: 'waiting', challenger: 'Yami' });
        await app.settleBackground();
        const note = (await kaiba.call('GET', '/api/notifications')).json().notifications[0];
        expect(note).toMatchObject({ type: 'duel-challenge', payload: { from: 'Yami', duelId: challenge.id } });
        expect((await kaiba.call('GET', `/api/series/${id}/duels/open`)).json().duels).toHaveLength(1);
        // The challenger can't accept their own challenge.
        expect((await yami.call('POST', `/api/duels/${challenge.id}/accept`, { deckId: 'main' })).statusCode).toBe(409);

        expect((await kaiba.call('POST', `/api/duels/${challenge.id}/accept`, { deckId: 'main' })).json().duel.status).toBe('active');
        const [a, b] = await Promise.all([play(yami, challenge.id), play(kaiba, challenge.id)]);
        expect(a.result!.winner === 'me').toBe(b.result!.winner === 'opp');

        await app.settleBackground();
        const series = await seriesCollection(app.db).findOne({ _id: new ObjectId(id) });
        expect(series!.matchHistory).toHaveLength(1);
        expect(series!.currentSetName).toBe(TIMELINE[1]);
        expect((await yami.call('GET', '/api/notifications')).json().notifications[0]).toMatchObject({ type: 'duel-result' });
    });
});
