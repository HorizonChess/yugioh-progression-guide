// A duo series between two players in two browsers: create it and invite the
// rival by name, accept from the menu, live notifications in the bell, the
// "rival hasn't saved" gate, report -> the rival confirms from the bell ->
// rewards for both, Snatch Steal from the rival's binder, a join link opened
// signed out (sign in, then back to the invitation), and leaving.
//
//   npm run test-server -w @ygo/api            (copies card data from api/.env's database)
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/duo.mjs

import { request } from "playwright";
import { BASE, launchBrowser, outPath } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const suffix = Date.now().toString(36).slice(-5);
const PASSWORD = "heart of the cards";
const browser = await launchBrowser();
const problems = [];

/** A browser context for one player; signed up and signed in unless `signedOut`. */
async function player(name, { signedOut = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await context.newPage();
    const dialogs = [];
    page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/40[49]|Failed to load resource/.test(m.text()) && problems.push(`${name}: ${m.text().split("\n")[0]}`));
    page.on("dialog", (d) => {
        dialogs.push(d.message());
        void d.accept();
    });
    // Signing up through a separate request context leaves the browser signed out.
    const http = signedOut ? await request.newContext() : context.request;
    const res = await http.post(`${API}/api/auth/signup`, {
        headers: { origin: BASE },
        data: { email: `${name.toLowerCase()}@example.com`, password: PASSWORD, duelistName: name },
    });
    if (!res.ok()) throw new Error(`sign-up failed for ${name}: ${res.status()}`);
    const api = async (method, path, data) => {
        const r = await context.request.fetch(`${API}${path}`, { method, headers: { origin: BASE }, ...(data ? { data } : {}) });
        return r.status() === 204 ? null : r.json();
    };
    return { name, context, page, dialogs, api };
}

const bell = (p) => p.page.getByRole("button", { name: /^Notifications/ });
const unread = async (p, n) => p.page.getByRole("button", { name: `Notifications, ${n} unread` }).waitFor({ timeout: 8000 });

/** Opens and saves this set's packs without the reveal (the packs driver covers that). */
async function saveSet(p, seriesId) {
    const { session } = await p.api("POST", `/api/series/${seriesId}/packs/open`, {});
    await p.api("POST", `/api/series/${seriesId}/packs/${session.id}/save`);
}

try {
    const yugi = await player(`Yugi${suffix}`);
    const kaiba = await player(`Kaiba${suffix}`);

    // 1. Yugi creates a duo series and invites Kaiba by name.
    await yugi.page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    await yugi.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    await yugi.page.getByRole("button", { name: "+ NEW GAME" }).click();
    await yugi.page.getByPlaceholder("Enter Name...").fill("Duelist Kingdom");
    await yugi.page.getByLabel("Mode").selectOption("duo");
    await yugi.page.getByLabel(/Rival's duelist name/).fill(kaiba.name);
    await yugi.page.getByRole("button", { name: "CREATE" }).click();
    await yugi.page.getByText(`${kaiba.name} has been invited`).waitFor({ timeout: 8000 });
    const link = await yugi.page.getByLabel("Invite link").inputValue();
    check(/\/join\/\?code=[\w-]{20,}$/.test(link), "duo: created, the rival is invited by name and a link is ready to share");
    check(await yugi.page.getByText("Duo · waiting for a rival").isVisible(), "duo: the series waits for its rival");
    const [series] = (await yugi.api("GET", "/api/series")).series;
    await yugi.page.screenshot({ path: outPath("duo-1-created.png") });

    // 2. Kaiba sees the invite in the series list and accepts it; Yugi's bell rings live.
    await yugi.page.getByText("Duelist Kingdom").click();
    await yugi.page.waitForURL(/timeline/);
    await kaiba.page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    await kaiba.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    await kaiba.page.getByRole("link", { name: new RegExp(`${yugi.name} invites you`) }).click();
    await kaiba.page.getByText(`${yugi.name} challenges you`).waitFor();
    await kaiba.page.screenshot({ path: outPath("duo-2-invitation.png") });
    await kaiba.page.getByRole("button", { name: "Accept the Duel" }).click();
    await kaiba.page.waitForURL(/timeline/);
    check((await kaiba.api("GET", `/api/series/${series.id}`)).series.status === "active", "join: Kaiba is in, and the series is active");
    await unread(yugi, 1);
    check(true, "bell: Yugi hears at once that Kaiba joined");

    // 3. Reporting waits for both openings.
    await saveSet(yugi, series.id);
    await yugi.page.goto(`${BASE}/record-match/?record=1`, { waitUntil: "networkidle" });
    await yugi.page.getByRole("button", { name: /victory/i }).click();
    await yugi.page.getByRole("button", { name: "I won" }).click();
    await yugi.page.waitForTimeout(600);
    check(yugi.dialogs.some((d) => /rival hasn't saved/.test(d)), "report: refused while the rival hasn't saved their packs");
    await saveSet(kaiba, series.id);
    await yugi.page.getByRole("button", { name: /victory/i }).click();
    await yugi.page.getByRole("button", { name: "I won" }).click();
    await yugi.page.getByText(`Waiting for ${kaiba.name} to confirm`).waitFor({ timeout: 8000 });
    check(true, "report: Yugi's victory waits for Kaiba");

    // 4. Kaiba confirms from the bell: the set advances and both get their rewards.
    await unread(kaiba, 2);
    await bell(kaiba).click();
    await kaiba.page.getByRole("button", { name: new RegExp(`${yugi.name} reports that they won`) }).click();
    await kaiba.page.waitForURL(/record-match/);
    await kaiba.page.getByText(`${yugi.name} says they won`).waitFor({ timeout: 8000 });
    await kaiba.page.screenshot({ path: outPath("duo-3-confirm.png") });
    await kaiba.page.getByRole("button", { name: "Confirm" }).click();
    await kaiba.page.getByRole("button", { name: /Claim Pity Packs/i }).waitFor({ timeout: 8000 });
    const after = await kaiba.api("GET", `/api/series/${series.id}`);
    check(after.series.currentSetIndex === series.currentSetIndex + 1, "confirm: the set advanced for both");
    check(after.me.rewards.some((r) => r.prizeId === "pity-packs"), "confirm: Kaiba got pity packs");
    check((await yugi.api("GET", `/api/series/${series.id}`)).me.rewards.some((r) => r.prizeId === "wheel-spin"), "confirm: Yugi got a wheel spin");
    await unread(yugi, 2);
    await yugi.page.getByText(`Waiting for ${kaiba.name}`).waitFor({ state: "detached", timeout: 8000 });
    check(true, "confirm: Yugi's page moves on by itself");
    await bell(yugi).click();
    await yugi.page.getByRole("dialog", { name: "Notifications" }).waitFor();
    await yugi.page.mouse.click(700, 900);
    await yugi.page.getByRole("dialog", { name: "Notifications" }).waitFor({ state: "detached", timeout: 3000 });
    check(true, "bell: a click outside the list closes it");

    // 5. Snatch Steal from Kaiba's binder.
    await fetch(`${API}/__test/reward`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seriesId: series.id, duelistName: yugi.name, prizeId: "snatch-steal" }),
    });
    await yugi.page.goto(`${BASE}/rewards/`, { waitUntil: "networkidle" });
    await yugi.page.getByRole("button", { name: "Steal a Card" }).click();
    await yugi.page.getByText("Pick any card in your rival's binder").waitFor();
    await yugi.page.locator(".collection-card__name").first().waitFor({ timeout: 15000 });
    const total = async (p) => Object.values((await p.api("GET", `/api/series/${series.id}`)).me.collection).reduce((a, b) => a + b, 0);
    const [rivalBefore, mineBefore] = [await total(kaiba), await total(yugi)];
    await yugi.page.locator(".collection-card__name").first().click();
    await yugi.page.screenshot({ path: outPath("duo-4-snatch.png") });
    await yugi.page.getByRole("button", { name: "Snatch It" }).click();
    await yugi.page.getByText("Pick any card in your rival's binder").waitFor({ state: "detached" });
    check((await total(yugi)) === mineBefore + 1 && (await total(kaiba)) === rivalBefore, "snatch: Yugi gets a copy and Kaiba keeps his");
    await unread(kaiba, 1);
    check(true, "snatch: Kaiba is told");

    // 6. A link opened signed out: sign in on the title screen, then back to the invitation.
    const battleCity = (await yugi.api("POST", "/api/series", { name: "Battle City", mode: "duo", startSetIndex: 0, packsPerSet: 12 })).series;
    const { code } = await yugi.api("POST", `/api/series/${battleCity.id}/invites`, {});
    const joey = await player(`Joey${suffix}`, { signedOut: true });
    await joey.page.goto(`${BASE}/join/?code=${code}`, { waitUntil: "networkidle" });
    await joey.page.getByRole("button", { name: "Sign in or sign up to accept" }).click();
    await joey.page.getByRole("button", { name: "I already have an invitation" }).click({ timeout: 15000 });
    await joey.page.getByLabel("Email or duelist name").fill(joey.name);
    await joey.page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await joey.page.getByRole("button", { name: "Sign In", exact: true }).click();
    await joey.page.getByText(`${yugi.name} challenges you to “Battle City”`).waitFor({ timeout: 15000 });
    check(true, "link: after signing in, Joey is back at the invitation");
    await joey.page.getByRole("button", { name: "Accept the Duel" }).click();
    await joey.page.waitForURL(/timeline/);
    check((await joey.api("GET", `/api/series/${battleCity.id}`)).series.members.length === 2, "link: Joey joined Battle City");

    // 7. Kaiba leaves Duelist Kingdom; it pauses for Yugi.
    await kaiba.page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    await kaiba.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    await kaiba.page.getByText("Duelist Kingdom").hover();
    await kaiba.page.getByTitle("Leave Series").click();
    await kaiba.page.waitForTimeout(800);
    check(kaiba.dialogs.some((d) => /Leave this duo series/.test(d)), "leave: Kaiba is asked first");
    check((await yugi.api("GET", `/api/series/${series.id}`)).series.status === "paused", "leave: the series pauses for Yugi");
    await yugi.page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    await yugi.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    check(await yugi.page.getByText("Duo · paused, your rival left").isVisible(), "leave: Yugi's list says so");
    await yugi.page.screenshot({ path: outPath("duo-5-paused.png") });
} catch (error) {
    check(false, `driver stopped early: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
} finally {
    check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(" | ")}` : ""}`);
    await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
