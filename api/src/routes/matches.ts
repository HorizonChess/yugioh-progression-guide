import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reportSoloMatch, spinReward } from '../game/matches';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const ReportBodySchema = z.strictObject({ result: z.enum(['win', 'loss']) });

const REPORT_ERRORS = {
    finished: 'This series has played every set',
    'not-saved': "Save this set's packs before reporting a match",
    conflict: 'The series changed meanwhile; reload and try again',
} as const;

/** `/api/series/:seriesId`: POST /matches, POST /rewards/:rewardId/spin */
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
}
