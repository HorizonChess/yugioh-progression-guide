import type { FastifyInstance } from 'fastify';
import { DuelistNameSchema } from '@ygo/shared';
import { z } from 'zod';
import { authorizationUrl, exchangeCode, pkcePair, randomUrlToken, type GoogleClient } from '../auth/google/oauth';
import {
    CLAIM_MAX_AGE_SECONDS,
    FLOW_MAX_AGE_SECONDS,
    deleteClaim,
    peekClaim,
    saveClaim,
    saveFlow,
    takeFlow,
} from '../auth/google/pending';
import { setSessionCookie } from '../auth/cookie';
import { createSession, deleteUserSessions } from '../auth/sessions';
import {
    AccountTakenError,
    findUserByEmail,
    findUserByGoogleSub,
    insertUser,
    linkGoogle,
    toPublicUser,
} from '../auth/users';

const STATE_COOKIE = 'g_state';
const CLAIM_COOKIE = 'g_claim';

export interface GoogleRouteOptions {
    client: GoogleClient;
    /** Where the browser lands afterwards, e.g. `https://app.example/menu/`. */
    landingUrl: string;
    secureCookies: boolean;
    /** Injectable for tests. */
    fetchImpl?: typeof fetch;
}

const CallbackQuerySchema = z.object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().optional(),
});

/**
 * `/api/auth/google/*`:
 *   GET  /start      sends the browser to Google
 *   GET  /callback   Google sends it back; signs in, links, or starts a claim
 *   GET  /claim      the pending Google identity, so the form can greet it
 *   POST /claim      a first-time Google user picks a duelist name
 */
export async function googleRoutes(app: FastifyInstance, options: GoogleRouteOptions): Promise<void> {
    const { client, landingUrl, secureCookies, fetchImpl } = options;
    const cookieBase = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/api/auth/google' } as const;

    const land = (reply: import('fastify').FastifyReply, outcome: string) => {
        const url = new URL(landingUrl);
        url.searchParams.set('google', outcome);
        return reply.redirect(url.toString());
    };

    app.get('/start', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (_request, reply) => {
        const state = randomUrlToken();
        const nonce = randomUrlToken();
        const { verifier, challenge } = pkcePair();
        await saveFlow(app.db, state, verifier, nonce);
        // Binds the flow to this browser: a callback without the matching cookie is someone else's.
        reply.setCookie(STATE_COOKIE, state, { ...cookieBase, maxAge: FLOW_MAX_AGE_SECONDS });
        return reply.redirect(authorizationUrl(client, { state, nonce, challenge }));
    });

    app.get('/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
        const query = CallbackQuerySchema.safeParse(request.query);
        const cookieState = request.cookies[STATE_COOKIE];
        reply.clearCookie(STATE_COOKIE, cookieBase);

        if (!query.success || query.data.error || !query.data.code || !query.data.state) {
            return land(reply, query.success && query.data.error === 'access_denied' ? 'denied' : 'failed');
        }
        if (!cookieState || cookieState !== query.data.state) return land(reply, 'failed');

        const flow = await takeFlow(app.db, query.data.state);
        if (!flow) return land(reply, 'failed');

        let identity;
        try {
            identity = await exchangeCode(client, { code: query.data.code, ...flow }, fetchImpl);
        } catch (error) {
            request.log.warn({ err: error }, 'google sign-in failed');
            return land(reply, 'failed');
        }
        // An unverified Google email proves nothing about who owns it.
        if (!identity.emailVerified) return land(reply, 'unverified');

        let user = await findUserByGoogleSub(app.db, identity.sub);
        if (!user) {
            const byEmail = await findUserByEmail(app.db, identity.email);
            if (byEmail) {
                const { passwordDropped } = await linkGoogle(app.db, byEmail, identity.sub);
                if (passwordDropped) await deleteUserSessions(app.db, byEmail._id);
                user = byEmail;
            }
        }

        if (user) {
            setSessionCookie(reply, await createSession(app.db, user._id), secureCookies);
            return land(reply, 'ok');
        }

        // First time here: they still need a duelist name, so park the identity.
        const ticket = await saveClaim(app.db, identity);
        reply.setCookie(CLAIM_COOKIE, ticket, { ...cookieBase, maxAge: CLAIM_MAX_AGE_SECONDS });
        return land(reply, 'claim');
    });

    app.get('/claim', async (request, reply) => {
        const ticket = request.cookies[CLAIM_COOKIE];
        const claim = ticket ? await peekClaim(app.db, ticket) : null;
        if (!claim) return reply.code(404).send({ error: 'No Google sign-in is waiting for a duelist name' });
        return { email: claim.email, ...(claim.name ? { name: claim.name } : {}) };
    });

    app.post('/claim', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
        const ticket = request.cookies[CLAIM_COOKIE];
        const claim = ticket ? await peekClaim(app.db, ticket) : null;
        if (!ticket || !claim) return reply.code(404).send({ error: 'No Google sign-in is waiting for a duelist name' });

        const body = z.strictObject({ duelistName: DuelistNameSchema }).safeParse(request.body);
        if (!body.success) {
            return reply.code(400).send({
                error: 'Invalid input',
                issues: body.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
            });
        }

        try {
            const user = await insertUser(app.db, {
                email: claim.email,
                emailVerified: true,
                duelistName: body.data.duelistName,
                googleSub: claim.sub,
            });
            await deleteClaim(app.db, ticket);
            reply.clearCookie(CLAIM_COOKIE, cookieBase);
            setSessionCookie(reply, await createSession(app.db, user._id), secureCookies);
            return reply.code(201).send({ user: toPublicUser(user) });
        } catch (error) {
            if (error instanceof AccountTakenError) {
                // Keep the ticket on a name clash so they can try another name.
                const what = error.field === 'duelistName' ? 'duelist name' : 'account';
                return reply.code(409).send({ error: `That ${what} is already taken`, field: error.field });
            }
            throw error;
        }
    });
}
