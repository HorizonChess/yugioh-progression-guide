import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { pushSubscriptions } from '../game/push';
import { requireAuth } from '../middleware/requireAuth';

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
const SubscriptionSchema = z.object({
    endpoint: z.url().max(2000).startsWith('https://'),
    keys: z.strictObject({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const UnsubscribeSchema = z.strictObject({ endpoint: z.string().max(2000) });

/**
 * `/api/push`: push notifications on this device.
 *   GET    /key            the server's public key, to subscribe with
 *   POST   /subscriptions  this device wants them (a browser push subscription)
 *   DELETE /subscriptions  it doesn't anymore ({ endpoint })
 */
export async function pushRoutes(app: FastifyInstance): Promise<void> {
    app.get('/key', async () => ({ key: app.pusher.publicKey }));

    app.post('/subscriptions', { preHandler: requireAuth }, async (request, reply) => {
        const body = SubscriptionSchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid subscription' });
        const { endpoint, keys } = body.data;
        // A device belongs to whoever subscribed it last (a shared phone, a new sign-in).
        await pushSubscriptions(app.db).updateOne(
            { endpoint },
            {
                $set: { userId: request.user!._id, keys, userAgent: String(request.headers['user-agent'] ?? '').slice(0, 300) },
                $setOnInsert: { _id: new ObjectId(), endpoint, createdAt: new Date() },
            },
            { upsert: true },
        );
        return reply.code(204).send();
    });

    app.delete('/subscriptions', { preHandler: requireAuth }, async (request, reply) => {
        const body = UnsubscribeSchema.safeParse(request.body);
        if (!body.success) return reply.code(400).send({ error: 'Invalid input' });
        await pushSubscriptions(app.db).deleteOne({ endpoint: body.data.endpoint, userId: request.user!._id });
        return reply.code(204).send();
    });
}
