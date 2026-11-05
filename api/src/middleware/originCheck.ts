import type { FastifyReply, FastifyRequest } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence on top of SameSite=Lax: a state-changing request that carries an
 * `Origin` must come from this server's own origin or one explicitly allowed.
 * Browsers always send `Origin` on cross-site POSTs, so a missing header only
 * comes from non-browser clients, which have no ambient cookies to abuse.
 * WebSocket upgrades are GETs, but carry cookies cross-site, so they're checked too.
 */
export function originCheck(allowedOrigins: readonly string[]) {
    const allowed = new Set(allowedOrigins);
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (SAFE_METHODS.has(request.method) && request.headers.upgrade?.toLowerCase() !== 'websocket') return;
        const origin = request.headers.origin;
        if (origin === undefined) return;
        if (allowed.has(origin)) return;
        try {
            if (new URL(origin).host === request.headers.host) return;
        } catch {
            // fall through: an unparseable Origin is rejected
        }
        return reply.code(403).send({ error: 'Cross-origin request blocked' });
    };
}
