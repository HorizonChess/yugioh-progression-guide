import { ObjectId, type Db } from 'mongodb';
import type { WebSocket } from 'ws';
import { describeNotification, notificationTitle, type NotificationPayload, type NotificationType } from '@ygo/shared';
import type { Pusher } from './push';

/*
 * What happened to a player while they weren't looking: an invite, a rival's
 * match report, a snatched card. Stored, so it waits for their next visit,
 * pushed at once to any tab they have open, and sent as a push notification to
 * the devices they switched those on for.
 */

export type { NotificationPayload, NotificationType } from '@ygo/shared';

export interface NotificationDoc {
    _id: ObjectId;
    userId: ObjectId;
    type: NotificationType;
    seriesId: ObjectId;
    payload: NotificationPayload;
    readAt: Date | null;
    createdAt: Date;
}

const KEEP_DAYS = 60;
const PING_MS = 30_000;

export const notificationsCollection = (db: Db) => db.collection<NotificationDoc>('notifications');

export async function ensureNotificationIndexes(db: Db): Promise<void> {
    await notificationsCollection(db).createIndex({ userId: 1, createdAt: -1 });
    await notificationsCollection(db).createIndex({ createdAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 86_400 });
}

export function publicNotification(n: NotificationDoc) {
    return {
        id: n._id.toHexString(),
        type: n.type,
        seriesId: n.seriesId.toHexString(),
        payload: n.payload,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
    };
}

export interface Notifier {
    send(userId: ObjectId, type: NotificationType, seriesId: ObjectId, payload: NotificationPayload): Promise<void>;
    /** Pushes the user's new notifications down `socket` until it closes. */
    listen(userId: ObjectId, socket: WebSocket): void;
}

/**
 * The push for a notification. A tap opens the game on it (as a tap in the bell does). A rival's
 * moves in one duel share a tag, so the newest replaces the last instead of piling up.
 */
export function pushOf(doc: NotificationDoc) {
    const duelId = typeof doc.payload.duelId === 'string' ? doc.payload.duelId : null;
    return {
        id: doc._id.toHexString(),
        title: notificationTitle(doc.type),
        body: describeNotification(doc),
        tag: duelId ? `duel:${duelId}` : `${doc.type}:${doc._id.toHexString()}`,
        // Relative to the app's own address (the service worker resolves it).
        url: `?notification=${doc._id.toHexString()}`,
    };
}

export function createNotifier(db: Db, pusher?: Pusher): Notifier {
    const sockets = new Map<string, Set<WebSocket>>();
    return {
        async send(userId, type, seriesId, payload) {
            const doc: NotificationDoc = { _id: new ObjectId(), userId, type, seriesId, payload, readAt: null, createdAt: new Date() };
            await notificationsCollection(db).insertOne(doc);
            const message = JSON.stringify({ notification: publicNotification(doc) });
            for (const socket of sockets.get(userId.toHexString()) ?? []) socket.send(message);
            await pusher?.send(userId, pushOf(doc));
        },
        listen(userId, socket) {
            const key = userId.toHexString();
            const open = sockets.get(key) ?? new Set();
            sockets.set(key, open.add(socket));
            // Proxies drop quiet connections; a ping keeps this one alive.
            const ping = setInterval(() => socket.ping(), PING_MS);
            socket.on('close', () => {
                clearInterval(ping);
                open.delete(socket);
                if (!open.size && sockets.get(key) === open) sockets.delete(key);
            });
        },
    };
}
