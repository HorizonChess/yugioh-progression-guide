import { MongoServerError, ObjectId } from 'mongodb';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { openPacksBlock, resolveSetIndex } from '@ygo/shared';
import { z } from 'zod';
import { flatIndex, hydrate, packSessions, rerollSession, rollPacks, saveSession, type PackSessionDoc } from '../game/packs';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const OpenBodySchema = z.strictObject({ setIndex: z.number().int().min(0).optional() });
const FlipsBodySchema =z.strictObject({ flipped: z.array(z.number().int().min(0)).max(3000) });

const BLOCK_MESSAGES = {
    'unknown-set': 'This series has played every set',
    'not-current-set': 'Only the current set can be opened',
    'already-opened': "You've already opened this set's packs",
} as const;

/**
 * `/api/series/:seriesId/packs`:
 *   POST /open                 roll this set's packs (once per set)
 *   GET  /active               the unsaved opening, to resume after a reload
 *   PATCH /:sessionId/flips    remember which cards are face up
 *   POST /:sessionId/save      add the cards to your collection
 *   POST /:sessionId/reroll    spend a Redoer Ticket on fresh packs
 */
export async function packRoutes(app: FastifyInstance): Promise<void> {
    const guard = { preHandler: [requireAuth, requireSeriesMember] };

    /** The caller's own session named in the URL, or null. */
    const ownSession = async (request: FastifyRequest) => {
        const { sessionId } = request.params as { sessionId: string };
        if (!ObjectId.isValid(sessionId)) return null;
        return packSessions(app.db).findOne({ _id: new ObjectId(sessionId), seriesId: request.series!._id, userId: request.user!._id });
    };

    app.post('/open', { ...guard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = OpenBodySchema.safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const series = request.series!;
        const userId = request.user!._id;
        const timeline = await app.catalog.timeline();
        const currentSetIndex = resolveSetIndex(timeline, series.currentSetName, series.currentSetIndex);
        const setIndex = body.data.setIndex ?? currentSetIndex;
        const opened = await packSessions(app.db).countDocuments({ seriesId: series._id, userId, setIndex, source: 'set', active: true });
        // Admins may open any set, still once each.
        const block = openPacksBlock({
            setIndex,
            currentSetIndex: request.user!.role === 'admin' ? setIndex : currentSetIndex,
            setCount: timeline.length,
            alreadyOpened: opened > 0,
        });
        if (block) return reply.code(409).send({ error: BLOCK_MESSAGES[block] });

        const set = timeline[setIndex]!;
        const session = {
            _id: new ObjectId(),
            seriesId: series._id,
            userId,
            setIndex,
            setName: set.set_name,
            source: 'set' as const,
            packs: rollPacks(await app.catalog.cardsInSet(set.set_name), set, series.rules.packsPerSet),
            flipped: [],
            stage: 'opening' as const,
            active: true,
            createdAt: new Date(),
        };
        try {
            await packSessions(app.db).insertOne(session);
        } catch (error) {
            // Two "open" clicks at once: the unique index lets only one through.
            if (error instanceof MongoServerError && error.code === 11000) return reply.code(409).send({ error: BLOCK_MESSAGES['already-opened'] });
            throw error;
        }
        return reply.code(201).send({ session: await hydrate(app.catalog, session) });
    });

    // ?kind=set or ?kind=reward (pity and tournament) narrows which opening to resume.
    app.get('/active', guard, async (request) => {
        const { kind } = request.query as { kind?: string };
        const source = kind === 'set' ? 'set' : kind === 'reward' ? { $in: ['pity', 'tournament'] as PackSessionDoc['source'][] } : undefined;
        const session = await packSessions(app.db).findOne(
            { seriesId: request.series!._id, userId: request.user!._id, stage: 'opening', ...(source ? { source } : {}) },
            { sort: { createdAt: -1 } },
        );
        return { session: session ? await hydrate(app.catalog, session) : null };
    });

    app.patch('/:sessionId/flips', guard, async (request, reply) => {
        const body = FlipsBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const session = await ownSession(request);
        if (!session || session.stage !== 'opening') return reply.code(404).send({ error: 'No such opening' });

        const valid = new Set(session.packs.flatMap((pack, p) => pack.map((_, c) => flatIndex(p, c))));
        if (body.data.flipped.some((i) => !valid.has(i))) return reply.code(400).send({ error: 'No such card in this opening' });
        await packSessions(app.db).updateOne({ _id: session._id }, { $addToSet: { flipped: { $each: body.data.flipped } } });
        return reply.code(204).send();
    });

    app.post('/:sessionId/save', guard, async (request, reply) => {
        const session = await ownSession(request);
        if (!session) return reply.code(404).send({ error: 'No such opening' });
        if (!(await saveSession(app.mongo, app.db, session))) return reply.code(409).send({ error: 'This opening was already saved' });
        return reply.code(204).send();
    });

    app.post('/:sessionId/reroll', { ...guard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const session = await ownSession(request);
        if (!session || session.source !== 'set') return reply.code(404).send({ error: 'No such opening' });
        const set = (await app.catalog.timeline()).find((s) => s.set_name === session.setName);
        if (!set) return reply.code(409).send({ error: 'This set is no longer available' });

        const packs = rollPacks(await app.catalog.cardsInSet(set.set_name), set, session.packs.length);
        const result = await rerollSession(app.mongo, app.db, session, packs);
        if (result === 'not-open') return reply.code(409).send({ error: 'Only an unsaved opening can be rerolled' });
        if (result === 'no-ticket') return reply.code(409).send({ error: 'You have no Redoer Ticket' });
        return reply.code(201).send({ session: await hydrate(app.catalog, result) });
    });
}
