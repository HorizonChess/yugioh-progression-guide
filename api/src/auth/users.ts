import { MongoServerError, type Db, type ObjectId } from 'mongodb';
import { duelistNameKey, type PublicUser } from '@ygo/shared';

export type Role = 'user' | 'admin';

export interface UserDoc {
    _id: ObjectId;
    /** Lowercased. Unique. */
    email: string;
    emailVerified: boolean;
    /** Absent for accounts that only sign in with Google. */
    passwordHash?: string;
    /** Google's stable account id (`sub`), once Google sign-in is linked. */
    googleSub?: string;
    duelistName: string;
    /** `duelistNameKey(duelistName)`, the unique comparison form. */
    duelistNameKey: string;
    role: Role;
    createdAt: Date;
}

export const usersCollection = (db: Db) => db.collection<UserDoc>('users');

export async function ensureUserIndexes(db: Db): Promise<void> {
    const users = usersCollection(db);
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ duelistNameKey: 1 }, { unique: true });
    await users.createIndex({ googleSub: 1 }, { unique: true, sparse: true });
}

export type NewUser = Pick<UserDoc, 'email' | 'emailVerified' | 'duelistName'> & Partial<Pick<UserDoc, 'passwordHash' | 'googleSub'>>;

/** Which unique field a new account collided on. */
export class AccountTakenError extends Error {
    constructor(readonly field: 'email' | 'duelistName' | 'google') {
        super(`${field} is already registered`);
    }
}

/** Inserts a user; unique indexes make concurrent sign-ups for one name or email safe. */
export async function insertUser(db: Db, user: NewUser): Promise<UserDoc> {
    const doc: Omit<UserDoc, '_id'> = {
        ...user,
        duelistNameKey: duelistNameKey(user.duelistName),
        role: 'user',
        createdAt: new Date(),
    };
    try {
        const { insertedId } = await usersCollection(db).insertOne(doc as UserDoc);
        return { ...doc, _id: insertedId };
    } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
            const key = Object.keys(error.keyPattern ?? {})[0];
            throw new AccountTakenError(key === 'email' ? 'email' : key === 'googleSub' ? 'google' : 'duelistName');
        }
        throw error;
    }
}

export function findUserByEmail(db: Db, email: string) {
    return usersCollection(db).findOne({ email: email.trim().toLowerCase() });
}

export function findUserByDuelistName(db: Db, name: string) {
    return usersCollection(db).findOne({ duelistNameKey: duelistNameKey(name) });
}

export function findUserByGoogleSub(db: Db, sub: string) {
    return usersCollection(db).findOne({ googleSub: sub });
}

/**
 * Attaches a Google account to an existing user. Google has verified the email,
 * so it counts as verified here too. If the email was *not* verified before, whoever
 * registered it may not own it, so their password is dropped: the Google owner
 * takes the account and the pre-registration can't be used to get back in.
 * Returns whether the password was dropped, so the caller can end old sessions.
 */
export async function linkGoogle(db: Db, user: UserDoc, sub: string): Promise<{ passwordDropped: boolean }> {
    const passwordDropped = !user.emailVerified && Boolean(user.passwordHash);
    await usersCollection(db).updateOne(
        { _id: user._id },
        { $set: { googleSub: sub, emailVerified: true }, ...(passwordDropped ? { $unset: { passwordHash: '' as const } } : {}) },
    );
    return { passwordDropped };
}

export function toPublicUser(user: UserDoc): PublicUser {
    return {
        id: user._id.toHexString(),
        email: user.email,
        emailVerified: user.emailVerified,
        duelistName: user.duelistName,
        role: user.role,
        hasPassword: Boolean(user.passwordHash),
        hasGoogle: Boolean(user.googleSub),
    };
}
