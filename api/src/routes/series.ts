import type { FastifyInstance } from 'fastify';
import { CreateSeriesBodySchema, resolveSetIndex, seriesRulesProblem, type CardSet } from '@ygo/shared';
import type { CardCatalog } from '../cards/catalog';
import {
    TooManySeriesError,
    createSoloSeries,
    findPlayer,
    listSeriesFor,
    MAX_SERIES_PER_USER,
    type SeriesDoc,
    type SeriesPlayerDoc,
} from '../game/series';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

/** What any member may see about a series. */
function publicSeries(series: SeriesDoc, timeline: readonly CardSet[]) {
    const currentSetIndex = resolveSetIndex(timeline, series.currentSetName, series.currentSetIndex);
    return {
        id: series._id.toHexString(),
        name: series.name,
        mode: series.mode,
        status: series.status,
        rules: series.rules,
        currentSetIndex,
        currentSetName: timeline[currentSetIndex]?.set_name ?? null,
        /** True once the last set on the timeline has been played. */
        finished: currentSetIndex >= timeline.length,
        bannedCardIds: series.bannedCardIds,
        matchHistory: series.matchHistory.map((m) => ({
            setIndex: m.setIndex,
            setName: m.setName,
            winnerId: m.winnerId.toHexString(),
            at: m.at.toISOString(),
        })),
        memberIds: series.memberIds.map((id) => id.toHexString()),
        createdAt: series.createdAt.toISOString(),
        updatedAt: series.updatedAt.toISOString(),
    };
}

/** What only the player themself sees: their cards, decks and rewards. */
function publicPlayer(player: SeriesPlayerDoc) {
    return {
        collection: player.collection,
        savedDecks: player.savedDecks.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
        rewards: player.rewards,
        ydkImportUsed: player.ydkImportUsed,
    };
}

/**
 * `/api/series`:
 *   POST /             create a solo series
 *   GET  /             the signed-in player's series, most recent first
 *   GET  /:seriesId    one series, with the caller's own state in it
 */
export async function seriesRoutes(app: FastifyInstance, options: { catalog: CardCatalog }): Promise<void> {
    const { catalog } = options;

    app.post('/', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = CreateSeriesBodySchema.safeParse(request.body);
        if (!body.success) {
            return reply.code(400).send({
                error: 'Invalid input',
                issues: body.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
            });
        }
        const timeline = await catalog.timeline();
        const rules = { startSetIndex: body.data.startSetIndex, packsPerSet: body.data.packsPerSet };
        const problem = seriesRulesProblem(rules, timeline.length);
        if (problem) return reply.code(400).send({ error: problem });

        try {
            const { series, player } = await createSoloSeries(app.mongo, app.db, {
                ownerId: request.user!._id,
                name: body.data.name,
                rules,
                startSetName: timeline[rules.startSetIndex]!.set_name,
            });
            return reply.code(201).send({ series: publicSeries(series, timeline), me: publicPlayer(player) });
        } catch (error) {
            if (error instanceof TooManySeriesError) {
                return reply.code(409).send({ error: `You can have at most ${MAX_SERIES_PER_USER} series` });
            }
            throw error;
        }
    });

    app.get('/', { preHandler: requireAuth }, async (request) => {
        const [list, timeline] = await Promise.all([listSeriesFor(app.db, request.user!._id), catalog.timeline()]);
        return { series: list.map((s) => publicSeries(s, timeline)) };
    });

    app.get('/:seriesId', { preHandler: [requireAuth, requireSeriesMember] }, async (request, reply) => {
        const series = request.series!;
        const [player, timeline] = await Promise.all([findPlayer(app.db, series._id, request.user!._id), catalog.timeline()]);
        if (!player) {
            request.log.error({ seriesId: series._id }, 'series member has no player record');
            return reply.code(500).send({ error: 'This series is missing your player record' });
        }
        return { series: publicSeries(series, timeline), me: publicPlayer(player) };
    });
}
