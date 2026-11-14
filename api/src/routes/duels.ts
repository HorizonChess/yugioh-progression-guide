import { ObjectId } from 'mongodb';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BOT_LEVELS, CardIdSchema, PregameActionSchema, deckProblem, ownedCountsById } from '@ygo/shared';
import { z } from 'zod';
import { duelsCollection, type Deck, type DuelDoc, type DuelProblem, type Seat } from '../duel/hub';
import type { Team } from '../duel/session';
import { findPlayer, findSeries } from '../game/series';
import { loadUser, requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const StartBodySchema = z.strictObject({ deckId: z.string().regex(/^[\w-]{1,64}$/), against: z.enum(['bot', 'solo', 'rival']), level: z.enum(BOT_LEVELS).optional() });
/** A guest's practice duel: the deck comes from the browser (guests keep their campaign there). */
const GuestBodySchema = z.strictObject({
    deck: z.strictObject({ main: z.array(CardIdSchema).min(40).max(60), extra: z.array(CardIdSchema).max(15), side: z.array(CardIdSchema).max(15).optional() }),
    setName: z.string().min(1).max(200),
    against: z.enum(['bot', 'solo']),
    level: z.enum(BOT_LEVELS).optional(),
});
/** A guest's duel is opened with its token: a header, or (WebSocket, which can't send headers) the query. */
const guestToken = (request: FastifyRequest) => {
    const header = request.headers['x-duel-token'];
    const query = (request.query as { token?: unknown } | undefined)?.token;
    const token = typeof header === 'string' ? header : typeof query === 'string' ? query : undefined;
    return token && token.length <= 64 ? token : undefined;
};
const AcceptBodySchema = z.strictObject({ deckId: z.string().regex(/^[\w-]{1,64}$/) });

const PROBLEMS: Record<DuelProblem, [number, string]> = {
    'no-set': [404, 'No set by that name'],
    'no-deck': [404, 'No saved deck with that id'],
    'deck-illegal': [409, 'That deck is not legal right now'],
    'unknown-card': [409, 'That deck has a card the duel engine does not know yet'],
    busy: [409, 'A duel is already open: finish or leave it first'],
    finished: [409, 'This series has played every set'],
    'no-rival': [409, 'This series has no rival to duel right now'],
    'not-yours': [409, 'You challenged this duel; your rival accepts it'],
    'not-waiting': [409, 'That challenge is no longer open'],
    'not-now': [409, 'That can\'t be done right now'],
    'bad-side': [409, 'That isn\'t your registered deck with cards swapped: each part must keep its size'],
};
const fail = (reply: FastifyReply, problem: DuelProblem) => reply.code(PROBLEMS[problem][0]).send({ error: PROBLEMS[problem][1] });

/** A duel's public summary (no decks, no answers). */
const summary = (d: DuelDoc) => ({
    id: d._id.toHexString(),
    seriesId: d.seriesId?.toHexString() ?? null,
    guest: !!d.guestTokenHash,
    kind: d.kind,
    status: d.status,
    setName: d.setName,
    mode: d.mode,
    // A game of a best-of-3 match: which one, and the games won by each player (in `players` order).
    ...(d.match ? { match: { game: d.match.game, wins: d.players.map((_p, i) => d.match!.wins[d.seats ? d.seats[i]! : i]!), over: !!d.match.over } } : {}),
    ...(d.next ? { next: d.next.toHexString() } : {}),
    challenger: d.players.find((p) => !p.bot && (!d.challengerId || p.userId?.equals(d.challengerId)))?.name ?? '',
    challengerId: d.challengerId?.toHexString() ?? null,
    players: d.players.map((p) => ({ name: p.name, bot: p.bot })),
    winner: d.winner,
});

/**
 * Duels, played on the server's rules engine:
 *   POST /series/:seriesId/duels         { deckId, against: bot | solo | rival, level? }: practice now, or challenge the rival
 *   POST /duels/practice                  { deck, setName, against: bot | solo, level? }: a guest's practice duel; returns its token
 *   GET  /series/:seriesId/duels/open     the open duel you can play or answer, if any
 *   GET  /duels/:duelId                   its summary, and your state once it's on
 *   POST /duels/:duelId/accept            { deckId }: the rival takes the challenge
 *   POST /duels/:duelId/decline           the rival turns it down (or the challenger withdraws it)
 *   POST /duels/:duelId/pregame           before a game of a match: { rps } | { first } | { deck }
 *   POST /duels/:duelId/concede
 *   GET  /duels/:duelId/live              WebSocket: the duel as it happens, and your answers
 * A guest's duel is opened with its token (the `x-duel-token` header, or `?token=` on the WebSocket).
 */
export async function duelRoutes(app: FastifyInstance): Promise<void> {
    const seriesGuard = { preHandler: [requireAuth, requireSeriesMember], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

    /** The saved deck, checked against the player's cards and the banlist as they are now. */
    async function deckFor(seriesId: ObjectId, userId: ObjectId, deckId: string): Promise<Deck | DuelProblem> {
        const [series, player] = await Promise.all([findSeries(app.db, seriesId), findPlayer(app.db, seriesId, userId)]);
        const deck = player?.savedDecks.find((d) => d.id === deckId);
        if (!series || !player || !deck) return 'no-deck';
        // The side deck comes along: it's what the main deck trades cards with between a match's games.
        const side = deck.sideDeck ?? [];
        const cards = new Map((await app.catalog.cardsByIds([...deck.mainDeck, ...deck.extraDeck, ...side])).map((c) => [c.id, c]));
        if (deck.mainDeck.length < 40 || deckProblem({ ...deck, sideDeck: side }, cards, ownedCountsById(player.collection), new Set(series.bannedCardIds))) return 'deck-illegal';
        return { main: deck.mainDeck, extra: deck.extraDeck, side };
    }

    /** The duel named in the URL, if it's yours: you're in it (or the one challenged), or you hold a guest duel's token. */
    async function visibleDuel(request: FastifyRequest): Promise<DuelDoc | null> {
        const { duelId } = request.params as { duelId: string };
        const duel = /^[0-9a-f]{24}$/.test(duelId) ? await app.duels.find(new ObjectId(duelId)) : null;
        if (!duel) return null;
        if (duel.guestTokenHash) return app.duels.teamOf(duel, null, guestToken(request)) === null ? null : duel;
        const userId = request.user?._id;
        const series = userId && duel.seriesId && (await findSeries(app.db, duel.seriesId));
        if (!userId || !series || !series.memberIds.some((m) => m.equals(userId)) || (duel.kind === 'practice' && !duel.challengerId?.equals(userId))) return null;
        return duel;
    }
    async function duelFor(request: FastifyRequest, reply: FastifyReply): Promise<DuelDoc | null> {
        const duel = await visibleDuel(request);
        if (!duel) reply.code(404).send({ error: 'No such duel' });
        return duel;
    }
    const teamIn = (duel: DuelDoc, request: FastifyRequest): Team | null => app.duels.teamOf(duel, request.user?._id ?? null, guestToken(request));

    app.post('/series/:seriesId/duels', seriesGuard, async (request, reply) => {
        const body = StartBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const user = request.user!, series = request.series!;
        const deck = await deckFor(series._id, user._id, body.data.deckId);
        if (typeof deck === 'string') return fail(reply, deck);
        const duel = await app.duels.create({ seriesId: series._id, userId: user._id, name: user.duelistName, deck, deckId: body.data.deckId, against: body.data.against, level: body.data.level });
        if (typeof duel === 'string') return fail(reply, duel);
        if (duel.kind === 'rival') {
            const rivalId = series.memberIds.find((m) => !m.equals(user._id))!;
            app.notify(rivalId, 'duel-challenge', series._id, { seriesName: series.name, from: user.duelistName, setName: duel.setName, duelId: duel._id.toHexString() });
        }
        return reply.code(201).send({ duel: summary(duel) });
    });

    app.post('/duels/practice', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = GuestBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const { deck, setName, against, level } = body.data;
        // Practice only, so no collection or banlist check: just real cards, at most 3 of each.
        const ids = [...deck.main, ...deck.extra, ...(deck.side ?? [])];
        const counts = new Map<number, number>();
        for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
        const known = await app.catalog.cardsByIds([...counts.keys()]);
        if (known.length !== counts.size || [...counts.values()].some((n) => n > 3)) return reply.code(409).send({ error: 'That deck is not legal' });
        const created = await app.duels.createGuest({ deck: { ...deck, side: deck.side ?? [] }, setName, against, level });
        if (typeof created === 'string') return fail(reply, created);
        return reply.code(201).send({ duel: summary(created.duel), token: created.token });
    });

    app.get('/series/:seriesId/duels/open', { preHandler: [requireAuth, requireSeriesMember] }, async (request) => {
        const userId = request.user!._id, seriesId = request.series!._id;
        const open = await duelsCollection(app.db)
            .find({ seriesId, status: { $in: ['waiting', 'pregame', 'active'] }, $or: [{ kind: 'rival' }, { challengerId: userId }] })
            .sort({ createdAt: -1 })
            .toArray();
        return { duels: open.map(summary) };
    });

    app.get('/duels/:duelId', { preHandler: loadUser }, async (request, reply) => {
        const duel = await duelFor(request, reply);
        if (!duel) return;
        const team = teamIn(duel, request);
        // Before a game of a match: what's still to be done (a hand to throw, who goes first, side decking).
        if (team !== null && duel.status === 'pregame') return { duel: summary(duel), state: null, pregame: app.duels.pregameView(duel, team as Seat) };
        if (team === null || !(duel.status === 'active' || (duel.status === 'finished' && duel.setup))) return { duel: summary(duel), state: null, ...(team !== null && duel.match ? { match: app.duels.matchView(duel, team) } : {}) };
        try {
            return { duel: summary(duel), state: (await app.duels.stateFor(duel, team)).state };
        } catch (error) {
            // A duel the server can't rebuild: say why (so it can be reported and fixed) and let the
            // player end it, rather than a bare server error every time they look.
            request.log.error({ err: error, duel: duel._id }, 'duel could not be loaded');
            return { duel: summary(duel), state: null, broken: error instanceof Error ? error.message : String(error) };
        }
    });

    // The duel as stored (its setup and every answer), for a player in it: a duel the server can't
    // rebuild is downloaded from its error screen and replayed locally (scripts/replay-duel.ts).
    app.get('/duels/:duelId/record', { preHandler: loadUser }, async (request, reply) => {
        const duel = await duelFor(request, reply);
        if (!duel) return;
        if (teamIn(duel, request) === null || !duel.setup) return reply.code(404).send({ error: 'Not found' });
        return { id: duel._id.toHexString(), status: duel.status, setup: duel.setup, answers: duel.answers };
    });

    app.post('/duels/:duelId/accept', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = AcceptBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const duel = await duelFor(request, reply);
        if (!duel) return;
        if (!duel.seriesId) return fail(reply, 'not-waiting');
        const user = request.user!;
        const deck = await deckFor(duel.seriesId, user._id, body.data.deckId);
        if (typeof deck === 'string') return fail(reply, deck);
        const accepted = await app.duels.accept({ duel, userId: user._id, name: user.duelistName, deck, deckId: body.data.deckId });
        if (typeof accepted === 'string') return fail(reply, accepted);
        return { duel: summary(accepted) };
    });

    app.post('/duels/:duelId/decline', { preHandler: requireAuth }, async (request, reply) => {
        const duel = await duelFor(request, reply);
        if (!duel) return;
        if (!(await app.duels.decline(duel, request.user!._id))) return fail(reply, 'not-waiting');
        return reply.code(204).send();
    });

    app.post('/duels/:duelId/pregame', { preHandler: loadUser, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = PregameActionSchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const duel = await duelFor(request, reply);
        if (!duel) return;
        const seat = teamIn(duel, request);
        if (seat === null || duel.status !== 'pregame') return fail(reply, 'not-now');
        const after = await app.duels.pregame(duel, seat as Seat, body.data);
        if (typeof after === 'string') return fail(reply, after);
        // The game may have started on this very step: then the players have teams, not seats.
        return { duel: summary(after), ...(after.status === 'pregame' ? { pregame: app.duels.pregameView(after, seat as Seat) } : {}) };
    });

    app.post('/duels/:duelId/concede', { preHandler: loadUser }, async (request, reply) => {
        const duel = await duelFor(request, reply);
        if (!duel) return;
        const team = teamIn(duel, request);
        // Before a game starts, giving up gives the match up.
        if (team !== null && duel.status === 'pregame') {
            await app.duels.forfeit(duel, team as Seat);
            return reply.code(204).send();
        }
        if (team === null || duel.status !== 'active') return reply.code(409).send({ error: 'That duel is not being played' });
        // ?match=1 gives the whole match up, not only this game.
        await app.duels.concede(duel, team, !!(request.query as { match?: unknown }).match);
        return reply.code(204).send();
    });

    app.get('/duels/:duelId/live', { websocket: true, preHandler: loadUser }, async (socket, request) => {
        const duel = await visibleDuel(request);
        const team = duel && duel.status === 'active' ? teamIn(duel, request) : null;
        if (!duel || team === null) return socket.close(4404, 'No such duel');
        const after = (request.query as { after?: unknown }).after;
        app.duels.connect(duel, team, socket, typeof after === 'string' ? after : undefined);
    });
}
