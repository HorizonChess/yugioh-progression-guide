import { z } from 'zod';

/*
 * Account input rules, shared so the sign-up forms validate exactly as the
 * server does. The server re-validates everything; these are not trusted.
 */

/** A duelist name doubles as the username rivals invite you by. */
export const DuelistNameSchema = z
    .string()
    .trim()
    .min(3, 'At least 3 characters')
    .max(20, 'At most 20 characters')
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u, 'Letters, numbers, spaces, and _ . - only, starting with a letter or number');

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));

/** Long passphrases welcome; the upper bound only caps hashing cost. */
export const PasswordSchema = z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters');

export const SignupBodySchema = z.strictObject({
    email: EmailSchema,
    password: PasswordSchema,
    duelistName: DuelistNameSchema,
});

/** Sign in with either your email or your duelist name. */
export const LoginBodySchema = z.strictObject({
    identifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128),
});

/**
 * The comparison key for duelist names: case-insensitive, Unicode-normalised
 * and with whitespace collapsed, so "Yami" and "  yAMI " can't both exist.
 */
export function duelistNameKey(name: string): string {
    return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** What the API returns about the signed-in user. */
export interface PublicUser {
    id: string;
    email: string;
    emailVerified: boolean;
    duelistName: string;
    role: 'user' | 'admin';
    hasPassword: boolean;
    hasGoogle: boolean;
}
