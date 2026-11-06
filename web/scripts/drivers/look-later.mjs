// Marks to look at later, end to end on a guest save: mark a card in the opener's close-up,
// save the opening, see the bookmark in the binder and the deck builder, open the card in
// the collection (the mark clears), and switch it back on by hand. Desktop and phone.
// Needs the dev server.
//
//   node scripts/drivers/look-later.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, readSave, seedStorage } from "./_lib.mjs";

const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const browser = await launchBrowser();
const results = [];
const check = (what, ok, detail = "") => results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);

for (const [size, options] of Object.entries(SIZES)) {
    const page = await browser.newPage(options);
    const save = makeSave({ currentSetIndex: 0, collection: {} });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    const phone = size === "phone";
    const tap = async (loc) => (phone ? loc.tap() : loc.click());

    // 1. Open a pack, flip it, open the front card's close-up and mark it.
    await page.goto(`${BASE}/packs/?set=0`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Open/ }).first().click();
    await page.waitForTimeout(1500);
    const box = await page.locator(".ps-pack").boundingBox();
    if (phone) {
        const cdp = await page.context().newCDPSession(page);
        const y = box.y + box.height * 0.12;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 10, y }] });
        for (let x = box.x + 10; x < box.x + box.width - 10; x += 12) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Flip All" }).click({ timeout: 8000 });
    await page.waitForTimeout(phone ? 9000 : 5000);
    // The front (phone) or first (desktop) card's close-up.
    const target = phone
        ? await page.evaluate(() => [...document.querySelectorAll(".ps-card")].map((el, i) => ({ i, z: Number(el.style.zIndex) })).sort((a, b) => b.z - a.z)[0].i)
        : 0;
    await tap(page.locator(".ps-card").nth(target));
    await page.waitForTimeout(1200);
    const name = await page.locator(".ps-inspect").getAttribute("aria-label");
    await tap(page.locator(".ps-inspect .mark-toggle"));
    await page.waitForTimeout(400);
    check(`${size}: the close-up's toggle says marked`, (await page.locator(".ps-inspect .mark-toggle--on").count()) === 1, name);
    await page.screenshot({ path: outPath(`look-later-${size}-opener.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const marked = (await readSave(page)).marks ?? [];
    check(`${size}: saved on the guest save`, marked.length === 1, JSON.stringify(marked));

    // 2. Save the opening, then the binder and the deck builder show the bookmark.
    await page.getByRole("button", { name: "Open All" }).click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /Save|Add to Collection/ }).first().click();
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/deck-builder/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    check(`${size}: bookmark in the deck builder`, (await page.locator(".mark-badge").count()) >= 1);
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    // The binder's chapter for the set, if it isn't open on it already.
    const badges = page.locator(".binder-pocket .mark-badge");
    for (let k = 0; k < 15 && !(await badges.count()); k++) {
        await page.getByRole("button", { name: "Next page" }).click().catch(() => {});
        await page.waitForTimeout(900);
    }
    check(`${size}: bookmark in the binder`, (await badges.count()) === 1);
    await page.screenshot({ path: outPath(`look-later-${size}-binder.png`) });

    // 3. Opening it there counts as looking: the mark clears. Then it can be switched back on.
    await tap(page.locator(".binder-pocket:has(.mark-badge)"));
    await page.waitForTimeout(1200);
    check(`${size}: cleared once looked at`, ((await readSave(page)).marks ?? []).length === 0);
    await page.screenshot({ path: outPath(`look-later-${size}-closeup.png`) });
    await tap(page.locator(".closeup .mark-toggle"));
    await page.waitForTimeout(800);
    check(`${size}: switched back on by hand, and it stays`, ((await readSave(page)).marks ?? []).length === 1);
    await page.close();
}
console.log(results.join("\n"));
await browser.close();
