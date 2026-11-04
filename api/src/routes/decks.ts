import type { FastifyInstance } from 'fastify';
import { collectionKey, deckProblem, DECK_LIMITS, ownedCountsById } from '@ygo/shared';
import { z } from 'zod';
import { findPlayer, seriesPlayersCollection } from '../game/series';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const MAX_DECKS = 50;
const MAX_IMPORT = 3000;
const cardIds = (max: number) => z.array(z.number().int().positive()).max(max);

const DeckBodySchema = z.strictObject({
    name: z.string().trim().min(1).max(40),
    mainDeck: cardIds(DECK_LIMITS.main),
    extraDeck: cardIds(DECK_LIMITS.extra),
    sideDeck: cardIds(DECK_LIMITS.side),
});
// An empty replace clears the collection.
const ImportBodySchema = z.strictObject({ cardIds: cardIds(MAX_IMPORT), mode: z.enum(['add', 'replace']) });
const DECK_ID = /^[\w-]{1,64}$/;

/** `/api/series/:seriesId`: PUT|DELETE /decks/:deckId, POST /collection/import */
export async function deckRoutes(app: FastifyInstance): Promise<void> {
    const guard = { preHandler: [requireAuth, requireSeriesMember], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
    const players = () => seriesPlayersCollection(app.db);

    app.put('/decks/:deckId', guard, async (request, reply) => {
        const { deckId } = request.params as { deckId: string };
        const body = DeckBodySchema.safeParse(request.body);
        if (!DECK_ID.test(deckId) || !body.success) return reply.code(400).send({ error: 'Invalid input' });
        const series = request.series!;
        const player = (await findPlayer(app.db, series._id, request.user!._id))!;
        const exists = player.savedDecks.some((d) => d.id === deckId);
        if (!exists && player.savedDecks.length >= MAX_DECKS) return reply.code(409).send({ error: `You can save at most ${MAX_DECKS} decks` });

        const { mainDeck, extraDeck, sideDeck } = body.data;
        const cards = new Map((await app.catalog.cardsByIds([...mainDeck, ...extraDeck, ...sideDeck])).map((c) => [c.id, c]));
        const problem = deckProblem(body.data, cards, ownedCountsById(player.collection), new Set(series.bannedCardIds));
        if (problem) return reply.code(400).send({ error: problem });

        const deck = { id: deckId, ...body.data, createdAt: new Date() };
        const filter = { _id: player._id };
        if (exists) await players().updateOne({ ...filter, 'savedDecks.id': deckId }, { $set: { 'savedDecks.$': deck } });
        else await players().updateOne({ ...filter, 'savedDecks.id': { $ne: deckId } }, { $push: { savedDecks: deck } });
        return { deck: { ...deck, createdAt: deck.createdAt.toISOString() } };
    });

    app.delete('/decks/:deckId', guard, async (request, reply) => {
        const { deckId } = request.params as { deckId: string };
        await players().updateOne({ seriesId: request.series!._id, userId: request.user!._id }, { $pull: { savedDecks: { id: deckId } } });
        return reply.code(204).send();
    });

    // Solo series may import anytime; a duo player only once, and only when the series skipped early sets.
    app.post('/collection/import', guard, async (request, reply) => {
        const body = ImportBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const series = request.series!;
        const duo = series.mode !== 'solo';
        if (duo && series.rules.startSetIndex === 0) return reply.code(409).send({ error: 'This series starts at the first set' });

        const known = new Set((await app.catalog.cardsByIds(body.data.cardIds)).map((c) => c.id));
        if (body.data.cardIds.some((id) => !known.has(id))) return reply.code(400).send({ error: 'The list has unknown cards' });

        const counts: Record<string, number> = {};
        for (const id of body.data.cardIds) {
            const key = `collection.${collectionKey(id)}`;
            counts[key] = (counts[key] ?? 0) + 1;
        }
        const change =
            body.data.mode === 'add'
                ? { $inc: counts, $set: { ydkImportUsed: true } }
                : { $set: { collection: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k.slice('collection.'.length), v])), ydkImportUsed: true } };
        const result = await players().updateOne(
            { seriesId: series._id, userId: request.user!._id, ...(duo ? { ydkImportUsed: false } : {}) },
            change,
        );
        if (!result.matchedCount) return reply.code(409).send({ error: 'You already used your collection import' });
        return reply.code(204).send();
    });
}
