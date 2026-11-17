import { apiRequest } from "@/lib/repo/remote";

/*
 * Push notifications on this device: a rival's move, a challenge, an invite, as a notification on
 * the phone or computer even with the game closed. The browser asks the player once; the device's
 * subscription goes to the server, which sends to it (see public/sw.js for what shows).
 */

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Where this device stands:
 * - `unsupported`: no push in this browser.
 * - `install`: an iPhone or iPad, in Safari: pushes come only to the game added to the Home Screen.
 * - `blocked`: the player said no; only the browser's site settings can undo it.
 * - `off` / `on`.
 */
export type PushStatus = "unsupported" | "install" | "blocked" | "off" | "on";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The app's service worker, registered (once) if it isn't yet. */
export async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration(`${base}/`)) ?? navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` });
}

export async function pushStatus(): Promise<PushStatus> {
    if (!pushSupported()) return isIos() && !standalone() ? "install" : "unsupported";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission !== "granted") return "off";
    const registration = await serviceWorker();
    return (await registration?.pushManager.getSubscription()) ? "on" : "off";
}

const urlBytes = (key: string) => {
    const raw = atob((key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Asks the browser (it must follow a tap) and tells the server this device wants them. */
export async function enablePush(): Promise<PushStatus> {
    if (!pushSupported()) return pushStatus();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
    const registration = await serviceWorker();
    if (!registration) return "unsupported";
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        const { key } = await apiRequest<{ key: string }>("GET", "/api/push/key");
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBytes(key) });
    }
    await apiRequest("POST", "/api/push/subscriptions", subscription.toJSON());
    return "on";
}

/** This device stops getting them (for whoever is signed in). */
export async function disablePush(): Promise<PushStatus> {
    const registration = await serviceWorker();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
        await apiRequest("DELETE", "/api/push/subscriptions", { endpoint: subscription.endpoint }).catch(() => undefined);
        await subscription.unsubscribe();
    }
    return pushStatus();
}

/**
 * A device that has them on tells the server again on each visit: they stay with whoever is signed
 * in here, and a subscription the browser renewed reaches the server.
 */
export async function refreshPush(): Promise<void> {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const registration = await serviceWorker();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await apiRequest("POST", "/api/push/subscriptions", subscription.toJSON());
}

/** Takes down a duel's notifications on this device (its "your move", once the duel is open). */
export async function clearDuelPushes(duelId: string): Promise<void> {
    const registration = await navigator.serviceWorker?.getRegistration(`${base}/`);
    for (const n of (await registration?.getNotifications({ tag: `duel:${duelId}` })) ?? []) n.close();
}
