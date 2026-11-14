import { createHash, randomBytes } from 'node:crypto';
import { MongoServerError, ObjectId, type Db } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
    BOT_NAMES, DuelClientMessageSchema, cardVersionAt, ruleEraFor, resolveSetIndex,
    type BotLevel, type DeviceAnswers, type DuelMatchView, type DuelOnDevice, type DuelModeId, type DuelPregameView, type DuelServerMessage, type DuelState, type MatchDeck, type PregameAction, type RpsHand,
} from '@ygo/shared';
import { confirmReport, reportDuoMatch } from '../game/matches';
import { findSeries } from '../game/series';
import { engineDataId } from '@ygo/duel/engine';
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
 *
 * A practice game is played on the player's device (DuelSetup.onDevice): the engine and the bot
 * run in their browser, and the server only keeps its answers and books how it ended (`record`).
 * Rival duels are played here, and so are practice games begun before that.
 *
 * A duel against the rival or the bot is a game of a match, best of 3. Each game is a duel of its
 * own (its own document, setup and answers), linked by `match`. Before a game there's a pregame:
 * game 1 opens with rock-paper-scissors, whose winner chooses who goes first; before games 2 and
 * 3 both players may swap cards with their side deck, and the loser of the last game chooses who
 * goes first (a coin, after a drawn game). The series is booked once, when the match is decided.
 */

/** A player's place in a match: fixed for all its games (the team, who goes first, changes). */
export type Seat = 0 | 1;

export interface MatchInfo {
    /** The match's id: its first game's. */
    id: ObjectId;
    game: number;
    /** Games won, by seat. */
    wins: [number, number];
    /** The decks as registered for the match, by seat: side decking only moves cards within one. */
    registered: [MatchDeck, MatchDeck];
    /** The decks as last played, by seat: where the next side decking starts from. */
    current: [MatchDeck, MatchDeck];
    over?: boolean;
    /** The seat that won the match (null: drawn, or called off). */
    winner?: Seat | null;
}

export interface PreGame {
    /** Rock-paper-scissors, by seat: the hands thrown this round. */
    rps: [RpsHand | null, RpsHand | null];
    /** The hand both threw last round. */
    tied?: RpsHand;
    /** The hands that decided it. */
    hands?: [RpsHand, RpsHand];
    /** The seat that chooses who goes first, and why it's theirs to choose. */
    chooser: Seat | null;
    why: 'rps' | 'lost' | 'coin';
    /** The chooser goes first (true) or second. */
    first: boolean | null;
    /** The decks handed in for this game, by seat. */
    decks: [MatchDeck | null, MatchDeck | null];
}

export interface DuelPlayer {
    userId: ObjectId | null;
    name: string;
    deckId: string | null;
    bot: boolean;
    /** The bot's: how well it plays (missing: normal). */
    level?: BotLevel;
}

export interface DuelDoc {
    _id: ObjectId;
    /** Null for a guest's practice duel. */
    seriesId: ObjectId | null;
    setIndex: number;
    setName: string;
    kind: 'practice' | 'rival';
    /** `pregame`: a game of a match about to start. `cancelled`: both players agreed to call it off; nothing was recorded. */
    status: 'waiting' | 'pregame' | 'active' | 'finished' | 'declined' | 'cancelled';
    /** The match this duel is a game of. */
    match?: MatchInfo;
    pre?: PreGame;
    /** Once active: the seat of team 0 and of team 1. (Before that, `players` is in seat order.) */
    seats?: [Seat, Seat];
    /** The next game of the match, once this one is over. */
    next?: ObjectId;
    /** Game 1, once started: the rock-paper-scissors hands by team, and the team that won it. */
    rps?: { hands: [RpsHand, RpsHand]; winner: Team };
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
    challengerDeck?: { main: number[]; extra: number[]; side?: number[] };
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

import { decodeAnswer as decode, encodeAnswer as encode } from '@ygo/duel/answers';
export { encode, decode };
const newSeed = (): DuelSetup['seed'] => {
    const b = randomBytes(32);
    // Xoshiro256** must not be seeded with all zeros.
    return [0, 8, 16, 24].map((o) => (b.readBigUInt64LE(o) | (o === 0 ? 1n : 0n)).toString()) as DuelSetup['seed'];
};

export const hashGuestToken = (token: string) => createHash('sha256').update(token).digest('hex');
const GUEST_DUEL_MS = 24 * 60 * 60_000;

export type Deck = MatchDeck;
export type Opponent = 'bot' | 'solo';

export type DuelProblem = 'no-set' | 'no-deck' | 'deck-illegal' | 'unknown-card' | 'busy' | 'finished' | 'no-rival' | 'not-yours' | 'not-waiting' | 'not-now' | 'bad-side';

export interface DuelHub {
    /** Starts a practice duel or challenges the rival. */
    create(input: { seriesId: ObjectId; userId: ObjectId; name: string; deck: Deck; deckId: string; against: Opponent | 'rival'; level?: BotLevel }): Promise<DuelDoc | DuelProblem>;
    /** A guest's practice duel at a set of the timeline, opened later with the returned token. */
    createGuest(input: { deck: Deck; setName: string; against: Opponent; level?: BotLevel }): Promise<{ duel: DuelDoc; token: string } | DuelProblem>;
    accept(input: { duel: DuelDoc; userId: ObjectId; name: string; deck: Deck; deckId: string }): Promise<DuelDoc | DuelProblem>;
    /** Before a game: a hand thrown, who goes first chosen, or a side-decked deck handed in. */
    pregame(duel: DuelDoc, seat: Seat, action: PregameAction): Promise<DuelDoc | DuelProblem>;
    pregameView(duel: DuelDoc, seat: Seat): DuelPregameView;
    /** The match as a player of this duel sees it (their seat while it's a pregame, their team after). */
    matchView(duel: DuelDoc, team: Team): DuelMatchView | undefined;
    /** Gives the match up before a game starts. */
    forfeit(duel: DuelDoc, seat: Seat): Promise<void>;
    decline(duel: DuelDoc, userId: ObjectId): Promise<boolean>;
    find(id: ObjectId): Promise<DuelDoc | null>;
    teamOf(duel: DuelDoc, userId: ObjectId | null, guestToken?: string): Team | null;
    stateFor(duel: DuelDoc, team: Team): Promise<DuelServerMessage>;
    /** `wholeMatch`: the match is given up with the game (ending a practice match to start another). */
    concede(duel: DuelDoc, team: Team, wholeMatch?: boolean): Promise<void>;
    /** `after`: where the page was (its last cursor), so a reconnect is shown what it missed. */
    connect(duel: DuelDoc, team: Team, socket: WebSocket, after?: string): void;
    /** Rule check before a duel: are these all cards the engine knows? */
    unknownCards(codes: number[]): Promise<number[]>;
    /** A game played on the player's device: what their page needs to play it, or pick it up again. */
    onDevice(duel: DuelDoc, team: Team): Promise<DuelOnDevice>;
    /**
     * Keeps the answers of a game played on the device; at its end, books the result it's told
     * (the duel as it then stands, for the match's next step).
     */
    record(duel: DuelDoc, team: Team, input: DeviceAnswers): Promise<DuelDoc | DuelProblem>;
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
        const latest = await duels().findOne({ _id: duel._id });
        if (latest) Object.assign(duel, latest);
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
        // A finished game moves its match along (the next game, or the match's result booked on the
        // series) before anyone is told, so their next screen shows it.
        if (finished && duel.match) await closeGame(duel, session.result!.winner, !!session.result!.calledOff);
        else if (finished && duel.kind === 'rival' && !session.result!.calledOff && session.result!.winner !== null) await recordResult(duel, duel.players[session.result!.winner]!, duel.players[1 - session.result!.winner]!);
        for (const s of sockets.get(id) ?? []) send(s.socket, { type: 'state', frames: session.takeFrames(s.team), state: stateOf(duel, session, s.team), cursor: session.cursor(s.team) });
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
            for (const s of watchers) if (s.team === team) send(s.socket, { type: 'state', frames: [], state: stateOf(duel, session, team), cursor: session.cursor(team) });
            return;
        }
        const rebuilt = new DuelSession(await loadEngine(), duel.setup!);
        rebuilt.start(answers);
        live.set(id, { session: rebuilt, stored: answers.length, touched: Date.now() });
        await duels().updateOne({ _id: duel._id }, { $set: { answers: answers.map(encode), updatedAt: new Date() } });
        for (const s of watchers) send(s.socket, { type: 'state', frames: [], state: stateOf(duel, rebuilt, s.team), cursor: rebuilt.cursor(s.team) });
    }

    /** A rival duel's (or match's) result counts like a confirmed report: the set advances, rewards are booked. */
    async function recordResult(duel: DuelDoc, won: DuelPlayer, lost: DuelPlayer) {
        const winnerId = won.userId!, loserId = lost.userId!;
        const at = await setOf(duel.seriesId!);
        if (!at || at.setIndex !== duel.setIndex) return;
        const report = await reportDuoMatch(app.db, { series: at.series, userId: winnerId, won: true, timeline: at.timeline });
        if (typeof report === 'string') return app.log.warn({ duel: duel._id, problem: report }, 'duel result not recorded');
        const fresh = await findSeries(app.db, duel.seriesId!);
        const confirmed = await confirmReport(app.mongo, app.db, { series: fresh!, userId: loserId, reportId: report._id, timeline: at.timeline });
        if (typeof confirmed === 'string') return app.log.warn({ duel: duel._id, problem: confirmed }, 'duel result not confirmed');
        for (const [userId, rival, youWon] of [[winnerId, lost.name, true], [loserId, won.name, false]] as const) {
            app.notify(userId, 'duel-result', duel.seriesId!, { seriesName: at.series.name, from: rival, setName: duel.setName, youWon });
        }
    }

    // ---- matches ------------------------------------------------------------------------------

    /** The players in seat order, whatever the duel's stage. */
    const seated = (duel: DuelDoc): DuelPlayer[] => (duel.seats ? [duel.players[duel.seats.indexOf(0)]!, duel.players[duel.seats.indexOf(1)]!] : duel.players);
    /** The seat a team sits in (while a duel is a pregame, `players` is in seat order: team is the seat). */
    const seatOfTeam = (duel: DuelDoc, team: Team): Seat => (duel.seats ? duel.seats[team] : team);

    function matchView(duel: DuelDoc, team: Team): DuelMatchView | undefined {
        const m = duel.match;
        if (!m) return undefined;
        const mine = seatOfTeam(duel, team), theirs = (1 - mine) as Seat;
        return {
            game: m.game,
            score: [m.wins[mine], m.wins[theirs]],
            over: !!m.over,
            ...(m.over ? { winner: m.winner === undefined || m.winner === null ? null : m.winner === mine ? ('me' as const) : ('opp' as const) } : {}),
            ...(duel.next ? { next: duel.next.toHexString() } : {}),
            ...(duel.rps ? { rps: { mine: duel.rps.hands[team], theirs: duel.rps.hands[1 - team]!, won: duel.rps.winner === team } } : {}),
        };
    }
    const stateOf = (duel: DuelDoc, session: DuelSession, team: Team): DuelState => {
        const match = matchView(duel, team);
        return { ...session.state(team, duel._id.toHexString()), ...(match ? { match } : {}) };
    };

    /** Duels whose surrender gives up the match too (by id), until the game is closed. */
    const givenUp = new Set<string>();
    const BEATS: Record<RpsHand, RpsHand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const randomHand = (): RpsHand => (['rock', 'paper', 'scissors'] as const)[randomBytes(1)[0]! % 3]!;

    /**
     * Moves a pregame as far as it goes by itself: the bot throws its hand, chooses to go first and
     * keeps its deck; two hands thrown decide rock-paper-scissors (or tie, and are thrown again).
     * True once everything is in and the game can start.
     */
    function settle(duel: DuelDoc): boolean {
        const pre = duel.pre!, m = duel.match!;
        for (;;) {
            for (const s of [0, 1] as const) {
                if (!duel.players[s]!.bot) continue;
                if (pre.chooser === null && !pre.rps[s]) pre.rps[s] = randomHand();
                if (pre.chooser === s && pre.first === null) pre.first = true;
                pre.decks[s] ??= m.current[s];
            }
            const [a, b] = pre.rps;
            if (pre.chooser !== null || !a || !b) break;
            if (a === b) {
                pre.tied = a;
                pre.rps = [null, null];
                continue;
            }
            pre.hands = [a, b];
            pre.chooser = BEATS[a] === b ? 0 : 1;
            delete pre.tied;
        }
        return pre.chooser !== null && pre.first !== null && !!pre.decks[0] && !!pre.decks[1];
    }

    /** A side-decked deck is the registered one with cards moved between its parts, each part the size it was. */
    async function sidedFrom(registered: MatchDeck, deck: MatchDeck): Promise<boolean> {
        const engine = await loadEngine();
        const all = (d: MatchDeck) => [...d.main, ...d.extra, ...d.side].sort((x, y) => x - y).join(',');
        return all(registered) === all(deck) && deck.main.length === registered.main.length && deck.extra.length === registered.extra.length
            && deck.extra.every((c) => engine.isExtra(c)) && !deck.main.some((c) => engine.isExtra(c));
    }

    /** The first pregame of a match between two seated players, with the decks they registered. */
    function openMatch(id: ObjectId, players: DuelPlayer[], decks: [MatchDeck, MatchDeck]): Pick<DuelDoc, 'status' | 'players' | 'match' | 'pre'> {
        const duel = {
            status: 'pregame' as const,
            players,
            match: { id, game: 1, wins: [0, 0] as [number, number], registered: decks, current: decks },
            // Game 1 is played with the decks as registered.
            pre: { rps: [null, null], chooser: null, why: 'rps', first: null, decks: [decks[0], decks[1]] } as PreGame,
        };
        settle(duel as DuelDoc);
        return duel;
    }

    /** Everything is in: the game is set up (the chooser's pick decides the teams) and dealt. */
    async function activate(duel: DuelDoc): Promise<DuelDoc> {
        const pre = duel.pre!, m = duel.match!;
        const firstSeat = (pre.first ? pre.chooser! : 1 - pre.chooser!) as Seat;
        const seats: [Seat, Seat] = [firstSeat, (1 - firstSeat) as Seat];
        const players = seats.map((s) => duel.players[s]!);
        const shown: Record<string, number> = {};
        const date = await setDate(duel);
        const decks = [await playedAt(pre.decks[seats[0]]!, date, shown), await playedAt(pre.decks[seats[1]]!, date, shown)] as DuelSetup['decks'];
        const botLevel = players.find((p) => p.bot)?.level;
        // Against the bot, the game is played on the player's device: the server only keeps its answers.
        const onDevice = players.some((p) => p.bot);
        const setup: DuelSetup = {
            seed: newSeed(), mode: duel.mode, decks, names: [players[0]!.name, players[1]!.name], bots: [players[0]!.bot, players[1]!.bot], shown, rules: DUEL_RULES,
            ...(botLevel ? { botLevel } : {}),
            ...(onDevice ? { onDevice } : {}),
        };
        const match: MatchInfo = { ...m, current: [pre.decks[0]!, pre.decks[1]!] };
        // Rock-paper-scissors, kept by team (the seats are now in turn order) for the showdown.
        const rps = pre.why === 'rps' && pre.hands
            ? { hands: [pre.hands[seats[0]], pre.hands[seats[1]]] as [RpsHand, RpsHand], winner: (seats[0] === pre.chooser ? 0 : 1) as Team }
            : undefined;
        const updated = await duels().findOneAndUpdate(
            { _id: duel._id, status: 'pregame' },
            { $set: { status: 'active', players, seats, setup, match, ...(rps ? { rps } : {}), updatedAt: new Date() }, $unset: { pre: '' } },
            { returnDocument: 'after' },
        );
        if (!updated) return duel;
        await start(updated);
        return updated;
    }

    /**
     * A game is over: the match's score moves, and either the match is decided (two wins, or three
     * games played) and booked on the series, or the next game's pregame is opened.
     */
    async function closeGame(duel: DuelDoc, winner: Team | null, calledOff: boolean) {
        const m = duel.match!;
        const seats = seated(duel);
        const wonSeat = winner === null ? null : seatOfTeam(duel, winner);
        if (calledOff) {
            m.over = true;
            m.winner = null;
        } else if (givenUp.delete(duel._id.toHexString()) && wonSeat !== null) {
            // The loser gave the whole match up with this game.
            m.wins[wonSeat]++;
            m.over = true;
            m.winner = wonSeat;
        } else {
            if (wonSeat !== null) m.wins[wonSeat]++;
            if (m.wins[0] >= 2 || m.wins[1] >= 2 || m.game >= 3) {
                m.over = true;
                m.winner = m.wins[0] === m.wins[1] ? null : m.wins[0] > m.wins[1] ? 0 : 1;
            }
        }
        if (m.over) {
            await duels().updateOne({ _id: duel._id }, { $set: { match: m } });
            if (duel.kind === 'rival' && m.winner !== null && m.winner !== undefined) await recordResult(duel, seats[m.winner]!, seats[1 - m.winner]!);
            return;
        }
        // The loser chooses who goes first next; after a drawn game, a coin picks who chooses.
        const chooser = (wonSeat === null ? randomBytes(1)[0]! & 1 : 1 - wonSeat) as Seat;
        const now = new Date();
        const next: DuelDoc = {
            _id: new ObjectId(),
            seriesId: duel.seriesId, setIndex: duel.setIndex, setName: duel.setName, kind: duel.kind, status: 'pregame',
            ...(duel.openKey ? { openKey: duel.openKey } : {}),
            players: seats, challengerId: duel.challengerId,
            ...(duel.guestTokenHash ? { guestTokenHash: duel.guestTokenHash, expiresAt: new Date(now.getTime() + GUEST_DUEL_MS) } : {}),
            mode: duel.mode, setup: null, engineVersion: duel.engineVersion, answers: [], winner: null, reason: null,
            match: { ...m, game: m.game + 1 },
            pre: { rps: [null, null], chooser, why: wonSeat === null ? 'coin' : 'lost', first: null, decks: [null, null] },
            createdAt: now, updatedAt: now,
        };
        settle(next);
        // (The finished game gave up its place as the open duel just before this.)
        await duels().insertOne(next);
        await duels().updateOne({ _id: duel._id }, { $set: { match: m, next: next._id } });
        duel.next = next._id;
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

    /**
     * A practice duel. Against the bot (which plays a mirror of your deck) it's a match like any
     * other, opening on its pregame. Solo, where the opponent only passes, is one game: it's set up
     * here, and a coin decides who goes first.
     */
    async function practice(id: ObjectId, me: DuelPlayer, deck: Deck, date: string | undefined, mode: DuelModeId, against: Opponent, level: BotLevel = 'normal'): Promise<Partial<DuelDoc>> {
        const bot: DuelPlayer = against === 'solo'
            ? { userId: null, name: 'Solo Practice', deckId: null, bot: true }
            : { userId: null, name: BOT_NAMES[level], deckId: null, bot: true, level };
        if (against === 'bot') return openMatch(id, [me, bot], [deck, deck]);
        const players = randomBytes(1)[0]! & 1 ? [me, bot] : [bot, me];
        const shown: Record<string, number> = {};
        const played = await playedAt(deck, date, shown);
        const setup: DuelSetup = {
            seed: newSeed(), mode, decks: [played, played], names: [players[0]!.name, players[1]!.name], bots: [players[0]!.bot, players[1]!.bot], shown, rules: DUEL_RULES,
            ...(against === 'solo' ? { solo: true } : {}),
            onDevice: true,
        };
        return { players, setup };
    }

    /** A game played on the device is over: booked as it's told, and the match moves on. */
    async function finishOnDevice(duel: DuelDoc, winner: Team | null, reason: string) {
        const done = await duels().updateOne(
            { _id: duel._id, status: 'active' },
            { $set: { status: 'finished', winner, reason, updatedAt: new Date() }, $unset: { openKey: '', callOffBy: '' } },
        );
        if (done.modifiedCount && duel.match) await closeGame(duel, winner, false);
    }

    async function start(duel: DuelDoc) {
        // (A game played on the device starts there, when its page opens it.)
        if (duel.setup?.onDevice) return;
        await sessionOf(duel);
        await persistAndBroadcast(duel);
    }

    return {
        unknownCards,
        async onDevice(duel, team) {
            const engine = await loadEngine();
            const codes = duel.setup!.decks.flatMap((d) => [...d.main, ...d.extra]);
            await unknownCards(codes);
            return { setup: duel.setup, answers: duel.answers, engine: engineDataId(duel.engineVersion), learned: engine.learnedOf(codes), team, over: duel.status !== 'active' };
        },
        record(duel, team, { from, answers, end }) {
            const id = duel._id.toHexString();
            return serial(id, async () => {
                const fresh = await duels().findOne({ _id: duel._id });
                if (!fresh || fresh.status !== 'active' || !fresh.setup?.onDevice || from > fresh.answers.length) return 'not-now' as const;
                // Answers from `from` on replace what was kept there (a move taken back on the device).
                const all = [...fresh.answers.slice(0, from), ...answers];
                await duels().updateOne({ _id: duel._id, status: 'active' }, { $set: { answers: all, updatedAt: new Date() } });
                Object.assign(duel, fresh, { answers: all });
                if (!end) return duel;
                const winner = end.winner === null ? null : ((end.winner === 'me' ? team : 1 - team) as Team);
                await finishOnDevice(duel, winner, end.reason);
                return (await duels().findOne({ _id: duel._id })) ?? duel;
            });
        },
        async create({ seriesId, userId, name, deck, deckId, against, level }) {
            const at = await setOf(seriesId);
            if (!at) return 'finished';
            if ((await unknownCards([...deck.main, ...deck.extra, ...deck.side])).length) return 'unknown-card';
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
                status: against === 'solo' ? 'active' : 'waiting',
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
                Object.assign(doc, await practice(doc._id, me, deck, at.set.tcg_date, mode, against, level));
            } else {
                doc.challengerDeck = deck;
            }
            try {
                await duels().insertOne(doc);
            } catch (error) {
                if (error instanceof MongoServerError && error.code === 11000) return 'busy';
                throw error;
            }
            if (doc.status === 'active') await start(doc);
            return doc;
        },
        async createGuest({ deck, setName, against, level }) {
            const timeline = await app.catalog.timeline();
            const setIndex = timeline.findIndex((s) => s.set_name === setName);
            const set = timeline[setIndex];
            if (!set) return 'no-set';
            if ((await unknownCards([...deck.main, ...deck.extra, ...deck.side])).length) return 'unknown-card';
            const engine = await loadEngine();
            const mode = ruleEraFor(set.tcg_date).id;
            const token = randomBytes(24).toString('base64url');
            const me: DuelPlayer = { userId: null, name: 'Guest', deckId: null, bot: false };
            const now = new Date();
            const _id = new ObjectId();
            const doc: DuelDoc = {
                _id,
                seriesId: null,
                setIndex,
                setName: set.set_name,
                kind: 'practice',
                status: 'active',
                players: [],
                setup: null,
                ...(await practice(_id, me, deck, set.tcg_date, mode, against, level)),
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
            if (doc.status === 'active') await start(doc);
            return { duel: doc, token };
        },
        async accept({ duel, userId, name, deck, deckId }) {
            if (duel.status !== 'waiting') return 'not-waiting';
            if (duel.challengerId?.equals(userId)) return 'not-yours';
            if ((await unknownCards([...deck.main, ...deck.extra, ...deck.side])).length) return 'unknown-card';
            const challengerDeck = { side: [], ...duel.challengerDeck! };
            const rival: DuelPlayer = { userId, name, deckId, bot: false };
            // The challenger takes seat 0. Rock-paper-scissors decides who chooses to go first.
            const updated = await duels().findOneAndUpdate(
                { _id: duel._id, status: 'waiting' },
                { $set: { ...openMatch(duel._id, [duel.players[0]!, rival], [challengerDeck, deck]), updatedAt: new Date() }, $unset: { challengerDeck: '' } },
                { returnDocument: 'after' },
            );
            if (!updated) return 'not-waiting';
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
        pregame(duel, seat, action) {
            return serial(duel._id.toHexString(), async () => {
                const fresh = await duels().findOne({ _id: duel._id });
                if (!fresh || fresh.status !== 'pregame' || !fresh.pre || !fresh.match) return 'not-now' as const;
                const pre = fresh.pre, m = fresh.match;
                if ('rps' in action) {
                    // One hand a round; nothing to throw once it's decided.
                    if (pre.chooser !== null || pre.rps[seat]) return 'not-now' as const;
                    pre.rps[seat] = action.rps;
                } else if ('first' in action) {
                    if (pre.chooser !== seat || pre.first !== null) return 'not-now' as const;
                    pre.first = action.first;
                } else {
                    if (pre.decks[seat]) return 'not-now' as const;
                    if (!(await sidedFrom(m.registered[seat], action.deck))) return 'bad-side' as const;
                    pre.decks[seat] = action.deck;
                }
                if (settle(fresh)) return activate(fresh);
                await duels().updateOne({ _id: fresh._id, status: 'pregame' }, { $set: { pre, updatedAt: new Date() } });
                return fresh;
            });
        },
        pregameView(duel, seat) {
            const pre = duel.pre!, m = duel.match!;
            const other = (1 - seat) as Seat, rival = duel.players[other]!;
            const side = (s: Seat) => (s === seat ? ('me' as const) : ('opp' as const));
            return {
                game: m.game,
                score: [m.wins[seat], m.wins[other]],
                rival: { name: rival.name, bot: rival.bot },
                ...(pre.chooser === null ? { rps: { mine: pre.rps[seat], ...(pre.tied ? { tied: pre.tied } : {}) } } : {
                    chooser: { side: side(pre.chooser), why: pre.why, ...(pre.hands ? { hands: { mine: pre.hands[seat], theirs: pre.hands[other] } } : {}), chosen: pre.first !== null },
                }),
                // Side decking, from game 2 on: your deck as it stands, never the rival's.
                ...(m.game > 1 ? { siding: { deck: pre.decks[seat] ?? m.current[seat], done: !!pre.decks[seat], rivalDone: !!pre.decks[other] } } : {}),
            };
        },
        matchView,
        forfeit(duel, seat) {
            return serial(duel._id.toHexString(), async () => {
                const fresh = await duels().findOne({ _id: duel._id });
                if (!fresh || fresh.status !== 'pregame' || !fresh.match) return;
                const winner = (1 - seat) as Seat;
                const match: MatchInfo = { ...fresh.match, over: true, winner };
                await duels().updateOne(
                    { _id: fresh._id, status: 'pregame' },
                    { $set: { status: 'finished', match, winner: null, reason: `${fresh.players[seat]!.name} gave the match up`, updatedAt: new Date() }, $unset: { openKey: '', pre: '' } },
                );
                if (fresh.kind === 'rival') await recordResult(fresh, fresh.players[winner]!, fresh.players[seat]!);
            });
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
            return { type: 'state', frames: [], state: stateOf(duel, session, team) };
        },
        concede(duel, team, wholeMatch) {
            return serial(duel._id.toHexString(), async () => {
                if (wholeMatch) givenUp.add(duel._id.toHexString());
                // Played on the device: nothing to play back, the surrender is booked as it stands.
                if (duel.setup?.onDevice) return finishOnDevice(duel, (1 - team) as Team, `${duel.players[team]!.name} surrendered`);
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
                if (duel.kind === 'rival') await recordResult(duel, duel.players[winner]!, duel.players[team]!);
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
                        send(socket, { type: 'state', frames: [], state: stateOf(duel, session, team), cursor: session.cursor(team) });
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
                            const state = stateOf(duel, session, s.team);
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
                send(socket, { type: 'state', frames: missed ?? session.framesOnConnect(team), state: stateOf(duel, session, team), cursor: session.cursor(team) });
            }).catch((error: unknown) => app.log.error({ err: error, duel: id }, 'duel connect failed'));
        },
    };
}
