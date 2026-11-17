// The app's service worker: push notifications. A push from the game server shows as a notification
// (a rival's move, a challenge, an invite...); a tap on it opens the game on that notification. It
// caches nothing: the game always loads fresh.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Safari takes back permission from a site whose pushes show nothing, so there every push shows.
const mustShow = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Android/.test(navigator.userAgent);

self.addEventListener("push", (event) => {
    let message;
    try {
        message = event.data.json();
    } catch {
        return;
    }
    event.waitUntil(
        (async () => {
            // Someone looking at the game right now sees it in the bell: no need to ring the device too.
            const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            if (!mustShow && windows.some((w) => w.visibilityState === "visible" && w.focused)) return;
            await self.registration.showNotification(message.title, {
                body: message.body,
                tag: message.tag,
                renotify: true,
                icon: new URL("icons/icon-192.png", self.registration.scope).href,
                badge: new URL("icons/icon-192.png", self.registration.scope).href,
                data: { url: new URL(message.url, self.registration.scope).href, id: message.id },
            });
        })(),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const { url, id } = event.notification.data ?? {};
    event.waitUntil(
        (async () => {
            const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            const open = windows.find((w) => w.url.startsWith(self.registration.scope));
            if (open) {
                // The game is open already: it goes there itself, without a reload.
                await open.focus();
                open.postMessage({ type: "open-notification", id });
                return;
            }
            if (url) await self.clients.openWindow(url);
        })(),
    );
});
