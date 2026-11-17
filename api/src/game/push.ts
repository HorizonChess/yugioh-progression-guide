import { ObjectId, type Db } from 'mongodb';
import { generateVAPIDKeys, sendNotification, WebPushError } from 'web-push';

/*
 * Push notifications: what a player is told about also reaches their phone or computer when the
 * game isn't open, through the browser's push service (web push). Each device that says yes is a
 * subscription, stored here. The server signs its messages with a key pair of its own (VAPID),
 * made once and kept in the database, so a deploy needs nothing set up.
 */

export interface PushSubscriptionDoc {
    _id: ObjectId;
    userId: ObjectId;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
    createdAt: Date;
}

/** What a push carries: what the service worker shows, and where a tap on it goes. */
export interface PushMessage {
    /** The notification's id: a tap opens the game on it. */
    id: string;
    title: string;
    body: string;
    /** One notification per tag on the device: a newer one with the same tag replaces it. */
    tag: string;
    url: string;
}

interface KeysDoc {
    _id: 'vapid';
    publicKey: string;
    privateKey: string;
}

export const pushSubscriptions = (db: Db) => db.collection<PushSubscriptionDoc>('pushSubscriptions');

export interface Pusher {
    /** The public key a browser subscribes with. */
    publicKey: string;
    send(userId: ObjectId, message: PushMessage): Promise<void>;
}

/**
 * Who sends the pushes, as the push services ask: the site's address when it's a public https one,
 * else the game's home page (an http address is refused, and Apple refuses localhost).
 */
export function pushSender(publicUrl: string | undefined): string {
    const url = publicUrl ? new URL(publicUrl) : null;
    return url && url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.origin : 'https://github.com/HorizonChess/yugioh-progression-guide';
}

/** Gone or never valid: the device unsubscribed, or the push service forgot it. */
const GONE = new Set([404, 410]);

/** Hands one message to a device's push service. Tests substitute a fake. */
export type PushDelivery = (device: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, vapid: { subject: string; publicKey: string; privateKey: string }) => Promise<unknown>;
const deliverByWebPush: PushDelivery = (device, body, vapid) => sendNotification(device, body, { vapidDetails: vapid, TTL: 24 * 3600, urgency: 'high' });

export async function createPusher(db: Db, subject: string, deliver: PushDelivery = deliverByWebPush): Promise<Pusher> {
    await pushSubscriptions(db).createIndex({ endpoint: 1 }, { unique: true });
    await pushSubscriptions(db).createIndex({ userId: 1 });
    const settings = db.collection<KeysDoc>('settings');
    let keys = await settings.findOne({ _id: 'vapid' });
    if (!keys) {
        const made = generateVAPIDKeys();
        // (Two servers starting at once: the first to write wins, the other reads it back.)
        await settings.updateOne({ _id: 'vapid' }, { $setOnInsert: made }, { upsert: true });
        keys = await settings.findOne({ _id: 'vapid' });
    }
    const vapid = { subject, publicKey: keys!.publicKey, privateKey: keys!.privateKey };

    return {
        publicKey: vapid.publicKey,
        async send(userId, message) {
            const devices = await pushSubscriptions(db).find({ userId }).toArray();
            // Each device on its own: one that fails doesn't keep the others from hearing.
            const sent = await Promise.allSettled(devices.map(async (d) => {
                try {
                    await deliver({ endpoint: d.endpoint, keys: d.keys }, JSON.stringify(message), vapid);
                } catch (error) {
                    if (error instanceof WebPushError && GONE.has(error.statusCode)) await pushSubscriptions(db).deleteOne({ _id: d._id });
                    else throw error;
                }
            }));
            const failed = sent.find((r) => r.status === 'rejected');
            if (failed) throw failed.reason;
        },
    };
}
