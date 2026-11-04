import { ObjectId } from 'mongodb';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { findSeries, type SeriesDoc } from '../game/series';

declare module 'fastify' {
    interface FastifyRequest {
        /** The series named by `:seriesId`, set by `requireSeriesMember`. */
        series: SeriesDoc | null;
    }
}

/**
 * `preHandler` (after `requireAuth`) for routes under `/series/:seriesId`:
 * loads the series and lets only its members through. An unknown or malformed
 * id is 404; someone else's series is 403.
 */
export async function requireSeriesMember(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { seriesId } = request.params as { seriesId?: string };
    const user = request.user;
    if (!user) return reply.code(401).send({ error: 'Sign in required' });
    if (!seriesId || !ObjectId.isValid(seriesId) || String(new ObjectId(seriesId)) !== seriesId) {
        return reply.code(404).send({ error: 'No such series' });
    }

    const series = await findSeries(request.server.db, new ObjectId(seriesId));
    if (!series) return reply.code(404).send({ error: 'No such series' });
    if (!series.memberIds.some((id) => id.equals(user._id))) {
        return reply.code(403).send({ error: 'This series belongs to other players' });
    }
    request.series = series;
}
