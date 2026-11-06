import type { FastifyInstance } from 'fastify';
import type { ObjectId } from 'mongodb';
import { CreateSeriesBodySchema, GuestSaveBodySchema, InviteBodySchema, resolveSetIndex, seriesRulesProblem, type CardSet } from '@ygo/shared';
import { duelistNames, findUserByDuelistName } from '../auth/users';
import type { CardCatalog } from '../cards/catalog';
import { guestSaveCardIds, importGuestSave } from '../game/guest-saves';
import { inviteByLink, inviteByName } from '../game/invites';
import { findPendingReport, publicReport } from '../game/matches';
import { packSessions } from '../game/packs';
import {
    TooManySeriesError,
    createSeries,
    deleteSeries,
    findPlayer,
    leaveSeries,
    listSeriesFor,
    MAX_SERIES_PER_USER,
    type SeriesDoc,
    type SeriesPlayerDoc,
} from '../game/series';
import { requireAuth } from '../middleware/requireAuth';
import { requireSeriesMember } from '../middleware/requireSeriesMember';

/** What any member may see about a series. */
function publicSeries(series: SeriesDoc, timeline: readonly CardSet[], names: ReadonlyMap<string, string>) {
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
            winnerId: m.winnerId?.toHexString() ?? null,
            loserId: m.loserId?.toHexString() ?? null,
            at: m.at.toISOString(),
        })),
        ownerId: series.ownerId.toHexString(),
        members: series.memberIds.map((id) => ({ id: id.toHexString(), duelistName: names.get(id.toHexString()) ?? '?' })),
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
        marks: player.marks ?? [],
    };
}

const TOO_MANY = `You can have at most ${MAX_SERIES_PER_USER} series`;
const ownName = (user: { _id: ObjectId; duelistName: string }) => new Map([[user._id.toHexString(), user.duelistName]]);

/**
 * `/api/series`:
 *   POST   /                      create a solo or duo series
 *   POST   /import                move a guest save from the browser in, as a solo series
 *   GET    /                      the signed-in player's series, most recent first
 *   GET    /:seriesId             one series, with the caller's own state in it
 *   POST   /:seriesId/invites     invite the rival by name, or get a link (duo owner only)
 *   DELETE /:seriesId             delete a solo series; leave a duo one
 */
export async function seriesRoutes(app: FastifyInstance, options: { catalog: CardCatalog }): Promise<void> {
    const { catalog } = options;
    const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

    app.post('/', { preHandler: requireAuth, ...limited }, async (request, reply) => {
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

        const user = request.user!;
        try {
            const { series, player } = await createSeries(app.mongo, app.db, {
                ownerId: user._id,
                name: body.data.name,
                mode: body.data.mode,
                rules,
                startSetName: timeline[rules.startSetIndex]!.set_name,
            });
            return reply.code(201).send({ series: publicSeries(series, timeline, ownName(user)), me: publicPlayer(player) });
        } catch (error) {
            if (error instanceof TooManySeriesError) return reply.code(409).send({ error: TOO_MANY });
            throw error;
        }
    });

    // A guest save can be large: a whole run's binder.
    app.post('/import', { preHandler: requireAuth, bodyLimit: 4 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = GuestSaveBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: "This guest save couldn't be read" });
        const user = request.user!;
        const [timeline, known] = await Promise.all([catalog.timeline(), catalog.knownIds(guestSaveCardIds(body.data))]);
        try {
            const { series, dropped, created } = await importGuestSave(app.mongo, app.db, user._id, body.data, timeline, known);
            return reply.code(created ? 201 : 200).send({ series: publicSeries(series, timeline, ownName(user)), dropped });
        } catch (error) {
            if (error instanceof TooManySeriesError) return reply.code(409).send({ error: TOO_MANY });
            throw error;
        }
    });

    app.get('/', { preHandler: requireAuth }, async (request) => {
        const [list, timeline] = await Promise.all([listSeriesFor(app.db, request.user!._id), catalog.timeline()]);
        const names = await duelistNames(app.db, list.flatMap((s) => s.memberIds));
        return { series: list.map((s) => publicSeries(s, timeline, names)) };
    });

    app.get('/:seriesId', { preHandler: [requireAuth, requireSeriesMember] }, async (request, reply) => {
        const series = request.series!;
        const [player, timeline, names] = await Promise.all([
            findPlayer(app.db, series._id, request.user!._id),
            catalog.timeline(),
            duelistNames(app.db, series.memberIds),
        ]);
        if (!player) {
            request.log.error({ seriesId: series._id }, 'series member has no player record');
            return reply.code(500).send({ error: 'This series is missing your player record' });
        }
        const shown = publicSeries(series, timeline, names);
        const [pending, saved] = await Promise.all([
            findPendingReport(app.db, series._id),
            packSessions(app.db).distinct('userId', { seriesId: series._id, setIndex: shown.currentSetIndex, source: 'set', active: true, stage: 'saved' }),
        ]);
        return {
            series: {
                ...shown,
                pendingReport: pending && publicReport(pending),
                /** Members who've saved the current set's packs; a match needs all of them. */
                openingsSaved: saved.map((id) => id.toHexString()),
            },
            me: publicPlayer(player),
        };
    });

    app.post('/:seriesId/invites', { preHandler: [requireAuth, requireSeriesMember], ...limited }, async (request, reply) => {
        const body = InviteBodySchema.safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid input' });
        const series = request.series!;
        const user = request.user!;
        if (!series.ownerId.equals(user._id)) return reply.code(403).send({ error: 'Only the series owner can invite' });
        if (series.status !== 'awaiting_rival') return reply.code(409).send({ error: 'This series already has its rival' });

        const name = body.data.duelistName;
        if (name === undefined) return reply.code(201).send({ code: await inviteByLink(app.db, series) });
        const rival = await findUserByDuelistName(app.db, name);
        if (!rival) return reply.code(404).send({ error: 'No duelist goes by that name' });
        if (rival._id.equals(user._id)) return reply.code(400).send({ error: "You can't invite yourself" });
        const invite = await inviteByName(app.db, series, rival._id);
        app.notify(rival._id, 'invite', series._id, { seriesName: series.name, from: user.duelistName, inviteId: invite._id.toHexString() });
        return reply.code(201).send({ invite: { id: invite._id.toHexString(), to: rival.duelistName } });
    });

    app.delete('/:seriesId', { preHandler: [requireAuth, requireSeriesMember] }, async (request, reply) => {
        const series = request.series!;
        const user = request.user!;
        if (series.mode === 'solo') {
            await deleteSeries(app.mongo, app.db, series._id);
            return reply.code(204).send();
        }
        if ((await leaveSeries(app.mongo, app.db, series._id, user._id)) === 'left') {
            for (const id of series.memberIds.filter((m) => !m.equals(user._id))) {
                app.notify(id, 'rival-left', series._id, { seriesName: series.name, from: user.duelistName });
            }
        }
        return reply.code(204).send();
    });
}
