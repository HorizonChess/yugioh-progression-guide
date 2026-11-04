import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import { DuelistNameSchema, LoginBodySchema, SignupBodySchema } from '@ygo/shared';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '../auth/cookie';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth/passwords';
import { createSession, deleteSession } from '../auth/sessions';
import { AccountTakenError, findUserByDuelistName, findUserByEmail, insertUser, toPublicUser } from '../auth/users';
import { requireAuth } from '../middleware/requireAuth';

/** Per-route limit for endpoints an attacker can hammer: password guesses, sign-up spam. */
const STRICT_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/** Parses `data` with `schema`, or answers 400 with the field problems and returns null. */
function parseOr400<T extends z.ZodType>(schema: T, data: unknown, reply: FastifyReply): z.infer<T> | null {
    const parsed = schema.safeParse(data);
    if (parsed.success) return parsed.data;
    void reply.code(400).send({
        error: 'Invalid input',
        issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return null;
}

export async function authRoutes(app: FastifyInstance, options: { secureCookies: boolean }): Promise<void> {
    const { secureCookies } = options;

    app.post('/signup', { config: STRICT_LIMIT }, async (request, reply) => {
        const body = parseOr400(SignupBodySchema, request.body, reply);
        if (!body) return;

        try {
            const user = await insertUser(app.db, {
                email: body.email,
                emailVerified: false,
                duelistName: body.duelistName,
                passwordHash: await hashPassword(body.password),
            });
            setSessionCookie(reply, await createSession(app.db, user._id), secureCookies);
            return reply.code(201).send({ user: toPublicUser(user) });
        } catch (error) {
            if (error instanceof AccountTakenError) {
                return reply.code(409).send({ error: `That ${error.field === 'duelistName' ? 'duelist name' : error.field} is already taken`, field: error.field });
            }
            throw error;
        }
    });

    app.post('/login', { config: STRICT_LIMIT }, async (request, reply) => {
        const body = parseOr400(LoginBodySchema, request.body, reply);
        if (!body) return;

        const user = body.identifier.includes('@')
            ? await findUserByEmail(app.db, body.identifier)
            : await findUserByDuelistName(app.db, body.identifier);

        // One answer and one cost for every failure, so nothing reveals which accounts exist.
        const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, body.password) : await burnPasswordCheck(body.password);
        if (!user || !ok) {
            return reply.code(401).send({ error: 'Wrong email, duelist name or password' });
        }

        setSessionCookie(reply, await createSession(app.db, user._id), secureCookies);
        return { user: toPublicUser(user) };
    });

    app.post('/logout', async (request, reply) => {
        const token = request.cookies[SESSION_COOKIE];
        if (token) await deleteSession(app.db, token);
        clearSessionCookie(reply, secureCookies);
        return reply.code(204).send();
    });

    app.get('/me', { preHandler: requireAuth }, async (request) => {
        return { user: toPublicUser(request.user!) };
    });

    /** Live check for the sign-up form. Rate-limited, since it reveals which names are taken. */
    app.get('/duelist-name-available', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
        const { name } = (request.query ?? {}) as { name?: unknown };
        const parsed = DuelistNameSchema.safeParse(name);
        if (!parsed.success) {
            return { available: false, reason: parsed.error.issues[0]?.message ?? 'Invalid name' };
        }
        const taken = await findUserByDuelistName(app.db, parsed.data);
        return taken ? { available: false, reason: 'Already taken' } : { available: true };
    });
}
