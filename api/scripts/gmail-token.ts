// Gets the GMAIL_REFRESH_TOKEN for the email fallback: the API sends through Gmail's HTTPS API
// when the host blocks SMTP (Render's free plan does). Run it once, on your own computer, with
// the API stopped, and sign in as the Gmail account the app sends from (SMTP_USER):
//
//   npm run gmail-token -w @ygo/api
//
// It uses Google sign-in's OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in api/.env, or
// GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET) and the local sign-in callback,
// http://localhost:<PORT>/api/auth/google/callback, which must be among the client's
// "Authorized redirect URIs" in Google Cloud Console (it is if Google sign-in works locally).
// Google says the app is unverified for the gmail.send permission: that's expected for your own
// app; choose Advanced → continue. Put the printed token in Render as GMAIL_REFRESH_TOKEN.
import { createServer } from 'node:http';

const clientId = process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET) in api/.env first.');
    process.exit(2);
}
const port = Number(process.env.PORT ?? 4000);
const redirectUri = `http://localhost:${port}/api/auth/google/callback`;

const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consent.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    // A refresh token, every time (Google only hands one out on a fresh consent).
    access_type: 'offline',
    prompt: 'consent',
    ...(process.env.SMTP_USER ? { login_hint: process.env.SMTP_USER } : {}),
}).toString();

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', redirectUri);
    if (url.pathname !== '/api/auth/google/callback') return res.writeHead(404).end();
    const code = url.searchParams.get('code');
    if (!code) {
        res.writeHead(400).end(`No code: ${url.searchParams.get('error') ?? 'unknown error'}`);
        console.error(`Google sent no code: ${url.searchParams.get('error')}`);
        return server.close();
    }
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const body = (await tokenRes.json()) as { refresh_token?: string; error?: string; error_description?: string };
    if (!body.refresh_token) {
        res.writeHead(500).end('No refresh token came back: see the terminal.');
        console.error('No refresh token:', body.error, body.error_description ?? '');
    } else {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('Done: the token is in your terminal. You can close this tab.');
        console.log(`\nGMAIL_REFRESH_TOKEN=${body.refresh_token}\n`);
        console.log('Add it in the Render dashboard (Environment), and to api/.env if you want the fallback locally.');
    }
    server.close();
});

server.listen(port, () => {
    console.log(`Open this link and sign in as the Gmail account the app sends from:\n\n${consent}\n`);
});
