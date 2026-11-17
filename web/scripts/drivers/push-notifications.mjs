// Push notifications, end to end in a real Chrome: a player turns them on from the bell, closes the
// game, and a rival's invite reaches the device as a notification; opening the game at the
// notification's address takes them where the bell would.
//
//   PW_CHANNEL=chrome API_BASE=http://localhost:4000 node scripts/drivers/push-notifications.mjs
// Needs the test API and the web app pointed at it (and a network: the push goes through Google's
// push service).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { BASE, launchBrowser } from "./_lib.mjs";
import { API, signUp } from "./_rival.mjs";

const browser = await launchBrowser();
const suffix = Date.now().toString(36).slice(-5);
const kaiba = await signUp(browser, `Kaiba${suffix}`);
// Yami on a profile of their own: Chrome has no push in a private window, and every plain
// Playwright context is one.
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "push-")), {
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    viewport: { width: 1440, height: 900 },
    // (Playwright turns background networking off, and pushes come in over it.)
    ignoreDefaultArgs: ["--disable-background-networking"],
});
await context.addInitScript(() => localStorage.setItem("ygo-guide", "off"));
await context.grantPermissions(["notifications"], { origin: BASE });
const yami = { name: `Yami${suffix}`, context };
const res = await context.request.post(`${API}/api/auth/signup`, { headers: { origin: BASE }, data: { email: `${yami.name.toLowerCase()}@example.com`, password: "heart of the cards", duelistName: yami.name } });
if (!res.ok()) throw new Error(`sign-up failed: ${res.status()}`);

const page = await context.newPage();
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`  [page ${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => console.log(`  [page error] ${e.message}`));
await page.goto(`${BASE}/collection/`);
await page.getByRole("button", { name: /^Notifications/ }).click();
await page.getByRole("button", { name: "Turn on" }).click();
await page.getByRole("button", { name: "Turn off" }).waitFor({ timeout: 40_000 }).catch(async (e) => {
    console.log("bell foot:", await page.locator('[aria-label="Notifications"][role="dialog"]').innerText().catch(() => "?"));
    console.log("permission:", await page.evaluate(() => Notification.permission), "sw:", await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration("/"))?.active));
    throw e;
});
console.log("bell: turned on");

// The game closed; the service worker stays.
await page.close();
const [sw] = context.serviceWorkers();
await sw.evaluate(() => self.addEventListener("push", (e) => (self.__pushes = [...(self.__pushes ?? []), e.data?.text()])));
const seriesId = (await kaiba.api("POST", "/api/series", { name: "Pushed", mode: "duo", startSetIndex: 0, packsPerSet: 12 })).series.id;
await kaiba.api("POST", `/api/series/${seriesId}/invites`, { duelistName: yami.name });

// Looked at from the service worker itself: a page in front would see it in the bell instead.
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent("serviceworker")];
let shown = [];
for (let i = 0; i < 40 && !shown.length; i++) {
    await new Promise((r) => setTimeout(r, 500));
    shown = await worker.evaluate(async () => (await self.registration.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })));
}
console.log("on the device:", JSON.stringify(shown));
if (process.env.PUSH_DEBUG) {
    console.log("pushes the worker got:", await worker.evaluate(() => self.__pushes ?? []));
    console.log("notifications:", JSON.stringify(await (await context.request.get(`${API}/api/notifications`, { headers: { origin: BASE } })).json()));
}
if (!shown.length) throw new Error("no notification reached the device");

const again = await context.newPage();
// A tap opens the game at the notification's address.
await again.goto(shown[0].url);
await again.waitForURL(/\/join\/\?invite=/, { timeout: 20_000 });
console.log("tap lands on:", new URL(again.url()).pathname);
await context.close();
await browser.close();
