import { createTransport } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';

export interface Mail {
    to: string;
    subject: string;
    /** Plain text: every client renders it, and it keeps the link visible. */
    text: string;
}

/** Anything that can deliver a message. Tests substitute a recorder. */
export interface Mailer {
    send(mail: Mail): Promise<void>;
}

/** The part of a nodemailer transport the mailer uses. */
export interface SmtpTransport {
    sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
    verify(): Promise<unknown>;
}

export interface MailerDeps {
    /** Stands in for the SMTP connection (tests). */
    transport?: SmtpTransport;
    /** Reaches Google's token and Gmail endpoints (tests pass a fake). */
    fetch?: typeof fetch;
}

/**
 * Errors that mean the SMTP server couldn't be reached at all, as when the host blocks the
 * mail ports (Render's free plan blocks 25, 465 and 587). A refused password or a rejected
 * message is not one of these: those are real faults, and no fallback hides them.
 */
const UNREACHABLE = new Set(['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH']);
export const smtpUnreachable = (err: unknown) => {
    const e = err as { code?: string; errno?: string; command?: string } | null;
    return !!e && (UNREACHABLE.has(e.code ?? '') || UNREACHABLE.has(e.errno ?? '') || e.command === 'CONN');
};

/**
 * Gmail's own API, over HTTPS: the same Gmail account as SMTP, reached on port 443, which
 * hosts don't block. Needs a refresh token for that account with the `gmail.send` scope
 * (api/scripts/gmail-token.ts gets one). Free, and no domain of your own needed.
 */
function gmailApi(clientId: string, clientSecret: string, refreshToken: string, fetchImpl: typeof fetch) {
    let token: { value: string; until: number } | null = null;
    const accessToken = async () => {
        if (token && token.until > Date.now()) return token.value;
        const res = await fetchImpl('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
        });
        const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
        if (!res.ok || !body.access_token) throw new Error(`Google refused the Gmail API token (${res.status} ${body.error ?? ''}${body.error_description ? `: ${body.error_description}` : ''})`);
        token = { value: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
        return token.value;
    };
    return {
        async send(mail: Mail & { from: string }) {
            const raw = (await new MailComposer({ from: mail.from, to: mail.to, subject: mail.subject, text: mail.text }).compile().build()).toString('base64url');
            const res = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
                body: JSON.stringify({ raw }),
            });
            if (!res.ok) throw new Error(`Gmail API refused the message (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`);
        },
    };
}

/**
 * Outgoing mail. SMTP (Gmail with an app password) is the normal route. If this host can't
 * reach the SMTP server at all, and a Gmail API refresh token is set, mail goes through the
 * Gmail API instead, and keeps going that way while this server runs. Every message that
 * can't be sent is logged as an error ("email not sent"), with why; nothing fails quietly.
 * At startup the SMTP route is checked once, so a blocked host shows in the log straight away.
 */
export function createMailer(config: Config, log: FastifyBaseLogger, deps: MailerDeps = {}): Mailer {
    const from = config.MAIL_FROM ?? config.SMTP_USER ?? '';
    const smtp: SmtpTransport | null = deps.transport
        ?? (config.SMTP_USER && config.SMTP_PASSWORD
            ? createTransport({
                host: config.SMTP_HOST,
                port: config.SMTP_PORT,
                secure: config.SMTP_PORT === 465,
                auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
                // A blocked port shows as a timeout: give up in seconds, not nodemailer's two minutes.
                connectionTimeout: 10_000,
                greetingTimeout: 10_000,
            })
            : null);
    const clientId = config.GMAIL_CLIENT_ID ?? config.GOOGLE_CLIENT_ID;
    const clientSecret = config.GMAIL_CLIENT_SECRET ?? config.GOOGLE_CLIENT_SECRET;
    const api = config.GMAIL_REFRESH_TOKEN && clientId && clientSecret ? gmailApi(clientId, clientSecret, config.GMAIL_REFRESH_TOKEN, deps.fetch ?? fetch) : null;
    let smtpBlocked = false;

    const blocked = (err: unknown) => {
        if (smtpBlocked) return;
        smtpBlocked = true;
        if (api) log.warn({ err, host: config.SMTP_HOST, port: config.SMTP_PORT }, 'SMTP server unreachable from this host: sending email through the Gmail API instead');
        else log.error({ err, host: config.SMTP_HOST, port: config.SMTP_PORT }, 'SMTP server unreachable from this host, and no Gmail API fallback is set (GMAIL_REFRESH_TOKEN): no email can be sent');
    };

    if (!smtp && !api) {
        log[config.NODE_ENV === 'production' ? 'error' : 'warn']('No way to send email is set (SMTP_USER/SMTP_PASSWORD, or GMAIL_REFRESH_TOKEN): verification and password-reset emails will not be sent');
    } else if (smtp && config.NODE_ENV !== 'test') {
        // Find out now whether this host can reach the SMTP server, not on someone's "forgot password".
        smtp.verify().catch((err: unknown) => (smtpUnreachable(err) ? blocked(err) : log.error({ err }, 'SMTP check failed: email may not be sent')));
    }

    return {
        async send(mail) {
            const notSent = (err: unknown, via: string) => {
                log.error({ err, to: mail.to, subject: mail.subject, via }, 'email not sent');
                return err;
            };
            if (smtp && !smtpBlocked) {
                try {
                    await smtp.sendMail({ from, ...mail });
                    return;
                } catch (err) {
                    if (!smtpUnreachable(err)) throw notSent(err, 'smtp');
                    blocked(err);
                }
            }
            if (!api) throw notSent(new Error(smtp ? 'SMTP is unreachable from this host and no Gmail API fallback is set' : 'No way to send email is set'), 'none');
            try {
                await api.send({ from, ...mail });
            } catch (err) {
                throw notSent(err, 'gmail-api');
            }
        },
    };
}
