// Yugi inside the pity-pack chamber (rewards): claim a pity reward, open the pack and flip
// every card, then see what he says (a sample line if nothing notable came up); also checks a tap elsewhere on a phone moves him along. Screenshots land in
// out/guide/. Needs the dev server.
//
//   node scripts/drivers/guide-pity.mjs
import { mkdirSync } from "fs";
import { join } from "path";
import { OUT_DIR, launchSeeded, makeSave, reward } from "./_lib.mjs";

const DIR = join(OUT_DIR, "guide");
mkdirSync(DIR, { recursive: true });
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const LINE = { key: "pity-check", text: "(Test line: nothing notable flipped, so this only checks where Yugi stands.)", mood: "happy", priority: 3 };

for (const [size, viewport] of Object.entries(SIZES)) {
    const save = makeSave({ currentSetIndex: 0, rewards: [reward({ prizeId: "pity-packs", wonFromPackName: "Legend of Blue Eyes White Dragon", wonFromSetIndex: 0 })] });
    const { browser, page, errors } = await launchSeeded(save, { route: "/rewards", viewport });
    await page.getByRole("button", { name: "Open 3 Packs" }).first().click();
    await page.locator(".rite").waitFor({ timeout: 20000 });
    await page.waitForTimeout(3000);
    const guides = await page.locator(".guide").count();
    // Open the pack and flip every card first, as a player would: he only speaks once a card is face up.
    const box = await page.locator(".ps-pack").boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height * (size === "phone" ? 0.2 : 0.5));
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Flip All" }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(6000);
    // His real line on these cards, if any was notable; otherwise a sample (said so in the log), to check his place.
    const real = await page.evaluate(() => window.__guide.current()?.text ?? null);
    if (!real) await page.evaluate((l) => window.__guide.sayAll([l, { ...l, key: "pity-2", text: "And a second line, waiting for a tap." }]), LINE);
    await page.waitForTimeout(3500);
    console.log(`${size}: ${real ? `his line on a flipped card: "${real}"` : "nothing notable flipped, showing a sample line"}`);
    const on = await page.locator(".rite .guide--on").count();
    await page.screenshot({ path: join(DIR, `pity-${size}.png`) });
    let moved = "n/a";
    if (size === "phone") {
        await page.mouse.click(195, 200);
        await page.waitForTimeout(300);
        moved = await page.evaluate(() => window.__guide.current()?.key ?? "gone");
    }
    if (errors.length) console.log(errors.join(" | "));
    console.log(`${size}: ${guides} Yugi on the page, speaking inside the chamber: ${on === 1}, after a tap elsewhere: ${moved}, errors: ${errors.length}`);
    await browser.close();
}
