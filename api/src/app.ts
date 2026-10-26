import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config';
import { connectDb } from './db';
import { healthRoutes } from './routes/health';

/** Origins the web app loads from besides its own: card data, pack art, card art. */
const YGOPRODECK_API = 'https://db.ygoprodeck.com';
const PACK_ART_HOST = 'https://ms.yugipedia.com';

export interface AppOptions {
    config: Config;
    /** Defaults to on, except under test. */
    logger?: boolean;
}

/**
 * Builds the server: security headers, rate limiting, the database and the
 * `/api` routes.
 */
export async function buildApp({ config, logger }: AppOptions): Promise<FastifyInstance> {
    const app = Fastify({
        logger: logger ?? config.NODE_ENV !== 'test',
        // Render terminates TLS at its proxy; trust it so rate limits see client IPs.
        trustProxy: config.NODE_ENV === 'production',
    });

    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                // Next's static export inlines its bootstrap scripts and can't nonce them.
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:', PACK_ART_HOST, ...(config.IMAGE_HOST ? [config.IMAGE_HOST] : [])],
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

    // Rate limits cover the API only: a single page load fetches dozens of static chunks.
    await app.register(async (api) => {
        await api.register(rateLimit, { max: 300, timeWindow: '1 minute' });
        await api.register(healthRoutes);
    }, { prefix: '/api' });

    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not Found' }));

    return app;
}
