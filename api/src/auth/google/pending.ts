import type { Db } from 'mongodb';
import { hashToken, newToken } from '../sessions';

/*
 * Short-lived state for a Google sign-in in progress, kept in Mongo (so it
 * survives a restart and works across instances) and expired by TTL indexes.
 * Only hashes of the browser-held tokens are stored.
 */

const FLOW_MINUTES = 10;
const CLAIM_MINUTES = 15;

interface FlowDoc {
    /** sha256(state). */
    _id: string;
    verifier: string;
    nonce: string;
    expiresAt: Date;
}

interface ClaimDoc {
    /** sha256(ticket). */
    _id: string;
    sub: string;
    email: string;
    name?: string;
    expiresAt: Date;
}

const flows = (db: Db) => db.collection<FlowDoc>('googleFlows');
const claims = (db: Db) => db.collection<ClaimDoc>('googleClaims');

const minutes = (n: number) => new Date(Date.now() + n * 60_000);

export async function ensureGoogleIndexes(db: Db): Promise<void> {
    await flows(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await claims(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export const FLOW_MAX_AGE_SECONDS = FLOW_MINUTES * 60;
export const CLAIM_MAX_AGE_SECONDS = CLAIM_MINUTES * 60;

export async function saveFlow(db: Db, state: string, verifier: string, nonce: string): Promise<void> {
    await flows(db).insertOne({ _id: hashToken(state), verifier, nonce, expiresAt: minutes(FLOW_MINUTES) });
}

/** Consumes a flow: a `state` works once, so a replayed callback finds nothing. */
export async function takeFlow(db: Db, state: string): Promise<{ verifier: string; nonce: string } | null> {
    const doc = await flows(db).findOneAndDelete({ _id: hashToken(state) });
    return doc && doc.expiresAt > new Date() ? { verifier: doc.verifier, nonce: doc.nonce } : null;
}

/** Remembers a verified Google identity that still needs a duelist name; returns the ticket for the cookie. */
export async function saveClaim(db: Db, identity: { sub: string; email: string; name?: string }): Promise<string> {
    const ticket = newToken();
    await claims(db).insertOne({ _id: hashToken(ticket), ...identity, expiresAt: minutes(CLAIM_MINUTES) });
    return ticket;
}

export async function peekClaim(db: Db, ticket: string): Promise<ClaimDoc | null> {
    const doc = await claims(db).findOne({ _id: hashToken(ticket) });
    return doc && doc.expiresAt > new Date() ? doc : null;
}

export async function deleteClaim(db: Db, ticket: string): Promise<void> {
    await claims(db).deleteOne({ _id: hashToken(ticket) });
}
