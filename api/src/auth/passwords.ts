import { hash, verify } from '@node-rs/argon2';

/*
 * Password hashing with argon2id at the library's defaults (19 MiB, 2 passes),
 * the OWASP-recommended baseline. The hash string records its own parameters,
 * so stronger settings later still verify old hashes.
 */

export function hashPassword(password: string): Promise<string> {
    return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
        return await verify(passwordHash, password);
    } catch {
        return false; // a malformed stored hash never authenticates
    }
}

/** A real hash of a random password, verified against when no account matches. */
let dummyHash: Promise<string> | null = null;

/**
 * Spends the same time as a real password check when the account doesn't
 * exist (or has no password), so response timing doesn't reveal which emails
 * and duelist names are registered.
 */
export async function burnPasswordCheck(password: string): Promise<false> {
    dummyHash ??= hash(crypto.randomUUID());
    await verifyPassword(await dummyHash, password);
    return false;
}
