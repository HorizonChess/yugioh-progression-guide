import { ObjectId } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notificationsCollection, publicNotification } from '../game/notifications';
import { requireAuth } from '../middleware/requireAuth';

const PAGE = 30;
const ReadBodySchema = z.strictObject({ ids: z.array(z.string().regex(/^[0-9a-f]{24}$/)).max(PAGE * 4).optional() });

/**
 * `/api/notifications`:
 *   GET  /        the latest notifications and the unread count
 *   POST /read    mark some (by id) or all as read
 *   GET  /live    a WebSocket that pushes new ones as they happen
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
    const notifications = () => notificationsCollection(app.db);

    app.get('/', { preHandler: requireAuth }, async (request) => {
        const userId = request.user!._id;
        const [list, unread] = await Promise.all([
            notifications().find({ userId }).sort({ createdAt: -1 }).limit(PAGE).toArray(),
            notifications().countDocuments({ userId, readAt: null }),
        ]);
        return { notifications: list.map(publicNotification), unread };
    });

    app.post('/read', { preHandler: requireAuth }, async (request, reply) => {
        const body = ReadBodySchema.safeParse(request.body ?? {});
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        const only = body.data.ids ? { _id: { $in: body.data.ids.map((id) => new ObjectId(id)) } } : {};
        await notifications().updateMany({ userId: request.user!._id, readAt: null, ...only }, { $set: { readAt: new Date() } });
        return reply.code(204).send();
    });

    app.get('/live', { websocket: true, preHandler: requireAuth }, (socket, request) => {
        app.notifier.listen(request.user!._id, socket);
    });
}
