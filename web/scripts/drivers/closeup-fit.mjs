// Phones: a card close-up, with its "Look at later" button, fits the visible height, down to
// short screens (a browser with both bars showing). Opens one from the collection at a few
// heights and checks the card keeps its shape and the button ends above the bottom edge.
// Needs the dev server.
//
//   node scripts/drivers/closeup-fit.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const browser = await launchBrowser();
for (const height of [844, 740, 640, 560]) {
    const page = await browser.newPage({ viewport: { width: 390, height }, isMobile: true, hasTouch: true });
    const save = makeSave({ currentSetIndex: 0, collection: { "89631139_LOB-EN001_Ultra Rare": 1 } });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.locator(".binder-pocket img").first().tap();
    await page.waitForTimeout(1000);
    const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect();
        const card = r(".closeup__card"), button = r(".closeup .mark-toggle");
        return { card: card && { w: Math.round(card.width), h: Math.round(card.height), ratio: +(card.width / card.height).toFixed(3) }, buttonBottom: button && Math.round(button.bottom), vh: innerHeight };
    });
    const ok = m.buttonBottom <= m.vh && Math.abs(m.card.ratio - 813 / 1185) < 0.01;
    console.log(`${ok ? "ok  " : "FAIL"} ${height}px: card ${m.card.w}x${m.card.h} (ratio ${m.card.ratio}), button ends at ${m.buttonBottom} of ${m.vh}`);
    await page.screenshot({ path: outPath(`closeup-fit-${height}.png`) });
    await page.close();
}
await browser.close();
