import type { FastifyInstance } from 'fastify';

/** `GET /api/health`: liveness plus a database ping, for the host's health check. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async (_request, reply) => {
        try {
            await app.db.command({ ping: 1 });
            return { status: 'ok', db: 'up' };
        } catch (error) {
            app.log.error({ err: error }, 'database ping failed');
            return reply.code(503).send({ status: 'degraded', db: 'down' });
        }
    });
}
