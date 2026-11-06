// Phones: swiping across a page goes to the neighbouring tab; a swipe on something with its
// own gesture (the binder's pages) doesn't; a vertical drag doesn't. Needs the dev server.
//
//   node scripts/drivers/swipe-nav.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const save = makeSave({ currentSetIndex: 2 });
await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
const cdp = await page.context().newCDPSession(page);
async function swipe(x0, y0, x1, y1, steps = 8) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let k = 1; k <= steps; k++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * k) / steps, y: y0 + ((y1 - y0) * k) / steps }] });
        await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(1200);
}
const path = () => new URL(page.url()).pathname;
const results = [];
const check = (what, got, want) => results.push(`${got === want ? "ok  " : "FAIL"} ${what}: ${got}${got === want ? "" : ` (want ${want})`}`);

await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
await swipe(330, 300, 60, 310);
check("timeline, swipe left", path(), "/collection/");
// The collection is a binder on phones: swipes turn its pages, and only past its first or
// last page do they go to the next tab.
await swipe(60, 300, 330, 305);
check("binder on its first page, swipe right (back to the timeline)", path(), "/timeline/");
await swipe(330, 300, 60, 310);
const pager = () => page.locator(".binder-pager span").textContent();
const p0 = await pager();
await swipe(330, 300, 60, 310);
check(`binder, swipe left (turns a page: ${p0} → ${await pager()})`, path(), "/collection/");
await swipe(60, 300, 330, 305);
check("binder on page 2, swipe right (turns back, stays)", path(), "/collection/");
await swipe(200, 600, 210, 250);
check("vertical drag", path(), "/collection/");
await page.goto(`${BASE}/deck-builder/`, { waitUntil: "networkidle" });
await swipe(330, 200, 60, 205);
check("deck builder, swipe left", path(), "/rewards/");
await page.goto(`${BASE}/rewards/`, { waitUntil: "networkidle" });
await swipe(330, 160, 60, 165);
check("rewards, swipe left", path(), "/menu/");
await page.screenshot({ path: outPath("swipe-nav.png") });
console.log(results.join("\n"));
await browser.close();
