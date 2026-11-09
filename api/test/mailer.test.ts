import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { loadConfig } from '../src/config';
import { createMailer, type SmtpTransport } from '../src/mail/mailer';

const config = (extra: Record<string, string> = {}) =>
    loadConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://x', SMTP_USER: 'me@gmail.com', SMTP_PASSWORD: 'app pass word', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', ...extra });
const mail = { to: 'yugi@example.com', subject: 'Reset your password', text: 'https://app.example/auth?reset=t' };

const logger = () => {
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    return { log, as: log as unknown as FastifyBaseLogger };
};
const smtpWith = (fail?: () => Error): SmtpTransport & { sendMail: ReturnType<typeof vi.fn> } => ({
    sendMail: vi.fn(async () => {
        if (fail) throw fail();
    }),
    verify: vi.fn(async () => true),
});
const blockedPort = () => Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT', command: 'CONN' });

/** Google's token endpoint and Gmail's send endpoint, recording what was sent. */
const google = (sendStatus = 200) => {
    const sent: string[] = [];
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'at', expires_in: 3600 });
        if (u.includes('/messages/send')) {
            sent.push(Buffer.from((JSON.parse(String(init!.body)) as { raw: string }).raw, 'base64url').toString());
            return new Response(sendStatus === 200 ? '{}' : 'nope', { status: sendStatus });
        }
        return new Response('', { status: 404 });
    });
    return { fake: fake as unknown as typeof fetch, calls: fake, sent };
};

describe('mailer', () => {
    it('sends over SMTP when it can, and leaves the Gmail API alone', async () => {
        const smtp = smtpWith(), g = google(), { as } = logger();
        await createMailer(config({ GMAIL_REFRESH_TOKEN: 'rt' }), as, { transport: smtp, fetch: g.fake }).send(mail);
        expect(smtp.sendMail).toHaveBeenCalledOnce();
        expect(g.calls).not.toHaveBeenCalled();
    });

    it('falls back to the Gmail API when the host blocks SMTP, and stays there', async () => {
        const smtp = smtpWith(blockedPort), g = google(), { log, as } = logger();
        const mailer = createMailer(config({ GMAIL_REFRESH_TOKEN: 'rt' }), as, { transport: smtp, fetch: g.fake });
        await mailer.send(mail);
        await mailer.send(mail);
        expect(smtp.sendMail).toHaveBeenCalledOnce();
        expect(g.sent).toHaveLength(2);
        expect(g.sent[0]).toContain('To: yugi@example.com');
        expect(g.sent[0]).toContain('Subject: Reset your password');
        expect(log.warn).toHaveBeenCalledOnce();
        expect(log.error).not.toHaveBeenCalled();
    });

    it("doesn't fall back for a fault that isn't a blocked connection, and logs it", async () => {
        const smtp = smtpWith(() => Object.assign(new Error('Invalid login'), { code: 'EAUTH' })), g = google(), { log, as } = logger();
        await expect(createMailer(config({ GMAIL_REFRESH_TOKEN: 'rt' }), as, { transport: smtp, fetch: g.fake }).send(mail)).rejects.toThrow('Invalid login');
        expect(g.calls).not.toHaveBeenCalled();
        expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ to: mail.to, via: 'smtp' }), 'email not sent');
    });

    it('logs loudly when SMTP is blocked and there is no fallback', async () => {
        const { log, as } = logger();
        await expect(createMailer(config(), as, { transport: smtpWith(blockedPort) }).send(mail)).rejects.toThrow();
        expect(log.error).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('no Gmail API fallback'));
        expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ to: mail.to }), 'email not sent');
    });

    it('logs a Gmail API refusal as an email not sent', async () => {
        const g = google(403), { log, as } = logger();
        await expect(createMailer(config({ GMAIL_REFRESH_TOKEN: 'rt' }), as, { transport: smtpWith(blockedPort), fetch: g.fake }).send(mail)).rejects.toThrow('Gmail API refused');
        expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ via: 'gmail-api' }), 'email not sent');
    });
});
