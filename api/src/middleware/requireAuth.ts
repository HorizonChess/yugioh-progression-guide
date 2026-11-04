import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '../auth/cookie';
import { resolveSession } from '../auth/sessions';
import type { UserDoc } from '../auth/users';

declare module 'fastify' {
    interface FastifyRequest {
        /** The signed-in user. Set by `requireAuth`, or by `loadUser` when auth is optional. */
        user: UserDoc | null;
    }
}

/** Looks up the session cookie and sets `request.user` (null when signed out). */
export async function loadUser(request: FastifyRequest): Promise<void> {
    const token = request.cookies[SESSION_COOKIE];
    request.user = token ? await resolveSession(request.server.db, token) : null;
}

/** `preHandler` for routes that need a signed-in user. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await loadUser(request);
    if (!request.user) {
        return reply.code(401).send({ error: 'Sign in required' });
    }
}

/** `preHandler` for admin-only routes (dev mode). Signed-out is 401; a non-admin is 403. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(request, reply);
    if (reply.sent) return;
    if (request.user?.role !== 'admin') {
        return reply.code(403).send({ error: 'Admin only' });
    }
}
