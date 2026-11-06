// Yugi speaking for the game: a set's card list, a card looked at, a haul, a result.
// Screenshots land in out/guide/. Needs the dev server (BASE, default http://localhost:3000).
//
//   node scripts/drivers/guide.mjs        (WIDTHS=phone to skip desktop)
import { mkdirSync } from "fs";
import { join } from "path";
import { BASE, OUT_DIR, STORE_KEY, launchBrowser, makeSave, seedStorage } from "./_lib.mjs";

const DIR = join(OUT_DIR, "guide");
mkdirSync(DIR, { recursive: true });
const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const browser = await launchBrowser();
for (const [size, options] of Object.entries(SIZES).filter(([s]) => (process.env.WIDTHS || "desktop,phone").split(",").includes(s))) {
    const page = await browser.newPage(options);
    const save = makeSave({ currentSetIndex: 0, collection: {} });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-pack-sound": "off" });
    const tablet = page.locator(".guide--on .guide__tablet");
    const said = async (name) => {
        await page.waitForSelector(".guide--on", { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(2600);
        const text = await page.locator(".guide--on [role=status]").textContent({ timeout: 500 }).catch(() => null);
        console.log(`${size} ${name}: ${text ?? "(silent)"}`);
        await page.screenshot({ path: join(DIR, `${size}-${name}.png`) });
        if (text) await tablet.click().catch(() => {});
        await page.waitForTimeout(700);
    };

    // 1. A set's card list, before owning any of it.
    await page.goto(`${BASE}/packs/?set=0`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /view the card list/ }).click();
    await said("details");

    // 2. Opening a card in it.
    await page.locator(".gallery__tile", { hasText: "Pot of Greed" }).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "networkidle" }); // a fresh visit: the tip gap would hold it back right after the intro
    await page.getByRole("button", { name: /view the card list/ }).click();
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__guide.done());
    await page.locator(".gallery__tile", { hasText: "Pot of Greed" }).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await said("card");

    // 3. A haul.
    await page.goto(`${BASE}/packs/?set=0`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^open/i }).first().click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Open All" }).click().catch(() => {});
    await page.waitForTimeout(1500);
    await said("haul");
    await page.close();
}
await browser.close();
