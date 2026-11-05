import { ObjectId } from 'mongodb';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ClaimError, claimReward } from '../game/claims';
import { confirmReport, publicReport, rejectReport, reportDuoMatch, reportSoloMatch, spinReward } from '../game/matches';
import { hydrate } from '../game/packs';
import { findPlayer } from '../game/series';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

const ReportBodySchema = z.strictObject({ result: z.enum(['win', 'loss']) });
const ClaimBodySchema = z.strictObject({
    cardId: z.number().int().positive().optional(),
    /** Snatch Steal: the collection key (`id_setCode_rarity`) of the rival's copy to take. */
    printing: z.string().max(120).regex(/^\d+_[^.$]+$/).optional(),
});

const REPORT_ERRORS = {
    finished: 'This series has played every set',
    'not-saved': "Save this set's packs before reporting a match",
    'rival-not-saved': "Your rival hasn't saved this set's packs yet",
    conflict: 'The series changed meanwhile; reload and try again',
    'no-rival': 'This series has no rival to play right now',
    pending: 'A result is already waiting for confirmation',
} as const;

const RESOLVE_ERRORS = {
    'no-report': 'That result is no longer waiting for confirmation',
    'own-report': 'Your rival confirms the result you reported',
    conflict: REPORT_ERRORS.conflict,
} as const;

/**
 * `/api/series/:seriesId`:
 *   POST /matches                     report a result (solo: applied; duo: awaits the rival)
 *   POST /matches/:reportId/confirm   the rival confirms it
 *   POST /matches/:reportId/reject    the rival rejects it
 *   POST /rewards/:rewardId/spin      spin a won wheel
 *   POST /rewards/:rewardId/claim     resolve a reward
 *   GET  /rival-binder                the rival's cards, while you hold a Snatch Steal
 */
export async function matchRoutes(app: FastifyInstance): Promise<void> {
    const guard = { preHandler: [requireAuth, requireSeriesMember], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
    const reportId = (request: FastifyRequest) => {
        const { reportId: id } = request.params as { reportId: string };
        return /^[0-9a-f]{24}$/.test(id) ? new ObjectId(id) : null;
    };

    app.post('/matches', guard, async (request, reply) => {
        const body = ReportBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const series = request.series!;
        const user = request.user!;
        const input = { series, userId: user._id, won: body.data.result === 'win', timeline: await app.catalog.timeline() };

        if (series.mode === 'solo') {
            const outcome = await reportSoloMatch(app.mongo, app.db, input);
            if (typeof outcome === 'string') return reply.code(409).send({ error: REPORT_ERRORS[outcome] });
            return reply.code(201).send({ reward: outcome });
        }
        const report = await reportDuoMatch(app.db, input);
        if (typeof report === 'string') return reply.code(409).send({ error: REPORT_ERRORS[report] });
        const rivalId = report.winnerId.equals(user._id) ? report.loserId : report.winnerId;
        app.notify(rivalId, 'report', series._id, {
            seriesName: series.name,
            from: user.duelistName,
            setName: report.setName,
            reportId: report._id.toHexString(),
            youWon: report.winnerId.equals(rivalId),
        });
        return reply.code(202).send({ report: publicReport(report) });
    });

    app.post('/matches/:reportId/confirm', guard, async (request, reply) => {
        const id = reportId(request);
        const series = request.series!;
        const user = request.user!;
        const outcome = id ? await confirmReport(app.mongo, app.db, { series, userId: user._id, reportId: id, timeline: await app.catalog.timeline() }) : 'no-report';
        if (typeof outcome === 'string') return reply.code(409).send({ error: RESOLVE_ERRORS[outcome] });
        const { report, rewards } = outcome;
        app.notify(report.reporterId, 'report-confirmed', series._id, {
            seriesName: series.name,
            from: user.duelistName,
            setName: report.setName,
            youWon: report.winnerId.equals(report.reporterId),
        });
        return reply.code(201).send({ reward: rewards.get(user._id.toHexString()) });
    });

    app.post('/matches/:reportId/reject', guard, async (request, reply) => {
        const id = reportId(request);
        const series = request.series!;
        const user = request.user!;
        const report = id && (await rejectReport(app.db, { series, userId: user._id, reportId: id }));
        if (!report) return reply.code(409).send({ error: RESOLVE_ERRORS['no-report'] });
        app.notify(report.reporterId, 'report-rejected', series._id, { seriesName: series.name, from: user.duelistName, setName: report.setName });
        return reply.code(204).send();
    });

    app.post('/rewards/:rewardId/spin', guard, async (request, reply) => {
        const { rewardId } = request.params as { rewardId: string };
        const prize = await spinReward(app.db, { series: request.series!, userId: request.user!._id, rewardId });
        if (!prize) return reply.code(409).send({ error: 'No unspun reward with that id' });
        return { prize };
    });

    app.get('/rival-binder', guard, async (request, reply) => {
        const series = request.series!;
        const userId = request.user!._id;
        const rivalId = series.memberIds.find((id) => !id.equals(userId));
        const me = await findPlayer(app.db, series._id, userId);
        const canSnatch = me?.rewards.some((r) => r.prizeId === 'snatch-steal' && r.status === 'available');
        if (!rivalId || !canSnatch) return reply.code(409).send({ error: 'You need a Snatch Steal to look through your rival\'s binder' });
        return { collection: (await findPlayer(app.db, series._id, rivalId))?.collection ?? {} };
    });

    app.post('/rewards/:rewardId/claim', guard, async (request, reply) => {
        const body = ClaimBodySchema.safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const { rewardId } = request.params as { rewardId: string };
        const series = request.series!;
        const user = request.user!;
        try {
            const { kind, session, cardId } = await claimReward(app.mongo, {
                db: app.db,
                catalog: app.catalog,
                series,
                userId: user._id,
                rewardId,
                cardId: body.data.cardId,
                printing: body.data.printing,
            });
            // The rival hears about a stolen card and about the banlist they share.
            const rivalId = series.memberIds.find((id) => !id.equals(user._id));
            if (rivalId && cardId !== undefined && (kind === 'snatch' || kind === 'ban' || kind === 'unban')) {
                const about = { seriesName: series.name, from: user.duelistName, cardId };
                if (kind === 'snatch') app.notify(rivalId, 'snatched', series._id, about);
                else app.notify(rivalId, 'banlist', series._id, { ...about, banned: kind === 'ban' });
            }
            return reply.code(201).send({ session: session ? await hydrate(app.catalog, session) : null });
        } catch (error) {
            if (error instanceof ClaimError) return reply.code(error.status).send({ error: error.message });
            throw error;
        }
    });
}
