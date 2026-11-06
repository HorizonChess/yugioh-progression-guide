// Yugi over a card close-up: open a card he has a note on (Pot of Greed, from a set's card
// list and from the collection) and check he speaks while the close-up is open, above it,
// without covering the details (desktop) or the sheet's button (phone). Needs the dev server.
//
//   node scripts/drivers/guide-closeup.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true },
};
const POT = "55144522_LOB-EN119_Rare";
const browser = await launchBrowser();
for (const [size, options] of Object.entries(SIZES)) {
    const page = await browser.newPage(options);
    const save = makeSave({ currentSetIndex: 0, collection: { [POT]: 1 } });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "on" });
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    let pocket = page.locator('.binder-pocket[aria-label="Pot of Greed"]');
    for (let k = 0; k < 20 && !(await pocket.count()); k++) {
        await page.getByRole("button", { name: "Next page" }).click();
        await page.waitForTimeout(900);
        pocket = page.locator('.binder-pocket[aria-label="Pot of Greed"]');
    }
    await (size === "phone" ? pocket.tap() : pocket.click());
    await page.waitForTimeout(3500);
    const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect();
        const z = (s) => Number(getComputedStyle(document.querySelector(s)).zIndex);
        const tablet = r(".guide--on .guide__tablet"), side = r(".closeup__side"), button = r(".closeup .mark-toggle"), card = r(".closeup__card");
        const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return {
            speaking: document.querySelector(".guide--on")?.textContent?.slice(0, 60) ?? null,
            above: z(".guide") > z(".closeup"),
            coversDetails: overlap(tablet, side) || overlap(tablet, button),
            coversCard: overlap(tablet, card),
            buttonOnScreen: button ? button.bottom <= innerHeight : false,
        };
    });
    console.log(size, JSON.stringify(m));
    await page.screenshot({ path: outPath(`guide-closeup-${size}.png`) });
    await page.close();
}
await browser.close();
