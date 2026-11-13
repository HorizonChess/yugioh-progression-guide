import { createHash, randomBytes } from 'node:crypto';
import { MongoServerError, ObjectId, type Db } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { OcgResponse } from 'ocgcore-wasm';
import { DuelClientMessageSchema, cardVersionAt, ruleEraFor, resolveSetIndex, type DuelModeId, type DuelServerMessage } from '@ygo/shared';
import { confirmReport, reportDuoMatch } from '../game/matches';
import { findSeries } from '../game/series';
import { engineFaulted, loadEngine } from './engine';
import { DUEL_RULES, DuelSession, type DuelSetup, type Team } from './session';

/*
 * Duels: stored in Mongo as their setup and every answer (enough to rebuild one exactly),
 * held in memory while played, and streamed to each player over a WebSocket.
 *
 * A practice duel is against the bot (a mirror of your deck) and records nothing; in solo
 * practice the bot only passes its turns. Guests practice too: their duel belongs to no series
 * and is opened with a secret token, and storage drops it after a day. A rival
 * duel is between the two members of a duo series: one challenges with a deck, the other
 * accepts with theirs, and the result goes through the series like a confirmed report.
 */

export interface DuelPlayer {
    userId: ObjectId | null;
    name: string;
    deckId: string | null;
    bot: boolean;
}

export interface DuelDoc {
    _id: ObjectId;
    /** Null for a guest's practice duel. */
    seriesId: ObjectId | null;
    setIndex: number;
    setName: string;
    kind: 'practice' | 'rival';
    /** `cancelled`: both players agreed to call it off; nothing was recorded. */
    status: 'waiting' | 'active' | 'finished' | 'declined' | 'cancelled';
    /** The team that asked to call the duel off, while the other hasn't answered. */
    callOffBy?: Team;
    /** Set while the duel is open, so a series has one open rival duel (and a player one practice duel). */
    openKey?: string;
    /** By team: team 0 goes first. While waiting, only the challenger (team 0 for now) is known. */
    players: DuelPlayer[];
    /** Null for a guest's practice duel. */
    challengerId: ObjectId | null;
    /** A guest's duel: the hash of the token that opens it. */
    guestTokenHash?: string;
    /** A guest's duel is removed after this (a TTL index). */
    expiresAt?: Date;
    mode: DuelModeId;
    /** While waiting: the challenger's deck, until the rival accepts and the setup is made. */
    challengerDeck?: { main: number[]; extra: number[] };
    setup: DuelSetup | null;
    /** The pinned engine data the duel was played with. */
    engineVersion: string;
    /** Every engine response in order (JSON, bigints kept). */
    answers: string[];
    winner: Team | null;
    reason: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export const duelsCollection = (db: Db) => db.collection<DuelDoc>('duels');

export async function ensureDuelIndexes(db: Db): Promise<void> {
    await duelsCollection(db).createIndex({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $exists: true } } });
    await duelsCollection(db).createIndex({ seriesId: 1, createdAt: -1 });
    await duelsCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export const encode = (r: OcgResponse) => JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? { $b: v.toString() } : v));
export const decode = (s: string): OcgResponse => JSON.parse(s, (_k, v) => (v && typeof v === 'object' && '$b' in v ? BigInt(v.$b) : v));
const newSeed = (): DuelSetup['seed'] => {
    const b = randomBytes(32);
    // Xoshiro256** must not be seeded with all zeros.
    return [0, 8, 16, 24].map((o) => (b.readBigUInt64LE(o) | (o === 0 ? 1n : 0n)).toString()) as DuelSetup['seed'];
};

export const hashGuestToken = (token: string) => createHash('sha256').update(token).digest('hex');
const GUEST_DUEL_MS = 24 * 60 * 60_000;

export type Deck = { main: number[]; extra: number[] };
export type Opponent = 'bot' | 'solo';

export type DuelProblem = 'no-set' | 'no-deck' | 'deck-illegal' | 'unknown-card' | 'busy' | 'finished' | 'no-rival' | 'not-yours' | 'not-waiting';

export interface DuelHub {
    /** Starts a practice duel or challenges the rival. */
    create(input: { seriesId: ObjectId; userId: ObjectId; name: string; deck: Deck; deckId: string; against: Opponent | 'rival' }): Promise<DuelDoc | DuelProblem>;
    /** A guest's practice duel at a set of the timeline, opened later with the returned token. */
    createGuest(input: { deck: Deck; setName: string; against: Opponent }): Promise<{ duel: DuelDoc; token: string } | DuelProblem>;
    accept(input: { duel: DuelDoc; userId: ObjectId; name: string; deck: { main: number[]; extra: number[] }; deckId: string }): Promise<DuelDoc | DuelProblem>;
    decline(duel: DuelDoc, userId: ObjectId): Promise<boolean>;
    find(id: ObjectId): Promise<DuelDoc | null>;
    teamOf(duel: DuelDoc, userId: ObjectId | null, guestToken?: string): Team | null;
    stateFor(duel: DuelDoc, team: Team): Promise<DuelServerMessage>;
    concede(duel: DuelDoc, team: Team): Promise<void>;
    /** `after`: where the page was (its last cursor), so a reconnect is shown what it missed. */
    connect(duel: DuelDoc, team: Team, socket: WebSocket, after?: string): void;
    /** Rule check before a duel: are these all cards the engine knows? */
    unknownCards(codes: number[]): Promise<number[]>;
}

const IDLE_MS = 30 * 60_000;

export function createDuelHub(app: FastifyInstance): DuelHub {
    const duels = () => duelsCollection(app.db);
    const live = new Map<string, { session: DuelSession; stored: number; touched: number }>();
    const sockets = new Map<string, Set<{ socket: WebSocket; team: Team }>>();
    // One change at a time per duel, so answers are stored in the order they were played.
    const queues = new Map<string, Promise<unknown>>();
    const serial = <T>(id: string, task: () => Promise<T>): Promise<T> => {
        const run = (queues.get(id) ?? Promise.resolve()).then(task, task);
        queues.set(id, run.catch(() => undefined));
        return run;
    };

    // Duels nobody has touched for a while leave memory; they're rebuilt from storage on return.
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of live) {
            if (now - entry.touched > IDLE_MS && !sockets.get(id)?.size) {
                entry.session.destroy();
                live.delete(id);
            }
        }
    }, 60_000);
    sweep.unref();
    app.addHook('onClose', async () => {
        clearInterval(sweep);
        for (const { session } of live.values()) session.destroy();
        live.clear();
    });

    /**
     * The engine itself failed (not a rule: see `engineFaulted`): it's broken for every duel, so all
     * the duels in memory are dropped, unsaved step and all, and a new engine is started. Each duel
     * is rebuilt from storage the next time one of its players does anything. True if it was that.
     */
    async function recover(error: unknown): Promise<boolean> {
        if (!engineFaulted(error)) return false;
        app.log.error({ err: error, duels: live.size }, 'the duel engine failed: starting a new one');
        // Not destroyed: their handles belong to the broken core.
        live.clear();
        await (await loadEngine()).revive();
        return true;
    }

    async function sessionOf(duel: DuelDoc) {
        const id = duel._id.toHexString();
        const cached = live.get(id);
        if (cached) {
            cached.touched = Date.now();
            return cached;
        }
        const engine = await loadEngine();
        // After a restart, relearn any alternate passcodes the decks use before rebuilding.
        await unknownCards(duel.setup!.decks.flatMap((d) => [...d.main, ...d.extra]));
        // The answers as they're stored now: the caller's copy of the duel may be from when its
        // page connected, many moves ago.
        const latest = await duels().findOne({ _id: duel._id }, { projection: { answers: 1, callOffBy: 1 } });
        if (latest) duel.answers = latest.answers;
        const callOffBy = latest?.callOffBy ?? null;
        const stored = duel.answers.map(decode);
        let session = new DuelSession(engine, duel.setup!);
        try {
            session.start(stored);
        } catch (error) {
            if (await recover(error)) throw error;
            // Duels from before the fix below lost the answers given right after a rebuild: put
            // them back if every stored answer still fits, and store the repaired list.
            session.destroy();
            session = new DuelSession(engine, duel.setup!);
            try {
                session.start(stored, { repair: true });
            } catch {
                session.destroy();
                throw error;
            }
            await duels().updateOne({ _id: duel._id }, { $set: { answers: session.answers.map(encode), updatedAt: new Date() } });
            app.log.warn({ duel: duel._id, stored: stored.length, repaired: session.answers.length }, 'duel repaired: answers lost after a rebuild were put back');
            duel.answers = session.answers.map(encode);
        }
        // Only what's in storage counts as stored. Answers the rebuild gave by itself after the last
        // stored one (the passes before a new duel's first move, the bot's next move) are saved with
        // the next step: counting them as stored lost them, and the duel couldn't be rebuilt again.
        session.callOffBy = callOffBy;
        const entry = { session, stored: duel.answers.length, touched: Date.now() };
        live.set(id, entry);
        return entry;
    }

    const setOf = async (seriesId: ObjectId) => {
        const series = await findSeries(app.db, seriesId);
        if (!series) return null;
        const timeline = await app.catalog.timeline();
        const setIndex = resolveSetIndex(timeline, series.currentSetName, series.currentSetIndex);
        const set = timeline[setIndex];
        return set ? { series, setIndex, set, timeline } : null;
    };

    /** Stores the answers played since the last save, then tells both players what happened. */
    async function persistAndBroadcast(duel: DuelDoc) {
        const id = duel._id.toHexString();
        const entry = live.get(id);
        if (!entry) return;
        const { session } = entry;
        const fresh = session.answers.slice(entry.stored).map(encode);
        entry.stored = session.answers.length;
        const finished = session.result !== null;
        await duels().updateOne(
            { _id: duel._id },
            {
                ...(fresh.length ? { $push: { answers: { $each: fresh } } } : {}),
                $set: {
                    updatedAt: new Date(),
                    ...(finished ? { status: session.result!.calledOff ? ('cancelled' as const) : ('finished' as const), winner: session.result!.winner, reason: session.result!.reason } : {}),
                    ...(!finished && session.callOffBy !== null ? { callOffBy: session.callOffBy } : {}),
                },
                ...(finished ? { $unset: { openKey: '' as const, callOffBy: '' as const } } : session.callOffBy === null ? { $unset: { callOffBy: '' as const } } : {}),
            },
        );
        // A finished rival duel is booked on the series before anyone is told, so their next screen shows it.
        if (finished && duel.kind === 'rival' && !session.result!.calledOff) await recordResult(duel, session.result!.winner);
        for (const s of sockets.get(id) ?? []) send(s.socket, { type: 'state', frames: session.takeFrames(s.team), state: session.state(s.team, id), cursor: session.cursor(s.team) });
        if (finished) live.delete(id);
    }

    /**
     * Takes back the move a player is still setting up (its zone, position or Tributes): the duel is
     * rebuilt from the answers before it, and stored that way. Nothing of it had shown on the board.
     */
    async function takeBack(duel: DuelDoc, team: Team, seq: number) {
        const id = duel._id.toHexString();
        const { session } = await sessionOf(duel);
        const answers = session.state(team, id).seq === seq ? session.backAnswers(team) : null;
        const watchers = sockets.get(id) ?? [];
        if (!answers) {
            for (const s of watchers) if (s.team === team) send(s.socket, { type: 'state', frames: [], state: session.state(team, id), cursor: session.cursor(team) });
            return;
        }
        const rebuilt = new DuelSession(await loadEngine(), duel.setup!);
        rebuilt.start(answers);
        live.set(id, { session: rebuilt, stored: answers.length, touched: Date.now() });
        await duels().updateOne({ _id: duel._id }, { $set: { answers: answers.map(encode), updatedAt: new Date() } });
        for (const s of watchers) send(s.socket, { type: 'state', frames: [], state: rebuilt.state(s.team, id), cursor: rebuilt.cursor(s.team) });
    }

    /** A rival duel's result counts like a confirmed report: the set advances, rewards are booked. */
    async function recordResult(duel: DuelDoc, winner: Team | null) {
        if (winner === null) return;
        const winnerId = duel.players[winner]!.userId!, loserId = duel.players[1 - winner]!.userId!;
        const at = await setOf(duel.seriesId!);
        if (!at || at.setIndex !== duel.setIndex) return;
        const report = await reportDuoMatch(app.db, { series: at.series, userId: winnerId, won: true, timeline: at.timeline });
        if (typeof report === 'string') return app.log.warn({ duel: duel._id, problem: report }, 'duel result not recorded');
        const fresh = await findSeries(app.db, duel.seriesId!);
        const confirmed = await confirmReport(app.mongo, app.db, { series: fresh!, userId: loserId, reportId: report._id, timeline: at.timeline });
        if (typeof confirmed === 'string') return app.log.warn({ duel: duel._id, problem: confirmed }, 'duel result not confirmed');
        for (const [userId, rival, won] of [[winnerId, duel.players[1 - winner]!.name, true], [loserId, duel.players[winner]!.name, false]] as const) {
            app.notify(userId, 'duel-result', duel.seriesId!, { seriesName: at.series.name, from: rival, setName: duel.setName, youWon: won });
        }
    }

    const send = (socket: WebSocket, message: DuelServerMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    /** Cards the engine can't play: it's taught the ones it knows by another passcode first. */
    async function unknownCards(codes: number[]) {
        const engine = await loadEngine();
        const unknown = [...new Set(codes)].filter((c) => !engine.cardData(c));
        if (!unknown.length) return [];
        const names = new Map((await app.catalog.cardsByIds(unknown)).map((c) => [c.id, c.name]));
        return unknown.filter((c) => !engine.learn(c, names.get(c) ?? ''));
    }

    /**
     * The deck as the engine plays it at `date`: each card that had an older version then (its
     * original text before an errata, or its 2005 GOAT version) is swapped for it. `shown` maps
     * each swap back, so players still see the card they own.
     */
    async function playedAt(deck: { main: number[]; extra: number[] }, date: string | undefined, shown: Record<string, number>) {
        const names = new Map((await app.catalog.cardsByIds([...deck.main, ...deck.extra])).map((c) => [c.id, c.name]));
        const swap = (code: number) => {
            const version = cardVersionAt(names.get(code) ?? '', date);
            if (!version) return code;
            shown[String(version.code)] = code;
            return version.code;
        };
        return { main: deck.main.map(swap), extra: deck.extra.map(swap) };
    }
    const setDate = async (duel: Pick<DuelDoc, 'setName'>) => (await app.catalog.timeline()).find((s) => s.set_name === duel.setName)?.tcg_date;

    /** A practice duel's players and setup: the bot plays a mirror of your deck; a coin decides who goes first. */
    async function practice(me: DuelPlayer, deck: Deck, date: string | undefined, mode: DuelModeId, against: Opponent) {
        const bot: DuelPlayer = { userId: null, name: against === 'solo' ? 'Solo Practice' : 'Practice Bot', deckId: null, bot: true };
        const players = randomBytes(1)[0]! & 1 ? [me, bot] : [bot, me];
        const shown: Record<string, number> = {};
        const played = await playedAt(deck, date, shown);
        const setup: DuelSetup = {
            seed: newSeed(), mode, decks: [played, played], names: [players[0]!.name, players[1]!.name], bots: [players[0]!.bot, players[1]!.bot], shown, rules: DUEL_RULES,
            ...(against === 'solo' ? { solo: true } : {}),
        };
        return { players, setup };
    }

    async function start(duel: DuelDoc) {
        await sessionOf(duel);
        await persistAndBroadcast(duel);
    }

    return {
        unknownCards,
        async create({ seriesId, userId, name, deck, deckId, against }) {
            const at = await setOf(seriesId);
            if (!at) return 'finished';
            if ((await unknownCards([...deck.main, ...deck.extra])).length) return 'unknown-card';
            const rivalId = at.series.memberIds.find((m) => !m.equals(userId)) ?? null;
            if (against === 'rival' && (at.series.mode !== 'duo' || at.series.status !== 'active' || !rivalId)) return 'no-rival';
            const engine = await loadEngine();
            const mode = ruleEraFor(at.set.tcg_date).id;
            const now = new Date();
            const me: DuelPlayer = { userId, name, deckId, bot: false };
            const solo = against !== 'rival';
            const doc: DuelDoc = {
                _id: new ObjectId(),
                seriesId,
                setIndex: at.setIndex,
                setName: at.set.set_name,
                kind: solo ? 'practice' : 'rival',
                status: solo ? 'active' : 'waiting',
                openKey: solo ? `${seriesId}:${userId}:practice` : `${seriesId}:rival`,
                players: [me],
                challengerId: userId,
                mode,
                setup: null,
                engineVersion: engine.version,
                answers: [],
                winner: null,
                reason: null,
                createdAt: now,
                updatedAt: now,
            };
            if (solo) {
                Object.assign(doc, await practice(me, deck, at.set.tcg_date, mode, against));
            } else {
                doc.challengerDeck = deck;
            }
            try {
                await duels().insertOne(doc);
            } catch (error) {
                if (error instanceof MongoServerError && error.code === 11000) return 'busy';
                throw error;
            }
            if (solo) await start(doc);
            return doc;
        },
        async createGuest({ deck, setName, against }) {
            const timeline = await app.catalog.timeline();
            const setIndex = timeline.findIndex((s) => s.set_name === setName);
            const set = timeline[setIndex];
            if (!set) return 'no-set';
            if ((await unknownCards([...deck.main, ...deck.extra])).length) return 'unknown-card';
            const engine = await loadEngine();
            const mode = ruleEraFor(set.tcg_date).id;
            const token = randomBytes(24).toString('base64url');
            const me: DuelPlayer = { userId: null, name: 'Guest', deckId: null, bot: false };
            const now = new Date();
            const doc: DuelDoc = {
                _id: new ObjectId(),
                seriesId: null,
                setIndex,
                setName: set.set_name,
                kind: 'practice',
                status: 'active',
                ...(await practice(me, deck, set.tcg_date, mode, against)),
                challengerId: null,
                guestTokenHash: hashGuestToken(token),
                expiresAt: new Date(now.getTime() + GUEST_DUEL_MS),
                mode,
                engineVersion: engine.version,
                answers: [],
                winner: null,
                reason: null,
                createdAt: now,
                updatedAt: now,
            };
            await duels().insertOne(doc);
            await start(doc);
            return { duel: doc, token };
        },
        async accept({ duel, userId, name, deck, deckId }) {
            if (duel.status !== 'waiting') return 'not-waiting';
            if (duel.challengerId?.equals(userId)) return 'not-yours';
            if ((await unknownCards([...deck.main, ...deck.extra])).length) return 'unknown-card';
            const challengerDeck = duel.challengerDeck!;
            const challenger = duel.players[0]!;
            const rival: DuelPlayer = { userId, name, deckId, bot: false };
            const flip = randomBytes(1)[0]! & 1;
            const players = flip ? [challenger, rival] : [rival, challenger];
            const shown: Record<string, number> = {};
            const date = await setDate(duel);
            const [mine, theirs] = [await playedAt(challengerDeck, date, shown), await playedAt(deck, date, shown)];
            const decks = (flip ? [mine, theirs] : [theirs, mine]) as DuelSetup['decks'];
            const setup: DuelSetup = { seed: newSeed(), mode: duel.mode, decks, names: [players[0]!.name, players[1]!.name], bots: [false, false], shown, rules: DUEL_RULES };
            const updated = await duels().findOneAndUpdate(
                { _id: duel._id, status: 'waiting' },
                { $set: { status: 'active', players, setup, updatedAt: new Date() }, $unset: { challengerDeck: '' } },
                { returnDocument: 'after' },
            );
            if (!updated) return 'not-waiting';
            await start(updated);
            app.notify(duel.challengerId!, 'duel-accepted', duel.seriesId!, { from: name, duelId: duel._id.toHexString(), setName: duel.setName });
            return updated;
        },
        async decline(duel, userId) {
            if (duel.status !== 'waiting') return false;
            const res = await duels().updateOne({ _id: duel._id, status: 'waiting' }, { $set: { status: 'declined', updatedAt: new Date() }, $unset: { openKey: '' } });
            if (!res.modifiedCount) return false;
            if (!duel.challengerId!.equals(userId)) app.notify(duel.challengerId!, 'duel-declined', duel.seriesId!, { duelId: duel._id.toHexString(), setName: duel.setName });
            return true;
        },
        find: (id) => duels().findOne({ _id: id }),
        teamOf(duel, userId, guestToken) {
            // A guest's duel: the human seat, for the right token.
            if (duel.guestTokenHash) return guestToken && hashGuestToken(guestToken) === duel.guestTokenHash ? (duel.players.findIndex((p) => !p.bot) as Team) : null;
            const i = userId ? duel.players.findIndex((p) => p.userId?.equals(userId)) : -1;
            return i === 0 || i === 1 ? i : null;
        },
        async stateFor(duel, team) {
            const { session } = await sessionOf(duel);
            return { type: 'state', frames: [], state: session.state(team, duel._id.toHexString()) };
        },
        concede(duel, team) {
            return serial(duel._id.toHexString(), async () => {
                const entry = await sessionOf(duel).catch((error: unknown) => {
                    app.log.error({ err: error, duel: duel._id }, 'duel could not be rebuilt; closing it as conceded');
                    return null;
                });
                if (entry) {
                    entry.session.concede(team);
                    return persistAndBroadcast(duel);
                }
                // A duel that can't be rebuilt can still be given up: close it where it's stored.
                const winner = (1 - team) as Team;
                await duels().updateOne(
                    { _id: duel._id, status: 'active' },
                    { $set: { status: 'finished', winner, reason: `${duel.players[team]!.name} surrendered`, updatedAt: new Date() }, $unset: { openKey: '' } },
                );
                if (duel.kind === 'rival') await recordResult(duel, winner);
            });
        },
        connect(duel, team, socket, after) {
            const id = duel._id.toHexString();
            const entry = { socket, team };
            const set = sockets.get(id) ?? new Set();
            sockets.set(id, set.add(entry));
            const ping = setInterval(() => socket.ping(), 30_000);
            socket.on('close', () => {
                clearInterval(ping);
                set.delete(entry);
                if (!set.size) sockets.delete(id);
            });
            socket.on('message', (raw: Buffer) => {
                let parsed;
                try {
                    parsed = DuelClientMessageSchema.safeParse(JSON.parse(raw.toString()));
                } catch {
                    return;
                }
                if (!parsed.success) return;
                const message = parsed.data;
                void serial(id, async () => {
                    const { session } = await sessionOf(duel);
                    if (message.type === 'back') {
                        await takeBack(duel, team, message.seq);
                        return;
                    }
                    if (message.type === 'call-off') {
                        const outcome = session.callOff(team, message.agree);
                        if (!outcome) return;
                        // The rival may not be looking: the bell tells them, and the one who asked when it's settled.
                        const other = duel.players[1 - team], me = duel.players[team]!;
                        if (other?.userId && duel.seriesId && outcome !== 'cleared') {
                            app.notify(other.userId, 'duel-call-off', duel.seriesId, { from: me.name, setName: duel.setName, duelId: id, done: outcome === 'done' });
                        }
                    } else if (message.type === 'concede') session.concede(team);
                    else if (!session.answer(team, message.seq, message.answer)) {
                        // Not this player's turn to answer, or an answer that doesn't fit: resend the truth.
                        send(socket, { type: 'state', frames: [], state: session.state(team, id), cursor: session.cursor(team) });
                        return;
                    }
                    await persistAndBroadcast(duel);
                }).catch(async (error: unknown) => {
                    app.log.error({ err: error, duel: id }, 'duel step failed');
                    // Never leave a player waiting on a reply that won't come: rebuild the duel from what's
                    // stored (the failed step is dropped) and send everyone the truth. If the engine
                    // itself failed on that step, the player is told the move can't be made.
                    const faulted = await recover(error).catch(() => false);
                    live.delete(id);
                    try {
                        const { session } = await sessionOf(duel);
                        for (const s of sockets.get(id) ?? []) {
                            const state = session.state(s.team, id);
                            send(s.socket, { type: 'state', frames: [], state: faulted && s.team === team && state.prompt ? { ...state, retry: true } : state, cursor: session.cursor(s.team) });
                        }
                    } catch (rebuild) {
                        app.log.error({ err: rebuild, duel: id }, 'duel could not be rebuilt after a failed step');
                    }
                });
            });
            void serial(id, async () => {
                const { session } = await sessionOf(duel);
                // The first look at a new duel plays it from the deal. A page reconnecting (a phone put
                // away mid-turn) is shown what it missed, when that's known; otherwise the board as it is.
                const missed = after ? session.framesSince(team, after) : null;
                send(socket, { type: 'state', frames: missed ?? session.framesOnConnect(team), state: session.state(team, id), cursor: session.cursor(team) });
            }).catch((error: unknown) => app.log.error({ err: error, duel: id }, 'duel connect failed'));
        },
    };
}
