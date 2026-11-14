import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cardVersionAt, collectionKey, duelistById, duelistDeck, type DuelAnswer, type DuelMatchView, type DuelOnDevice, type DuelPrompt, type DuelServerMessage, type DuelState } from '@ygo/shared';
import { cardSetsCollection, cardsCollection } from '../src/cards/sync';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { decode, encode } from '../src/duel/hub';
import { DuelSession, type DuelSetup, type Team } from '../src/duel/session';
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


/** A practice game, as the page's worker plays it on the device: the duel rebuilt from the answers kept, the bot's moves made. */
async function onDevice(duelId: string, headers: Headers) {
    const look = await lookAt(duelId, headers);
    expect(look.state).toBeNull();
    const device = look.device as DuelOnDevice;
    const engine = await loadEngine();
    for (const [code, base] of Object.entries(device.learned)) engine.learnAs(Number(code), base);
    const session = new DuelSession(engine, device.setup as DuelSetup);
    session.start(device.answers.map(decode));
    return { session, team: device.team as Team, kept: device.answers.length, match: look.match as DuelMatchView | undefined };
}
/** A practice game's state now, as the device shows it. */
async function deviceState(duelId: string, headers: Headers): Promise<DuelState> {
    const { session, team, match } = await onDevice(duelId, headers);
    const state = session.state(team, duelId);
    session.destroy();
    return { ...state, ...(match ? { match } : {}) };
}

/** Plays a practice game on the device, its answers sent to the server as they're given and its result at the end (or after `moves` answers). */
async function playOnDevice(duelId: string, headers: Headers, moves = Infinity) {
    const { session, team, kept, match } = await onDevice(duelId, headers);
    let sent = kept, frames = session.framesOnConnect(team).length, answered = 0;
    const upload = async (end?: object) => {
        const res = await app.inject({ method: 'POST', url: `/api/duels/${duelId}/answers`, headers, payload: { from: sent, answers: session.answers.slice(sent).map(encode), ...(end ? { end } : {}) } });
        expect(res.statusCode).toBe(200);
        sent = session.answers.length;
        return res.json() as { match?: DuelMatchView };
    };
    try {
        for (let i = 0; i < 5000; i++) {
            const state = session.state(team, duelId);
            if (state.result) return { ...state, frames, match: (await upload({ winner: state.result.winner, reason: state.result.reason })).match };
            if (answered >= moves) return { ...state, frames, match: (await upload()).match ?? match };
            answered++;
            expect(session.answer(team, state.seq, humanAnswer(state.prompt!))).toBe(true);
            frames += session.takeFrames(team).length;
            await upload();
        }
        throw new Error('the game never ended');
    } finally {
        session.destroy();
    }
}

/** Plays it as one of the practice games begun before games moved to the device: on the server. */
const onServer = (duelId: string) => app.db.collection('duels').updateOne({ _id: new ObjectId(duelId) }, { $unset: { 'setup.onDevice': '' } });

/**
 * Plays a duel until it's over (or after `moves` answers), answering every question: a practice
 * game on the device, anything else over its socket. Resolves with the last state.
 */
async function play(p: Pick<Player, 'name'> & { cookie?: string }, duelId: string, token?: string, moves = Infinity): Promise<DuelState & { frames: number }> {
    const headers: Headers = p.cookie ? { cookie: p.cookie } : { 'x-duel-token': token! };
    if ((await lookAt(duelId, headers)).device) return playOnDevice(duelId, headers, moves);
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

type Headers = Record<string, string>;
const lookAt = async (duelId: string, headers: Headers) => (await app.inject({ method: 'GET', url: `/api/duels/${duelId}`, headers })).json();
const pregame = (duelId: string, headers: Headers, payload: object) => app.inject({ method: 'POST', url: `/api/duels/${duelId}/pregame`, headers, payload });

/**
 * Takes a game of a match through its pregame, each player doing what's asked of them: a hand
 * (the first player rock, the second scissors, so two players never tie), going first when it's
 * theirs to choose, and their deck as it stands when there's side decking. Returns who chose.
 */
async function ready(duelId: string, players: Headers[]) {
    let chooser: { player: number; why: string } | null = null;
    for (let round = 0; round < 60; round++) {
        let waiting = false;
        for (const [i, headers] of players.entries()) {
            const { duel, pregame: view } = await lookAt(duelId, headers);
            if (duel.status !== 'pregame') continue;
            waiting = true;
            if (view.rps && !view.rps.mine) await pregame(duelId, headers, { rps: i === 0 ? 'rock' : 'scissors' });
            else if (view.chooser?.side === 'me' && !view.chooser.chosen) {
                chooser = { player: i, why: view.chooser.why };
                await pregame(duelId, headers, { first: true });
            } else if (view.siding && !view.siding.done) await pregame(duelId, headers, { deck: view.siding.deck });
        }
        if (!waiting) return chooser;
    }
    throw new Error('the pregame never finished');
}

/** Plays a whole match: each game's pregame, then the game, until the match is decided. Returns the last states and the games' ids. */
async function playMatch(players: (Pick<Player, 'name'> & { cookie?: string; token?: string })[], firstId: string) {
    const headers = players.map((p): Headers => (p.cookie ? { cookie: p.cookie } : { 'x-duel-token': p.token! }));
    const games: string[] = [];
    for (let id = firstId; ; ) {
        games.push(id);
        await ready(id, headers);
        const ends = await Promise.all(players.map((p) => play(p, id, p.token)));
        if (!ends[0]!.match || ends[0]!.match.over) return { ends, games };
        id = ends[0]!.match.next!;
    }
}

describe.skipIf(!engineDataAvailable())('duels', () => {
    it('plays a practice match against the bot on the device, the server only keeping its answers', async () => {
        const yugi = await player('Yugi');
        const id = (await yugi.call('POST', '/api/series', { name: 'Solo', mode: 'solo', startSetIndex: 0, packsPerSet: 12 })).json().series.id;
        await withDeck(yugi, id);

        const started = await yugi.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'bot' });
        expect(started.statusCode).toBe(201);
        const duel = started.json().duel;
        // Against the bot it's a match: it opens on rock-paper-scissors.
        expect(duel).toMatchObject({ kind: 'practice', status: 'pregame', mode: 'MR1', setName: TIMELINE[0], match: { game: 1, wins: [0, 0] } });
        // One practice duel at a time.
        expect((await yugi.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'bot' })).statusCode).toBe(409);
        await ready(duel.id, [{ cookie: yugi.cookie }]);

        // The game is played on the device: the server sends what it takes, not a board.
        const state = await deviceState(duel.id, { cookie: yugi.cookie });
        expect(state.rival).toEqual({ name: 'Practice Bot', bot: true });
        expect(state.view.me.deck + state.view.me.hand.length).toBe(40 - (state.view.me.monsters.filter(Boolean).length + state.view.me.spells.filter(Boolean).length + state.view.me.grave.length));

        const { ends, games } = await playMatch([yugi], duel.id);
        const end = ends[0]!;
        expect(end.result).not.toBeNull();
        expect(end.frames).toBeGreaterThan(5);
        // Best of 3: two or three games, and whoever is ahead at the end has the match.
        expect(games.length).toBeGreaterThanOrEqual(2);
        expect(games.length).toBeLessThanOrEqual(3);
        expect(end.match).toMatchObject({ game: games.length, over: true });
        expect(end.match!.score[0] + end.match!.score[1]).toBeLessThanOrEqual(3);
        expect(end.match!.winner).toBe(end.match!.score[0] === end.match!.score[1] ? null : end.match!.score[0] > end.match!.score[1] ? 'me' : 'opp');
        const stored = await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) });
        expect(stored).toMatchObject({ status: 'finished' });
        expect(stored!.answers.length).toBeGreaterThan(20);
        // No game is left open, so a new practice match can start.
        expect(await app.db.collection('duels').countDocuments({ openKey: { $exists: true } })).toBe(0);
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
        const state = await deviceState(duel.id, { 'x-duel-token': token });
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
        await onServer(duel.id);
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
            await ready(duel.id, [{ 'x-duel-token': token }]);
            await onServer(duel.id);
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

    it('starts a new engine when the engine itself fails, and the duel goes on from what was stored', async () => {
        const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'bot' } });
        const { duel, token } = started.json();
        await ready(duel.id, [{ 'x-duel-token': token }]);
        await onServer(duel.id);
        await play({ name: 'Guest' }, duel.id, token, 4);
        const before = (await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) }))!.answers.length;
        // The engine faults on the next step (as it does when its stack runs out), for every duel on it.
        const engine = await loadEngine();
        const broken = engine.core;
        broken.duelProcess = () => {
            throw new WebAssembly.RuntimeError('memory access out of bounds');
        };
        const socket = await app.injectWS(`/api/duels/${duel.id}/live?token=${token}`, { socket: { remoteAddress: '127.0.0.1' } } as never);
        const retried = await new Promise<DuelServerMessage['state']>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('no reply after the engine failed')), 15_000);
            let sent = false;
            socket.on('message', (raw: Buffer) => {
                const { state } = JSON.parse(raw.toString()) as DuelServerMessage;
                if (!sent && state.prompt) {
                    sent = true;
                    return socket.send(JSON.stringify({ type: 'answer', seq: state.seq, answer: humanAnswer(state.prompt) }));
                }
                if (sent) {
                    clearTimeout(timer);
                    socket.terminate();
                    resolve(state);
                }
            });
        });
        // The move wasn't made: the same question again, marked as refused, on a new engine.
        expect(retried.retry).toBe(true);
        expect(retried.prompt).not.toBeNull();
        expect(engine.core).not.toBe(broken);
        expect((await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) }))!.answers.length).toBe(before);
        // And the duel plays to its end.
        const end = await play({ name: 'Guest' }, duel.id, token);
        expect(end.result).not.toBeNull();
    });

    it('can always give up a duel, even one that can no longer be rebuilt', async () => {
        const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'bot' } });
        const { duel, token } = started.json();
        await ready(duel.id, [{ 'x-duel-token': token }]);
        await onServer(duel.id);
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

    it('practices against a duelist from the anime: their name, their level and their deck of that era', async () => {
        const post = (payload: object) => app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [] }, setName: TIMELINE[0], against: 'bot', ...payload } });
        // Only one of the roster, an era of theirs, and only against the bot.
        expect((await post({ duelist: { id: 'kaiba' } })).statusCode).toBe(400);
        expect((await post({ duelist: { id: 'joey', era: 'gx' } })).statusCode).toBe(400);
        expect((await post({ against: 'solo', duelist: { id: 'joey' } })).statusCode).toBe(400);

        const started = await post({ duelist: { id: 'joey', era: 'bc' } });
        expect(started.statusCode).toBe(201);
        const { duel, token } = started.json();
        const stored = await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) });
        const botSeat = (stored!.players as { bot: boolean }[]).findIndex((p) => p.bot);
        expect(stored!.players[botSeat]).toMatchObject({ name: 'Joey Wheeler', bot: true, level: 'normal', duelist: 'joey', era: 'bc' });
        const joey = duelistDeck(duelistById('joey')!, 'bc').deck;
        expect(stored!.match.registered[botSeat]).toEqual({ main: joey.main, extra: joey.extra, side: [] });
        expect(stored!.match.registered[1 - botSeat]).toMatchObject({ main: DECK });

        // The game is dealt with Joey's deck on his side, and the board names him.
        await ready(duel.id, [{ 'x-duel-token': token }]);
        const device = (await app.inject({ method: 'GET', url: `/api/duels/${duel.id}`, headers: { 'x-duel-token': token } })).json().device as DuelOnDevice;
        const setup = device.setup as DuelSetup;
        const his = 1 - device.team;
        expect(setup.names[his]).toBe('Joey Wheeler');
        expect(setup.decks[his]!.main.length).toBe(joey.main.length);
        expect(setup.decks[his]!.extra.length).toBe(joey.extra.length);
        expect(setup.botLevel).toBe('normal');
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

        expect((await kaiba.call('POST', `/api/duels/${challenge.id}/accept`, { deckId: 'main' })).json().duel.status).toBe('pregame');
        // Nothing is booked until the match is decided.
        const { ends: [a, b], games } = await playMatch([yami, kaiba], challenge.id);
        expect(a!.result!.winner === 'me').toBe(b!.result!.winner === 'opp');
        expect(a!.match!.over).toBe(true);
        expect(a!.match!.score).toEqual([b!.match!.score[1], b!.match!.score[0]]);
        expect(Math.max(...a!.match!.score)).toBe(2);
        expect(games.length).toBe(a!.match!.score[0] + a!.match!.score[1]);

        await app.settleBackground();
        const series = await seriesCollection(app.db).findOne({ _id: new ObjectId(id) });
        expect(series!.matchHistory).toHaveLength(1);
        expect(series!.currentSetName).toBe(TIMELINE[1]);
        expect((await yami.call('GET', '/api/notifications')).json().notifications[0]).toMatchObject({ type: 'duel-result' });
    });

    it('calls a rival duel off only when both players agree: nothing is recorded, and a new challenge can be sent', async () => {
        const yami = await player('Yami');
        const kaiba = await player('Kaiba');
        const id = (await yami.call('POST', '/api/series', { name: 'Battle City', mode: 'duo', startSetIndex: 0, packsPerSet: 12 })).json().series.id;
        const { code } = (await yami.call('POST', `/api/series/${id}/invites`)).json();
        await kaiba.call('POST', '/api/invites/accept', { code });
        for (const userId of [await withDeck(yami, id), await withDeck(kaiba, id)]) {
            await packSessions(app.db).insertOne({ _id: new ObjectId(), seriesId: new ObjectId(id), userId, setIndex: 0, setName: TIMELINE[0]!, source: 'set', packs: [], flipped: [], stage: 'saved', active: true, createdAt: new Date(), updatedAt: new Date() } as never);
        }
        const duel = (await yami.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'rival' })).json().duel;
        await kaiba.call('POST', `/api/duels/${duel.id}/accept`, { deckId: 'main' });
        await ready(duel.id, [{ cookie: yami.cookie }, { cookie: kaiba.cookie }]);

        // Each player's socket, and the next state it's sent that fits.
        const open = async (p: Player) => {
            const socket = await app.injectWS(`/api/duels/${duel.id}/live`, { headers: { cookie: p.cookie }, socket: { remoteAddress: '127.0.0.1' } } as never);
            const seen: DuelServerMessage['state'][] = [];
            const waiting: { fits: (s: DuelServerMessage['state']) => boolean; done: (s: DuelServerMessage['state']) => void }[] = [];
            socket.on('message', (raw: Buffer) => {
                const { state } = JSON.parse(raw.toString()) as DuelServerMessage;
                seen.push(state);
                for (const w of [...waiting]) if (w.fits(state)) { waiting.splice(waiting.indexOf(w), 1); w.done(state); }
            });
            const next = (fits: (s: DuelServerMessage['state']) => boolean) => new Promise<DuelServerMessage['state']>((done, fail) => {
                const hit = seen.find(fits);
                if (hit) return done(hit);
                waiting.push({ fits, done });
                setTimeout(() => fail(new Error(`${p.name}: no such state`)), 10_000);
            });
            return { socket, next, forget: () => seen.splice(0) };
        };
        const [y, k] = [await open(yami), await open(kaiba)];
        await Promise.all([y.next(() => true), k.next(() => true)]);

        // Yami asks: Kaiba is asked, and told in the bell. Kaiba refuses: the duel goes on.
        y.socket.send(JSON.stringify({ type: 'call-off', agree: true }));
        expect((await k.next((s) => s.callOff === 'asking')).result).toBeNull();
        await y.next((s) => s.callOff === 'asked');
        await app.settleBackground();
        expect((await kaiba.call('GET', '/api/notifications')).json().notifications[0]).toMatchObject({ type: 'duel-call-off', payload: { from: 'Yami', duelId: duel.id, done: false } });
        // It's kept with the duel, for a page that looks later.
        expect((await kaiba.call('GET', `/api/duels/${duel.id}`)).json().state.callOff).toBe('asking');
        y.forget(); k.forget();
        k.socket.send(JSON.stringify({ type: 'call-off', agree: false }));
        expect((await y.next((s) => s.callOff === undefined)).result).toBeNull();
        expect((await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) }))!.status).toBe('active');

        // Asked again and agreed to: over, with no winner.
        y.forget(); k.forget();
        y.socket.send(JSON.stringify({ type: 'call-off', agree: true }));
        await k.next((s) => s.callOff === 'asking');
        k.socket.send(JSON.stringify({ type: 'call-off', agree: true }));
        const [endY, endK] = await Promise.all([y.next((s) => !!s.result), k.next((s) => !!s.result)]);
        expect(endY.result).toMatchObject({ winner: null, calledOff: true });
        expect(endK.result).toMatchObject({ winner: null, calledOff: true });
        y.socket.terminate(); k.socket.terminate();

        await app.settleBackground();
        const stored = await app.db.collection('duels').findOne({ _id: new ObjectId(duel.id) });
        expect(stored).toMatchObject({ status: 'cancelled', winner: null });
        expect(stored!.openKey).toBeUndefined();
        const series = await seriesCollection(app.db).findOne({ _id: new ObjectId(id) });
        expect(series!.matchHistory).toEqual([]);
        expect(series!.currentSetName).toBe(TIMELINE[0]);
        // They can duel again.
        expect((await kaiba.call('POST', `/api/series/${id}/duels`, { deckId: 'main', against: 'rival' })).statusCode).toBe(201);
    });

    it('opens a match on rock-paper-scissors, and lets the loser of a game side deck and choose who goes first', async () => {
        const SANGAN = 26202165;
        const started = await app.inject({ method: 'POST', url: '/api/duels/practice', payload: { deck: { main: DECK, extra: [], side: [SANGAN, SANGAN] }, setName: TIMELINE[0], against: 'bot' } });
        const { duel, token } = started.json();
        const mine = { 'x-duel-token': token };
        // Game 1: a hand to throw; no side decking yet. A tie is thrown again.
        let view = (await lookAt(duel.id, mine)).pregame;
        expect(view).toMatchObject({ game: 1, score: [0, 0], rival: { name: 'Practice Bot', bot: true }, rps: { mine: null } });
        expect(view.siding).toBeUndefined();
        expect((await pregame(duel.id, mine, { first: true })).statusCode).toBe(409);
        for (let i = 0; i < 30 && view?.rps; i++) view = (await pregame(duel.id, mine, { rps: 'paper' })).json().pregame;
        // Decided: the winner chooses. The bot, winning, goes first and the game starts; winning yourself, you choose.
        if (view) {
            expect(view.chooser).toMatchObject({ side: 'me', why: 'rps', hands: { mine: 'paper', theirs: 'rock' }, chosen: false });
            expect((await pregame(duel.id, mine, { first: false })).json().duel.status).toBe('active');
            const state = await deviceState(duel.id, mine);
            // The bot went first: it's on its turn 1, or has finished it and you're on turn 2.
            expect(state.view.turn === 1 ? state.view.turnPlayer : state.view.turn).toBe(state.view.turn === 1 ? 'opp' : 2);
        }
        expect((await lookAt(duel.id, mine)).duel.status).toBe('active');
        // Either way the board is told how it went, for its showdown: you threw paper.
        expect((await lookAt(duel.id, mine)).match.rps).toEqual(view ? { mine: 'paper', theirs: 'rock', won: true } : { mine: 'paper', theirs: 'scissors', won: false });
        // Lose game 1 (a surrender): the loser side decks and chooses who goes first in game 2.
        await app.inject({ method: 'POST', url: `/api/duels/${duel.id}/concede`, headers: mine });
        const after = await lookAt(duel.id, mine);
        expect(after.duel).toMatchObject({ status: 'finished', match: { game: 1, over: false } });
        expect(after.match).toMatchObject({ game: 1, score: [0, 1], over: false, next: expect.any(String) });
        const next: string = after.match.next;
        view = (await lookAt(next, mine)).pregame;
        expect(view).toMatchObject({ game: 2, score: [0, 1], chooser: { side: 'me', why: 'lost', chosen: false }, siding: { done: false, rivalDone: true } });
        expect(view.siding.deck).toEqual({ main: DECK, extra: [], side: [SANGAN, SANGAN] });
        // Not the registered deck with cards swapped: a card from nowhere, or a main deck a card short.
        const swapped = { main: [SANGAN, ...DECK.slice(1)], extra: [], side: [DECK[0]!, SANGAN] };
        expect((await pregame(next, mine, { deck: { ...swapped, main: [46986414, ...DECK.slice(1)] } })).statusCode).toBe(409);
        expect((await pregame(next, mine, { deck: { main: DECK, extra: [], side: [SANGAN] } })).statusCode).toBe(409);
        view = (await pregame(next, mine, { deck: swapped })).json().pregame;
        expect(view.siding).toMatchObject({ done: true, deck: swapped });
        expect((await pregame(next, mine, { deck: swapped })).statusCode).toBe(409);
        expect((await pregame(next, mine, { first: true })).json().duel.status).toBe('active');
        // Game 2 had no rock-paper-scissors.
        expect((await lookAt(next, mine)).match.rps).toBeUndefined();
        const second = await deviceState(next, mine);
        expect([second.view.turn, second.view.turnPlayer]).toEqual([1, 'me']);
        expect(second.match).toMatchObject({ game: 2, score: [0, 1], over: false });
        // The side-decked deck is the one dealt: 40 cards between the hand and the Deck.
        expect(second.view.me.deck + second.view.me.hand.length).toBe(40);
        const stored = await app.db.collection('duels').findOne({ _id: new ObjectId(next) });
        expect(stored!.match.current.find((d: { side: number[] }) => d.side.includes(DECK[0]!))).toMatchObject(swapped);
        // Losing again loses the match, 0-2: no third game.
        await app.inject({ method: 'POST', url: `/api/duels/${next}/concede`, headers: mine });
        expect((await lookAt(next, mine)).match).toEqual({ game: 2, score: [0, 2], over: true, winner: 'opp' });
    });
});
