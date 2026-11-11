// Coming back to a half-opened pack (signed in): the opener resumes on the same pack, and the
// store's pack art never shows in the middle of the screen first (user report, 2026-11-11).
//
//   npm run test-server -w @ygo/api
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/pack-resume.mjs        (PHONE=1 for a phone)

import { BASE, launchBrowser, outPath } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const NAME = `Rs${Date.now().toString(36).slice(-6)}`;
const browser = await launchBrowser();
const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));

/** Tear the pack (a swipe across its strip on phones, a click on desktop) and wait for its cards. */
async function openPack() {
    const pk = page.locator(".ps-pack");
    await pk.waitFor();
    await page.waitForTimeout(900);
    const b = await pk.boundingBox();
    if (phone) {
        await page.mouse.move(b.x + 6, b.y + b.height * 0.06);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width - 6, b.y + b.height * 0.06, { steps: 8 });
        await page.mouse.up();
    } else await pk.click();
    await page.waitForFunction(() => !document.querySelector(".ps-btn:disabled") || ![...document.querySelectorAll(".ps-btn")].some((x) => x.textContent === "Flip All" && x.disabled), null, { timeout: 15000 });
}

try {
    const signup = await context.request.post(`${API}/api/auth/signup`, {
        headers: { origin: BASE },
        data: { email: `${NAME.toLowerCase()}@example.com`, password: "heart of the cards", duelistName: NAME },
    });
    check(signup.ok(), "signed up through the API");
    const me = await (await context.request.get(`${API}/api/auth/me`)).json();
    const created = await (await context.request.post(`${API}/api/series`, {
        headers: { origin: BASE },
        data: { name: "Resume Run", mode: "solo", startSetIndex: 0, packsPerSet: 12 },
    })).json();
    const seriesId = created.id ?? created.series?.id;
    check(!!seriesId, "series created");
    const userId = me.user?.id ?? me.id;
    await page.goto(`${BASE}/favicon.ico`);
    await page.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem("ygo-guide", "off"); }, [`activeSeriesId:${userId}`, seriesId]);

    await page.goto(`${BASE}/packs/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open 12 Packs" }).click();
    await page.getByText("Pack 1 of 12").waitFor();
    await openPack();
    await page.getByRole("button", { name: "Flip All" }).click();
    await page.getByRole("button", { name: "Next Pack" }).click({ timeout: 15000 });
    await openPack();
    // Flip two cards of pack 2, then leave.
    const cards = page.locator(".ps-card");
    for (const i of [0, 1]) { await cards.nth(i).click({ force: true }); await page.waitForTimeout(1500); }
    await page.waitForTimeout(1200); // flips are sent in batches
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });

    // Come back through the app's own navigation, on a slow server (the hosted one is), watching
    // what the page shows until the stage is up.
    const SLOW = Number(process.env.SLOW ?? 3000);
    await page.route(/\/api\/|cardinfo\.php/, async (route) => { await new Promise((r) => setTimeout(r, SLOW)); await route.continue(); });
    await page.evaluate(() => { const a = document.createElement("a"); a.href = "/packs/"; document.body.append(a); });
    await page.locator('nav a[href*="campaign"], nav a[href*="timeline"]').first().click().catch(() => undefined);
    await page.waitForURL(/timeline|campaign/, { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.next?.router?.push("/packs/"));
    let storeSeen = 0, stageAt = -1;
    for (let t = 0; t < 25000; t += 100) {
        const seen = await page.evaluate(() => ({ store: !!document.querySelector(".store__pack"), pack: !!document.querySelector(".ps-pack"), stage: document.querySelectorAll(".ps-card").length }));
        if (seen.store || seen.pack) storeSeen++;
        if (seen.stage && stageAt < 0) stageAt = t;
        if (process.env.SHOTS && t % 1000 === 0) await page.screenshot({ path: outPath(`pack-resume-t${t}.png`) });
        if (stageAt >= 0 && t > stageAt + 1500) break;
        await page.waitForTimeout(100);
    }
    await page.screenshot({ path: outPath(`pack-resume-${phone ? "phone" : "desktop"}.png`) });
    check(stageAt >= 0, `the opener came back (${stageAt} ms)`);
    check(await page.getByText("Pack 2 of 12").isVisible(), "on the same pack");
    check(storeSeen === 0, `no pack art in the middle first (seen ${storeSeen} times)`);
    check(problems.length === 0, `no page errors ${problems.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
