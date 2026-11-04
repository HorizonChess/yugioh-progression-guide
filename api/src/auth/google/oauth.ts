import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/*
 * "Sign in with Google" via the server-side authorization-code flow with PKCE.
 * Self-contained on purpose (no Google SDK, only `fetch`), so this folder can
 * be copied into another Node app. The pieces:
 *
 *   pkcePair()           a one-time secret and its public challenge
 *   authorizationUrl()   where to send the browser
 *   exchangeCode()       trade the returned code for a verified identity
 *
 * The ID token comes straight from Google's token endpoint over TLS, which
 * Google's docs accept in place of verifying its signature; we still check the
 * issuer, audience, expiry and nonce.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export interface GoogleClient {
    clientId: string;
    clientSecret: string;
    /** Must match an authorized redirect URI of the OAuth client exactly. */
    redirectUri: string;
}

/** What Google vouches for about the person who just signed in. */
export interface GoogleIdentity {
    /** Google's stable account id; never changes, unlike the email. */
    sub: string;
    email: string;
    emailVerified: boolean;
    name?: string;
}

/** A random URL-safe string for `state`, `nonce` and the PKCE verifier. */
export function randomUrlToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
}

/** PKCE (RFC 7636): keep `verifier` server-side; send only `challenge` to Google. */
export function pkcePair(): { verifier: string; challenge: string } {
    const verifier = randomUrlToken(48);
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizationUrl(client: GoogleClient, params: { state: string; nonce: string; challenge: string }): string {
    const url = new URL(AUTH_ENDPOINT);
    url.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: client.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: params.state,
        nonce: params.nonce,
        code_challenge: params.challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
    }).toString();
    return url.toString();
}

export class GoogleAuthError extends Error {}

const TokenResponseSchema = z.object({ id_token: z.string().min(1) });

const ClaimsSchema = z.object({
    iss: z.string(),
    aud: z.string(),
    exp: z.number(),
    sub: z.string().min(1),
    nonce: z.string().optional(),
    email: z.string().min(1),
    // Google has sent this as both a boolean and the string "true".
    email_verified: z.union([z.boolean(), z.enum(['true', 'false'])]),
    name: z.string().optional(),
});

/**
 * Trades an authorization `code` (plus the PKCE `verifier`) for the signed-in
 * person's identity. Throws `GoogleAuthError` for anything that isn't a clean,
 * verified sign-in. `fetchImpl` is injectable for tests.
 */
export async function exchangeCode(
    client: GoogleClient,
    params: { code: string; verifier: string; nonce: string },
    fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
    const response = await fetchImpl(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code: params.code,
            client_id: client.clientId,
            client_secret: client.clientSecret,
            redirect_uri: client.redirectUri,
            grant_type: 'authorization_code',
            code_verifier: params.verifier,
        }),
    });
    if (!response.ok) throw new GoogleAuthError(`token endpoint answered ${response.status}`);

    const tokens = TokenResponseSchema.safeParse(await response.json());
    if (!tokens.success) throw new GoogleAuthError('token response had no id_token');

    const claims = ClaimsSchema.safeParse(decodeJwtPayload(tokens.data.id_token));
    if (!claims.success) throw new GoogleAuthError('id_token claims were malformed');
    const c = claims.data;

    if (!ISSUERS.has(c.iss)) throw new GoogleAuthError('id_token has the wrong issuer');
    if (c.aud !== client.clientId) throw new GoogleAuthError('id_token was issued for another client');
    if (c.exp * 1000 <= Date.now()) throw new GoogleAuthError('id_token has expired');
    if (c.nonce !== params.nonce) throw new GoogleAuthError('id_token nonce mismatch');

    return {
        sub: c.sub,
        email: c.email.trim().toLowerCase(),
        emailVerified: c.email_verified === true || c.email_verified === 'true',
        ...(c.name ? { name: c.name } : {}),
    };
}

function decodeJwtPayload(jwt: string): unknown {
    const payload = jwt.split('.')[1];
    if (!payload) throw new GoogleAuthError('id_token is not a JWT');
    try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        throw new GoogleAuthError('id_token payload is not JSON');
    }
}
