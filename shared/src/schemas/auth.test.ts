import { describe, expect, it } from 'vitest';
import { DuelistNameSchema, EmailSchema, LoginBodySchema, PasswordSchema, SignupBodySchema, duelistNameKey } from './auth';

describe('DuelistNameSchema', () => {
    it.each(['Yami', 'Seto Kaiba', 'joey_w', 'Mai.V-2', 'יאמי'])('accepts %j', (name) => {
        expect(DuelistNameSchema.safeParse(name).success).toBe(true);
    });

    it.each(['ab', 'x'.repeat(21), ' _lead', 'semi;colon', '<script>', ''])('rejects %j', (name) => {
        expect(DuelistNameSchema.safeParse(name).success).toBe(false);
    });

    it('trims surrounding spaces', () => {
        expect(DuelistNameSchema.parse('  Yami  ')).toBe('Yami');
    });
});

describe('duelistNameKey', () => {
    it('treats case and spacing variants as the same name', () => {
        expect(duelistNameKey('  Seto   KAIBA ')).toBe(duelistNameKey('seto kaiba'));
    });
});

describe('EmailSchema / PasswordSchema', () => {
    it('normalises emails', () => {
        expect(EmailSchema.parse('  Yugi@Example.COM ')).toBe('yugi@example.com');
        expect(EmailSchema.safeParse('not-an-email').success).toBe(false);
    });

    it('bounds password length', () => {
        expect(PasswordSchema.safeParse('short').success).toBe(false);
        expect(PasswordSchema.safeParse('heart of the cards').success).toBe(true);
        expect(PasswordSchema.safeParse('x'.repeat(129)).success).toBe(false);
    });
});

describe('request bodies', () => {
    it('reject unknown keys, so clients cannot smuggle fields like role', () => {
        const body = { email: 'a@b.co', password: 'password123', duelistName: 'Yami', role: 'admin' };
        expect(SignupBodySchema.safeParse(body).success).toBe(false);
        expect(LoginBodySchema.safeParse({ identifier: 'Yami', password: 'x', extra: 1 }).success).toBe(false);
    });
});
