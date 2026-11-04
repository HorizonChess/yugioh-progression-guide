import type { FastifyReply } from 'fastify';
import { SESSION_DAYS } from './sessions';

/** The session cookie: an opaque token, unreadable by page scripts. */
export const SESSION_COOKIE = 'sid';

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
    reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
    reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
}
