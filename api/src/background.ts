import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
    interface FastifyInstance {
        /** Runs `task` after the response is on its way. Failures are logged, never thrown. */
        runInBackground(task: () => Promise<void>): void;
        /** Resolves once every background task has finished. */
        settleBackground(): Promise<void>;
    }
}

/**
 * Work that must not delay a response, mainly outgoing email. Sending in the
 * background keeps "forgot password" the same speed whether or not the account
 * exists. Closing the app waits for anything still running.
 */
export function registerBackground(app: FastifyInstance): void {
    const pending = new Set<Promise<void>>();

    app.decorate('runInBackground', (task: () => Promise<void>) => {
        const promise: Promise<void> = task()
            .catch((err: unknown) => app.log.error({ err }, 'background task failed'))
            .finally(() => pending.delete(promise));
        pending.add(promise);
    });

    app.decorate('settleBackground', async () => {
        while (pending.size > 0) await Promise.allSettled([...pending]);
    });

    app.addHook('onClose', () => app.settleBackground());
}
