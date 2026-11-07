import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { ObjectId } from 'mongodb';
import { createEmailFlows } from './auth/email-flows';
import { AUTH_PAGE_PATH } from './auth/landing';
import { ensureGoogleIndexes } from './auth/google/pending';
import { ensureSessionIndexes } from './auth/sessions';
import { ensureTokenIndexes } from './auth/tokens';
import { ensureUserIndexes } from './auth/users';
import { registerBackground } from './background';
import { createCardCatalog, type CardCatalog } from './cards/catalog';
import type { Config } from './config';
import { connectDb } from './db';
import { createDuelHub, ensureDuelIndexes, type DuelHub } from './duel/hub';
import { ensureInviteIndexes } from './game/invites';
import { ensureMatchIndexes } from './game/matches';
import { createNotifier, ensureNotificationIndexes, type NotificationPayload, type NotificationType, type Notifier } from './game/notifications';
import { ensurePackIndexes } from './game/packs';
import { ensureSeriesIndexes } from './game/series';
import { createMailer, type Mailer } from './mail/mailer';
import { cors } from './middleware/cors';
import { originCheck } from './middleware/originCheck';
import { authRoutes } from './routes/auth';
import { deckRoutes } from './routes/decks';
import { duelRoutes } from './routes/duels';
import { googleRoutes } from './routes/google';
import { healthRoutes } from './routes/health';
import { inviteRoutes } from './routes/invites';
import { matchRoutes } from './routes/matches';
import { notificationRoutes } from './routes/notifications';
import { packRoutes } from './routes/packs';
import { seriesRoutes } from './routes/series';
import { nextSegmentRewrite } from './static-site';

/** Origins the web app loads from besides its own: card data, pack art, card art. */
const YGOPRODECK_API = 'https://db.ygoprodeck.com';
/** Yugipedia serves pack art from img.; old ms. links redirect there. */
const PACK_ART_HOSTS = ['https://img.yugipedia.com', 'https://ms.yugipedia.com'];

/**
 * Next's build files carry a content hash, so they never change; images and fonts
 * rarely do. Pages and their prefetch payloads always revalidate, so a deploy shows up.
 */
export function cacheControlFor(filePath: string): string {
    const p = filePath.replaceAll('\\', '/');
    if (p.includes('/_next/static/')) return 'public, max-age=31536000, immutable';
    if (/\.(html|txt)$/.test(p)) return 'no-cache';
    return 'public, max-age=604800';
}

export interface AppOptions {
    config: Config;
    /** Defaults to on, except under test. */
    logger?: boolean;
    /** The `fetch` used to reach Google's token endpoint. Tests substitute a fake. */
    googleFetch?: typeof fetch;
    /** Delivers verification and reset emails. Defaults to SMTP from the config. */
    mailer?: Mailer;
}

declare module 'fastify' {
    interface FastifyInstance {
        /** The synced card data, read and cached for game rules. */
        catalog: CardCatalog;
        notifier: Notifier;
        /** Duels on the rules engine: storage, live sessions and their sockets. */
        duels: DuelHub;
        /** Stores a notification and pushes it live, without holding up the response. */
        notify(userId: ObjectId, type: NotificationType, seriesId: ObjectId, payload: NotificationPayload): void;
    }
}

/**
 * Builds the server: security headers, rate limiting, the database, the `/api`
 * routes and (when `WEB_DIST` is set) the static site, all from one origin so
 * session cookies can stay same-site.
 */
export async function buildApp({ config, logger, googleFetch, mailer }: AppOptions): Promise<FastifyInstance> {
    const rewriteSegment = config.WEB_DIST ? nextSegmentRewrite(config.WEB_DIST) : null;
    const app = Fastify({
        logger: logger ?? config.NODE_ENV !== 'test',
        // Render terminates TLS at its proxy; trust it so rate limits see client IPs.
        trustProxy: config.NODE_ENV === 'production',
        rewriteUrl: (req) => {
            const url = req.url ?? '/';
            return rewriteSegment ? rewriteSegment(url) : url;
        },
    });

    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                // Next's static export inlines its bootstrap scripts and can't nonce them.
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:', ...PACK_ART_HOSTS, ...(config.IMAGE_HOST ? [config.IMAGE_HOST] : [])],
                connectSrc: ["'self'", YGOPRODECK_API],
                fontSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
            },
        },
    });

    await connectDb(app, config);
    await ensureUserIndexes(app.db);
    await ensureSessionIndexes(app.db);
    await ensureGoogleIndexes(app.db);
    await ensureTokenIndexes(app.db);
    await ensureSeriesIndexes(app.db);
    await ensurePackIndexes(app.db);
    await ensureNotificationIndexes(app.db);
    await ensureInviteIndexes(app.db);
    await ensureMatchIndexes(app.db);
    await ensureDuelIndexes(app.db);
    app.decorate('catalog', createCardCatalog(app.db));
    registerBackground(app);
    app.decorate('notifier', createNotifier(app.db));
    app.decorate('notify', (userId: ObjectId, type: NotificationType, seriesId: ObjectId, payload: NotificationPayload) =>
        app.runInBackground(() => app.notifier.send(userId, type, seriesId, payload)),
    );
    await app.register(websocket, { options: { maxPayload: 1024 } });
    app.decorate('duels', createDuelHub(app));

    const publicUrl = config.PUBLIC_URL ?? `http://localhost:${config.PORT}`;
    const emailFlows = createEmailFlows(app, mailer ?? createMailer(config, app.log), config.WEB_URL ?? publicUrl);

    // Rate limits cover the API only: a single page load fetches dozens of static chunks.
    await app.register(async (api) => {
        await api.register(cookie);
        api.decorateRequest('user', null);
        api.decorateRequest('series', null);
        api.addHook('onRequest', cors(config.ALLOWED_ORIGINS));
        api.addHook('onRequest', originCheck(config.ALLOWED_ORIGINS));
        // Scoped hooks only run for routes that exist; this gives CORS preflights one to hit.
        api.options('/*', async (_request, reply) => reply.code(204).send());
        await api.register(rateLimit, { max: 300, timeWindow: '1 minute' });
        await api.register(healthRoutes);
        const secureCookies = config.NODE_ENV === 'production';
        await api.register(authRoutes, { prefix: '/auth', secureCookies, emailFlows });
        await api.register(seriesRoutes, { prefix: '/series', catalog: app.catalog });
        await api.register(packRoutes, { prefix: '/series/:seriesId/packs' });
        await api.register(matchRoutes, { prefix: '/series/:seriesId' });
        await api.register(deckRoutes, { prefix: '/series/:seriesId' });
        await api.register(duelRoutes);
        await api.register(notificationRoutes, { prefix: '/notifications' });
        await api.register(inviteRoutes, { prefix: '/invites' });
        if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
            await api.register(googleRoutes, {
                prefix: '/auth/google',
                client: {
                    clientId: config.GOOGLE_CLIENT_ID,
                    clientSecret: config.GOOGLE_CLIENT_SECRET,
                    redirectUri: new URL('/api/auth/google/callback', publicUrl).toString(),
                },
                landingUrl: new URL(AUTH_PAGE_PATH, config.WEB_URL ?? publicUrl).toString(),
                secureCookies,
                ...(googleFetch ? { fetchImpl: googleFetch } : {}),
            });
        }
    }, { prefix: '/api' });

    if (config.WEB_DIST) {
        await app.register(fastifyStatic, {
            root: path.resolve(config.WEB_DIST),
            // The export uses trailing slashes (`/menu/` → `menu/index.html`); redirect `/menu` there.
            redirect: true,
            // Next prefetches pages with `Range: bytes=0-63`; behind Render's Cloudflare
            // the 206 gets compressed and Chrome caches it as the whole page (blank screen).
            acceptRanges: false,
            cacheControl: false,
            setHeaders: (reply, filePath) => reply.header('cache-control', cacheControlFor(filePath)),
        });
    }

    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/') || !config.WEB_DIST) {
            return reply.code(404).send({ error: 'Not Found' });
        }
        return reply.code(404).sendFile('404.html');
    });

    return app;
}
