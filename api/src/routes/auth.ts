import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DuelistNameSchema, EmailSchema, LoginBodySchema, PasswordSchema, SignupBodySchema } from '@ygo/shared';
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '../auth/cookie';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth/passwords';
import type { EmailFlows } from '../auth/email-flows';
import { createSession, deleteSession, deleteUserSessions } from '../auth/sessions';
import { consumeToken } from '../auth/tokens';
import {
    AccountTakenError,
    findUserByDuelistName,
    findUserByEmail,
    insertUser,
    markEmailVerified,
    setPasswordAfterReset,
    toPublicUser,
} from '../auth/users';
import { loadUser, requireAuth } from '../middleware/requireAuth';

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

const BAD_LINK = { error: 'This link is invalid or has expired' };
const TokenBodySchema = z.strictObject({ token: z.string().min(1).max(200) });
const ForgotBodySchema = z.strictObject({ email: EmailSchema });
const ResetBodySchema = z.strictObject({ token: z.string().min(1).max(200), password: PasswordSchema });

export async function authRoutes(app: FastifyInstance, options: { secureCookies: boolean; emailFlows: EmailFlows }): Promise<void> {
    const { secureCookies, emailFlows } = options;

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
            emailFlows.queueVerification(user);
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

    // Every page asks on load, so a guest gets a plain null rather than an error status.
    app.get('/me', { preHandler: loadUser }, async (request) => {
        return { user: request.user ? toPublicUser(request.user) : null };
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

    /** Re-sends the confirmation email to the signed-in user. */
    app.post('/verify/send', { preHandler: requireAuth, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
        if (!request.user!.emailVerified) emailFlows.queueVerification(request.user!);
        return reply.code(204).send();
    });

    /** Confirms an address from the emailed link. The token is the proof, so no sign-in is needed. */
    app.post('/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = parseOr400(TokenBodySchema, request.body, reply);
        if (!body) return;
        const spent = await consumeToken(app.db, body.token, 'verify');
        if (!spent || !(await markEmailVerified(app.db, spent.userId, spent.email))) return reply.code(400).send(BAD_LINK);
        return reply.code(204).send();
    });

    /** Always 204, whether or not the email has an account, so it can't be used to find out. */
    app.post('/password/forgot', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
        const body = parseOr400(ForgotBodySchema, request.body, reply);
        if (!body) return;
        emailFlows.queueReset(body.email);
        return reply.code(204).send();
    });

    /** Sets a new password from the emailed link and signs the account out everywhere. */
    app.post('/password/reset', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        // Validate the password first, so a typo doesn't burn the one-time link.
        const body = parseOr400(ResetBodySchema, request.body, reply);
        if (!body) return;
        const spent = await consumeToken(app.db, body.token, 'reset');
        if (!spent) return reply.code(400).send(BAD_LINK);
        if (!(await setPasswordAfterReset(app.db, spent.userId, spent.email, await hashPassword(body.password)))) {
            return reply.code(400).send(BAD_LINK);
        }
        await deleteUserSessions(app.db, spent.userId);
        return reply.code(204).send();
    });
}
