import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ClaimError, claimReward } from '../game/claims';
import { reportSoloMatch, spinReward } from '../game/matches';
import { hydrate } from '../game/packs';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const ReportBodySchema = z.strictObject({ result: z.enum(['win', 'loss']) });
const ClaimBodySchema = z.strictObject({ cardId: z.number().int().positive().optional() });

const REPORT_ERRORS = {
    finished: 'This series has played every set',
    'not-saved': "Save this set's packs before reporting a match",
    conflict: 'The series changed meanwhile; reload and try again',
} as const;

/** `/api/series/:seriesId`: POST /matches, POST /rewards/:rewardId/spin, POST /rewards/:rewardId/claim */
export async function matchRoutes(app: FastifyInstance): Promise<void> {
    const guard = { preHandler: [requireAuth, requireSeriesMember], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

    app.post('/matches', guard, async (request, reply) => {
        const body = ReportBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const series = request.series!;
        if (series.mode !== 'solo') return reply.code(409).send({ error: 'Duo results need the rival to confirm' });

        const outcome = await reportSoloMatch(app.mongo, app.db, {
            series,
            userId: request.user!._id,
            won: body.data.result === 'win',
            timeline: await app.catalog.timeline(),
        });
        if (typeof outcome === 'string') return reply.code(409).send({ error: REPORT_ERRORS[outcome] });
        return reply.code(201).send({ reward: outcome });
    });

    app.post('/rewards/:rewardId/spin', guard, async (request, reply) => {
        const { rewardId } = request.params as { rewardId: string };
        const prize = await spinReward(app.db, { series: request.series!, userId: request.user!._id, rewardId });
        if (!prize) return reply.code(409).send({ error: 'No unspun reward with that id' });
        return { prize };
    });

    app.post('/rewards/:rewardId/claim', guard, async (request, reply) => {
        const body = ClaimBodySchema.safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const { rewardId } = request.params as { rewardId: string };
        try {
            const session = await claimReward(app.mongo, {
                db: app.db,
                catalog: app.catalog,
                series: request.series!,
                userId: request.user!._id,
                rewardId,
                cardId: body.data.cardId,
            });
            return reply.code(201).send({ session: session ? await hydrate(app.catalog, session) : null });
        } catch (error) {
            if (error instanceof ClaimError) return reply.code(error.status).send({ error: error.message });
            throw error;
        }
    });
}
