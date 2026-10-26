import { z } from 'zod';

/**
 * Server configuration, read once from the environment at startup. Secrets
 * (the Mongo URI and, later, OAuth/SMTP credentials) only ever come from here,
 * set in the host's dashboard or a gitignored `api/.env`, never from the repo.
 */
const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_DB: z.string().min(1).default('ygo-progression'),
    /** The built web app (`web/out`). When set, the API also serves the site, from one origin. */
    WEB_DIST: z.string().min(1).optional(),
    /** Public R2 bucket serving card art; allowed as an image source by the CSP. */
    IMAGE_HOST: z.url().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

/** Parses `env`, throwing a readable error that names the bad keys (never their values). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
        const problems = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
        throw new Error(`Invalid server environment:\n  ${problems.join('\n  ')}`);
    }
    return parsed.data;
}
