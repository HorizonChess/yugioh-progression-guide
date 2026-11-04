import { createTransport } from 'nodemailer';
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

/**
 * SMTP delivery (Gmail with an app password by default). Without credentials
 * mail is not sent: development logs that fact, and production logs an error,
 * so a missing setting is noticed without taking sign-up down with it.
 */
export function createMailer(config: Config, log: FastifyBaseLogger): Mailer {
    if (!config.SMTP_USER || !config.SMTP_PASSWORD) {
        return {
            async send(mail) {
                const level = config.NODE_ENV === 'production' ? 'error' : 'warn';
                log[level]({ to: mail.to, subject: mail.subject }, 'SMTP_USER/SMTP_PASSWORD not set: email not sent');
            },
        };
    }

    const transport = createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    });
    const from = config.MAIL_FROM ?? config.SMTP_USER;

    return {
        async send(mail) {
            await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
        },
    };
}
