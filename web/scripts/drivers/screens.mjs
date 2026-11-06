// Screenshot sweep for design reviews: every screen of a seeded guest save, at
// desktop and phone sizes, plus the pack opener's stages. Also reports any page
// that scrolls sideways at phone width. Images land in out/screens/.
//
//   node scripts/drivers/screens.mjs            (WIDTHS=phone to skip desktop)
//   HIDE_GUIDE=1 leaves Yugi out (clean backdrops for guide prototypes); the images then land in out/screens-no-guide/.

import { mkdirSync } from "fs";
import { join } from "path";
import { BASE, OUT_DIR, STORE_KEY, launchBrowser, makeSave, reward, seedStorage } from "./_lib.mjs";

const HIDE_GUIDE = !!process.env.HIDE_GUIDE;
const DIR = join(OUT_DIR, HIDE_GUIDE ? "screens-no-guide" : "screens");
mkdirSync(DIR, { recursive: true });

const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const ROUTES = ["/menu/", "/timeline/", "/collection/", "/deck-builder/", "/rewards/", "/record-match/", "/packs/?set=0"];

const save = makeSave({
    currentSetIndex: 2,
    collection: { "89631139_LOB_Ultra Rare": 3, "46986414_LOB_Ultra Rare": 2, "15025844_LOB_Common": 3, "91152256_LOB_Common": 3 },
    rewards: [
        reward({ prizeId: "wheel-spin" }),
        reward({ prizeId: "tournament-packs" }),
        reward({ prizeId: "wildcard-rare" }),
        reward({ prizeId: "ban" }),
        reward({ prizeId: "wildcard-ultra", status: "claimed" }),
    ],
});

const browser = await launchBrowser();
const wanted = (process.env.WIDTHS || "desktop,phone").split(",");
for (const [size, options] of Object.entries(SIZES).filter(([s]) => wanted.includes(s))) {
    const page = await browser.newPage(options);
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }) });
    if (HIDE_GUIDE) await page.addInitScript(() => addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = '.fixed:has(> div > img[alt^="Yugi Muto"]), .fixed:has(img[alt^="Yugi Muto"]) { display: none !important; }';
        document.head.append(style);
    }));
    const shot = (name) => page.screenshot({ path: join(DIR, `${size}-${name}.png`) });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot("title");

    for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        const name = route.replace(/[/?=]+/g, "-").replace(/^-|-$/g, "");
        await shot(name);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (size === "phone" && overflow > 1) console.log(`OVERFLOW  ${route} scrolls sideways by ${overflow}px`);
    }

    // Pack opener: open the set's packs, flip some, then the summary.
    await page.goto(`${BASE}/packs/?set=0`, { waitUntil: "networkidle" });
    const open = page.getByRole("button", { name: /open/i }).first();
    if (await open.isVisible().catch(() => false)) {
        await open.click();
        await page.waitForTimeout(1500);
        await shot("packs-opening");
        const cards = page.locator(".pack-card");
        for (let i = 0; i < Math.min(4, await cards.count()); i++) await cards.nth(i).click({ force: true });
        await page.waitForTimeout(800);
        await shot("packs-flipped");
        await page.getByRole("button", { name: "Open All" }).click().catch(() => {});
        await page.waitForTimeout(1200);
        await shot("packs-summary");
    } else console.log(`NOTE  ${size}: no open button on /packs/?set=0`);

    await page.close();
}
await browser.close();
console.log(`Screens in ${DIR}`);
