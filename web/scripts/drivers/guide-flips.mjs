// Yugi as the cards flip: open a pack of the first set, Flip All, then tap through what he
// says (▼ = more), and the haul after. Screenshots and his lines land in out/guide/.
// Needs the dev server.
//
//   node scripts/drivers/guide-flips.mjs        (WIDTHS=phone to skip desktop)
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
    await page.goto(`${BASE}/packs/?set=0`, { waitUntil: "networkidle" });
    // Three packs, so there's a good chance of a few notable cards.
    await page.getByRole("button", { name: "+" }).click({ timeout: 2000 }).catch(() => {});
    await page.getByRole("button", { name: "+" }).click({ timeout: 2000 }).catch(() => {});
    await page.getByRole("button", { name: /^open/i }).first().click();
    await page.waitForTimeout(2500);
    await page.getByText(/Pack 1 of/).waitFor();
    await page.waitForTimeout(1500);
    // Open the pack: a click on desktop, a tap on phones (both tear it).
    const box = await page.locator(".ps-pack").boundingBox();
    if (box) {
        if (options.hasTouch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.2);
        else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Flip All" }).click({ timeout: 15000 });
    if (process.env.DEBUG) for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(400);
        console.log(i, await page.evaluate(() => JSON.stringify({ s: window.__guide.state(), seen: sessionStorage.getItem("ygo-guide-seen"), on: !!document.querySelector(".guide--on") })));
    }
    await page.waitForTimeout(2500);

    const state = () => page.evaluate(() => ({ text: window.__guide.state().line?.text ?? null, more: window.__guide.state().more }));
    let n = 0;
    for (let s = await state(); s.text && n < 6; s = await state(), n++) {
        await page.waitForTimeout(1200 + s.text.length * 24);
        await page.screenshot({ path: join(DIR, `${size}-flip-${n}.png`) });
        console.log(`${size} flip ${n} (${s.more} more): ${s.text}`);
        await page.locator(".guide--on .guide__tablet").click({ timeout: 2000 }).catch(() => {}); // finishes the line if still typing
        await page.locator(".guide--on .guide__tablet").click({ timeout: 2000 }).catch(() => {}); // next
        await page.waitForTimeout(600);
    }
    if (!n) console.log(`${size}: nothing notable flipped`);

    // On to the haul.
    for (let i = 0; i < 3; i++) {
        await page.getByRole("button", { name: "Next Pack" }).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(800);
    }
    await page.getByRole("button", { name: "Open All" }).click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const haul = await state();
    console.log(`${size} haul (${haul.more} more): ${haul.text ?? "(silent: all said on flip)"}`);
    await page.screenshot({ path: join(DIR, `${size}-flip-haul.png`) });
    await page.close();
}
await browser.close();
