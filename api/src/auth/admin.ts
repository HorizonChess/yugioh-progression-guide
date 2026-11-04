import type { Db } from 'mongodb';
import { findUserByDuelistName, findUserByEmail, usersCollection, type Role, type UserDoc } from './users';

export type RoleChange =
    | { status: 'changed' | 'unchanged'; user: UserDoc; from: Role; to: Role }
    | { status: 'not-found' }
    /** Refused: admin rights should not go to an address nobody has confirmed. */
    | { status: 'unverified'; user: UserDoc };

export interface RoleChangeOptions {
    /** Allow promoting an account whose email isn't verified yet. */
    allowUnverified?: boolean;
}

/**
 * Sets a user's role, looked up by email (anything with an "@") or duelist name.
 * This is the only way to become an admin: there is deliberately no HTTP route
 * for it. Each real change is written to `auditLog`. The role is read from the
 * database on every request, so a demotion takes effect immediately.
 */
export async function setUserRole(db: Db, identifier: string, role: Role, options: RoleChangeOptions = {}): Promise<RoleChange> {
    const user = identifier.includes('@') ? await findUserByEmail(db, identifier) : await findUserByDuelistName(db, identifier);
    if (!user) return { status: 'not-found' };
    if (user.role === role) return { status: 'unchanged', user, from: role, to: role };
    if (role === 'admin' && !user.emailVerified && !options.allowUnverified) return { status: 'unverified', user };

    await usersCollection(db).updateOne({ _id: user._id }, { $set: { role } });
    await db.collection('auditLog').insertOne({
        actor: 'cli:promote-admin',
        action: 'user.role.set',
        target: { userId: user._id, duelistName: user.duelistName },
        before: { role: user.role },
        after: { role },
        at: new Date(),
    });
    return { status: 'changed', user: { ...user, role }, from: user.role, to: role };
}
