import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Lets the web app call the API from another origin, for local development
 * only (Next on :3000, API on :4000). In production everything is one origin
 * and `ALLOWED_ORIGINS` stays empty, so this does nothing. Only listed origins
 * are ever echoed back, and credentials are always allowed for them, because
 * the session lives in a cookie.
 */
export function cors(allowedOrigins: readonly string[]) {
    const allowed = new Set(allowedOrigins);
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const origin = request.headers.origin;
        if (!origin || !allowed.has(origin)) return;

        void reply.header('access-control-allow-origin', origin);
        void reply.header('access-control-allow-credentials', 'true');
        void reply.header('vary', 'Origin');

        if (request.method === 'OPTIONS') {
            void reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE');
            void reply.header('access-control-allow-headers', request.headers['access-control-request-headers'] ?? 'content-type');
            void reply.header('access-control-max-age', '600');
            return reply.code(204).send();
        }
    };
}
