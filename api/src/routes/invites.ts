import { ObjectId } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { duelistNames } from '../auth/users';
import { acceptInvite, declineInvite, findOpenInvite, invitesCollection, type InviteDoc } from '../game/invites';
import { findSeries, MAX_SERIES_PER_USER } from '../game/series';
import { requireAuth } from '../middleware/requireAuth';

const OBJECT_ID = /^[0-9a-f]{24}$/;
const CODE = /^[\w-]{20,64}$/;
const AcceptBodySchema = z.union([z.strictObject({ inviteId: z.string().regex(OBJECT_ID) }), z.strictObject({ code: z.string().regex(CODE) })]);

const JOIN_ERRORS = {
    closed: 'This invitation is no longer open',
    'own-series': "That's your own series",
    'too-many': `You can have at most ${MAX_SERIES_PER_USER} series`,
} as const;

/**
 * `/api/invites`:
 *   GET  /                    invites addressed to the signed-in player
 *   GET  /link?code=          what a link invites you to (no sign-in needed)
 *   POST /accept              join by invite id or link code
 *   POST /:inviteId/decline   turn down an invite by name
 */
export async function inviteRoutes(app: FastifyInstance): Promise<void> {
    /** The series and inviter an invite shows, or null if the series is gone. */
    const describe = async (invite: InviteDoc) => {
        const series = await findSeries(app.db, invite.seriesId);
        if (!series) return null;
        const timeline = await app.catalog.timeline();
        const names = await duelistNames(app.db, [invite.fromUserId]);
        return {
            from: names.get(invite.fromUserId.toHexString()) ?? '?',
            series: { id: series._id.toHexString(), name: series.name, rules: series.rules, startSetName: timeline[series.rules.startSetIndex]?.set_name ?? null },
            expiresAt: invite.expiresAt.toISOString(),
        };
    };

    app.get('/', { preHandler: requireAuth }, async (request) => {
        const open = await invitesCollection(app.db)
            .find({ toUserId: request.user!._id, status: 'pending', expiresAt: { $gt: new Date() } })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();
        const invites = [];
        for (const invite of open) {
            const shown = await describe(invite);
            if (shown) invites.push({ id: invite._id.toHexString(), ...shown });
        }
        return { invites };
    });

    app.get('/link', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
        const { code } = request.query as { code?: string };
        const invite = code && CODE.test(code) ? await findOpenInvite(app.db, { code }) : null;
        const shown = invite && (await describe(invite));
        if (!shown) return reply.code(404).send({ error: JOIN_ERRORS.closed });
        return { invite: shown };
    });

    app.post('/accept', { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = AcceptBodySchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const user = request.user!;
        const byCode = 'code' in body.data;
        const invite = await findOpenInvite(app.db, 'code' in body.data ? { code: body.data.code } : { id: new ObjectId(body.data.inviteId) });
        // A link works for whoever has its code; an invite by name only for the duelist it names.
        const usable = invite && (byCode || invite.toUserId?.equals(user._id));
        if (!usable) return reply.code(404).send({ error: JOIN_ERRORS.closed });

        const joined = await acceptInvite(app.mongo, app.db, invite, user._id);
        if (typeof joined === 'string') return reply.code(409).send({ error: JOIN_ERRORS[joined] });
        app.notify(joined.ownerId, 'invite-accepted', joined._id, { seriesName: joined.name, from: user.duelistName });
        return reply.code(201).send({ seriesId: joined._id.toHexString() });
    });

    app.post('/:inviteId/decline', { preHandler: requireAuth }, async (request, reply) => {
        const { inviteId } = request.params as { inviteId: string };
        const user = request.user!;
        const invite = OBJECT_ID.test(inviteId) ? await declineInvite(app.db, new ObjectId(inviteId), user._id) : null;
        if (!invite) return reply.code(404).send({ error: JOIN_ERRORS.closed });
        const series = await findSeries(app.db, invite.seriesId);
        if (series) app.notify(invite.fromUserId, 'invite-declined', series._id, { seriesName: series.name, from: user.duelistName });
        return reply.code(204).send();
    });
}
