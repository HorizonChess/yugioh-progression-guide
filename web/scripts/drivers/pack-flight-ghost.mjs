// The campaign's pack never haunts another page. Tapping a pack on the campaign still flies a
// copy of it onto the pack screen, where the real pack takes over (no copy left). A copy still in
// the air when another page opens (Play / Record, then the duel) goes at once, and so does a
// leftover found when the tab comes back into view. Desktop and phone. Needs the dev server.
//
//   node scripts/drivers/pack-flight-ghost.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const browser = await launchBrowser();
const results = [];
const check = (what, ok, detail = "") => results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
// A copy of the pack: on <body>, fixed, above every page (found by its look, marked or not).
const copies = (page) => page.evaluate(() => [...document.body.children].filter((el) => el.matches("[data-pack-flight]") || (el.style.position === "fixed" && el.style.zIndex === "400" && el.querySelector("img"))).length);

for (const [size, options] of Object.entries(SIZES)) {
    const page = await browser.newPage(options);
    const save = makeSave({ currentSetIndex: 0 });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    const pack = page.locator("#set-0 .timeline-node__art, #set-0.road-stop").first();

    // 1. The flight as it was: tap the pack, a copy flies, the pack screen's own pack takes over.
    await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
    await pack.click();
    await page.waitForTimeout(150);
    const flying = await copies(page);
    await page.waitForURL(/\/packs/);
    await page.waitForTimeout(3000);
    const left = await copies(page);
    const shown = await page.locator(".store img").first().evaluate((img) => getComputedStyle(img.closest("[style*=visibility]") ?? img).visibility).catch(() => "none");
    check(`${size}: tapping the pack flies a copy`, flying === 1, `${flying} copies`);
    check(`${size}: it lands, and no copy is left on the pack screen`, left === 0 && shown !== "hidden", `${left} copies, pack ${shown}`);
    await page.screenshot({ path: outPath(`pack-flight-landed-${size}.png`) });

    // 2. A copy still flying when another page opens (Play / Record): gone at once.
    await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
    // (The pack's own navigation is held back, so the copy is launched but no pack screen takes it.)
    await page.evaluate(() => {
        const link = document.querySelector("#set-0 a.timeline-node__art, a#set-0");
        link?.addEventListener("click", (e) => e.preventDefault(), { capture: true, once: true });
    });
    await pack.click();
    const before = await copies(page);
    await page.locator("a[href*='record-match']").first().click();
    await page.waitForURL(/record-match/);
    await page.waitForTimeout(300);
    const after = await copies(page);
    check(`${size}: a copy in the air when Play / Record opens is gone`, before === 1 && after === 0, `${before} before, ${after} after`);

    // 3. A leftover when the tab comes back into view: gone.
    await page.evaluate(() => {
        const el = document.createElement("div");
        el.dataset.packFlight = "";
        document.body.appendChild(el);
        document.dispatchEvent(new Event("visibilitychange"));
    });
    check(`${size}: a leftover goes when the tab is shown again`, (await copies(page)) === 0);
    await page.close();
}
await browser.close();
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FAIL")) ? 1 : 0;
