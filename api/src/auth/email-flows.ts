import type { FastifyInstance } from 'fastify';
import type { Mailer } from '../mail/mailer';
import { passwordResetEmail, verificationEmail } from '../mail/messages';
import { AUTH_PAGE_PATH } from './landing';
import { issueToken, type TokenKind } from './tokens';
import { findUserByEmail, type UserDoc } from './users';

export interface EmailFlows {
    /** Emails a "confirm your address" link to `user`, in the background. */
    queueVerification(user: UserDoc): void;
    /** Emails a reset link if `email` belongs to an account; does nothing, silently, if not. */
    queueReset(email: string): void;
}

/**
 * The emails behind verification and password reset. Everything runs in the
 * background so a request takes the same time whether or not an account exists.
 * The link lands on the web app's auth page with the token in the query string,
 * since the static export has no per-token pages; the page posts it back.
 */
export function createEmailFlows(app: FastifyInstance, mailer: Mailer, webBase: string): EmailFlows {
    const linkTo = (param: TokenKind, token: string) => {
        const url = new URL(AUTH_PAGE_PATH, webBase);
        url.searchParams.set(param, token);
        return url.toString();
    };

    return {
        queueVerification(user) {
            app.runInBackground(async () => {
                const token = await issueToken(app.db, user._id, 'verify', user.email);
                await mailer.send(verificationEmail(user.email, user.duelistName, linkTo('verify', token)));
            });
        },

        queueReset(email) {
            app.runInBackground(async () => {
                const user = await findUserByEmail(app.db, email);
                if (!user) return;
                const token = await issueToken(app.db, user._id, 'reset', user.email);
                await mailer.send(passwordResetEmail(user.email, user.duelistName, linkTo('reset', token)));
            });
        },
    };
}
