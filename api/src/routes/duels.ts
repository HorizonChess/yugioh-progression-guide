import { ObjectId } from 'mongodb';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { deckProblem, ownedCountsById } from '@ygo/shared';
import { z } from 'zod';
import { duelsCollection, type DuelDoc, type DuelProblem } from '../duel/hub';
import { findPlayer, findSeries } from '../game/series';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const StartBodySchema = z.strictObject({ deckId: z.string().regex(/^[\w-]{1,64}$/), against: z.enum(['bot', 'rival']) });
const AcceptBodySchema = z.strictObject({ deckId: z.string().regex(/^[\w-]{1,64}$/) });

const PROBLEMS: Record<DuelProblem, [number, string]> = {
    'no-deck': [404, 'No saved deck with that id'],
    'deck-illegal': [409, 'That deck is not legal right now'],
    'unknown-card': [409, 'That deck has a card the duel engine does not know yet'],
    busy: [409, 'A duel is already open: finish or leave it first'],
    finished: [409, 'This series has played every set'],
    'no-rival': [409, 'This series has no rival to duel right now'],
    'not-yours': [409, 'You challenged this duel; your rival accepts it'],
    'not-waiting': [409, 'That challenge is no longer open'],
};
const fail = (reply: FastifyReply, problem: DuelProblem) => reply.code(PROBLEMS[problem][0]).send({ error: PROBLEMS[problem][1] });

/** A duel's public summary (no decks, no answers). */
const summary = (d: DuelDoc) => ({
    id: d._id.toHexString(),
    seriesId: d.seriesId.toHexString(),
    kind: d.kind,
    status: d.status,
    setName: d.setName,
    mode: d.mode,
    challenger: d.players.find((p) => p.userId?.equals(d.challengerId))?.name ?? '',
    challengerId: d.challengerId.toHexString(),
    players: d.players.map((p) => ({ name: p.name, bot: p.bot })),
    winner: d.winner,
});

/**
 * Duels, played on the server's rules engine:
 *   POST /series/:seriesId/duels         { deckId, against: bot | rival }: practice now, or challenge the rival
 *   GET  /series/:seriesId/duels/open     the open duel you can play or answer, if any
 *   GET  /duels/:duelId                   its summary, and your state once it's on
 *   POST /duels/:duelId/accept            { deckId }: the rival takes the challenge
 *   POST /duels/:duelId/decline           the rival turns it down (or the challenger withdraws it)
 *   POST /duels/:duelId/concede
 *   GET  /duels/:duelId/live              WebSocket: the duel as it happens, and your answers
 */
export async function duelRoutes(app: FastifyInstance): Promise<void> {
    const seriesGuard = { preHandler: [requireAuth, requireSeriesMember], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

    /** The saved deck, checked against the player's cards and the banlist as they are now. */
    async function deckFor(seriesId: ObjectId, userId: ObjectId, deckId: string): Promise<{ main: number[]; extra: number[] } | DuelProblem> {
        const [series, player] = await Promise.all([findSeries(app.db, seriesId), findPlayer(app.db, seriesId, userId)]);
        const deck = player?.savedDecks.find((d) => d.id === deckId);
        if (!series || !player || !deck) return 'no-deck';
        const cards = new Map((await app.catalog.cardsByIds([...deck.mainDeck, ...deck.extraDeck])).map((c) => [c.id, c]));
        if (deck.mainDeck.length < 40 || deckProblem({ ...deck, sideDeck: [] }, cards, ownedCountsById(player.collection), new Set(series.bannedCardIds))) return 'deck-illegal';
        return { main: deck.mainDeck, extra: deck.extraDeck };
    }

    /** The duel named in the URL, if the signed-in player is in it (or is the one challenged). */
    async function duelFor(request: FastifyRequest, reply: FastifyReply): Promise<DuelDoc | null> {
        const { duelId } = request.params as { duelId: string };
        const duel = /^[0-9a-f]{24}$/.test(duelId) ? await app.duels.find(new ObjectId(duelId)) : null;
        const userId = request.user!._id;
        const series = duel && (await findSeries(app.db, duel.seriesId));
        if (!duel || !series?.memberIds.some((m) => m.equals(userId)) || (duel.kind === 'practice' && !duel.challengerId.equals(userId))) {
            reply.code(404).send({ error: 'No such duel' });
            return null;
        }
        return duel;
    }

    app.post('/series/:seriesId/duels', seriesGuard, async (request, reply) => {
        const body = StartBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const user = request.user!, series = request.series!;
        const deck = await deckFor(series._id, user._id, body.data.deckId);
        if (typeof deck === 'string') return fail(reply, deck);
        const duel = await app.duels.create({ seriesId: series._id, userId: user._id, name: user.duelistName, deck, deckId: body.data.deckId, against: body.data.against });
        if (typeof duel === 'string') return fail(reply, duel);
        if (duel.kind === 'rival') {
            const rivalId = series.memberIds.find((m) => !m.equals(user._id))!;
            app.notify(rivalId, 'duel-challenge', series._id, { seriesName: series.name, from: user.duelistName, setName: duel.setName, duelId: duel._id.toHexString() });
        }
        return reply.code(201).send({ duel: summary(duel) });
    });

    app.get('/series/:seriesId/duels/open', { preHandler: [requireAuth, requireSeriesMember] }, async (request) => {
        const userId = request.user!._id, seriesId = request.series!._id;
        const open = await duelsCollection(app.db)
            .find({ seriesId, status: { $in: ['waiting', 'active'] }, $or: [{ kind: 'rival' }, { challengerId: userId }] })
            .sort({ createdAt: -1 })
            .toArray();
        return { duels: open.map(summary) };
    });

    app.get('/duels/:duelId', { preHandler: requireAuth }, async (request, reply) => {
        const duel = await duelFor(request, reply);
        if (!duel) return;
        const team = app.duels.teamOf(duel, request.user!._id);
        const state = duel.status === 'active' || (duel.status === 'finished' && duel.setup) ? (team === null ? null : (await app.duels.stateFor(duel, team)).state) : null;
        return { duel: summary(duel), state };
    });

    app.post('/duels/:duelId/accept', { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = AcceptBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const duel = await duelFor(request, reply);
        if (!duel) return;
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

    app.post('/duels/:duelId/concede', { preHandler: requireAuth }, async (request, reply) => {
        const duel = await duelFor(request, reply);
        if (!duel) return;
        const team = app.duels.teamOf(duel, request.user!._id);
        if (team === null || duel.status !== 'active') return reply.code(409).send({ error: 'That duel is not being played' });
        await app.duels.concede(duel, team);
        return reply.code(204).send();
    });

    app.get('/duels/:duelId/live', { websocket: true, preHandler: requireAuth }, async (socket, request) => {
        const { duelId } = request.params as { duelId: string };
        const duel = /^[0-9a-f]{24}$/.test(duelId) ? await app.duels.find(new ObjectId(duelId)) : null;
        const team = duel && duel.status === 'active' ? app.duels.teamOf(duel, request.user!._id) : null;
        if (!duel || team === null) return socket.close(4404, 'No such duel');
        app.duels.connect(duel, team, socket);
    });
}
