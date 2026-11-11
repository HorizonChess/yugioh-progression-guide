// Polymerization with one material on the field and one in the hand: both glow, and tapping the
// one in the hand picks it (it used to be out of reach, and the duel got stuck).
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-fusion.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const POLY = 24094653, MANIP = 34460851, MASAKI = 44287299, FLAME_SWORDSMAN = 45231177;
const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const deck = { id: "d1", name: "Fusion", mainDeck: [POLY, POLY, POLY, MANIP, MANIP, MANIP, MASAKI, MASAKI, MASAKI, ...Array.from({ length: 31 }, (_, i) => MAIN[i % MAIN.length])], sideDeck: [], extraDeck: [FLAME_SWORDSMAN] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([POLY, MANIP, MASAKI, FLAME_SWORDSMAN, ...MAIN].map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
// A missing element fails fast rather than stalling the loop for the default 30 s.
page.setDefaultTimeout(4000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const inHand = (code) => page.locator(`[aria-label="Card in hand ${code}"]`).first();
const onField = (code) => page.locator(`.df-card img[src*="${code}"]`);

try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    let asked = false;
    for (let attempt = 0; attempt < 12 && !asked; attempt++) {
        await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /Duel in the app/i }).click();
        const old = btn("End it, start a new one"), practice = btn("Solo: test your deck"); // the opponent only passes: the duel lasts
        await old.or(practice).first().waitFor({ timeout: 15000 });
        if (await old.count()) await old.click();
        await practice.click();
        await page.waitForURL(/duel/, { timeout: 30000 });
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        if (process.env.DEBUG) console.log("attempt", attempt);
        for (let i = 0; i < 160 && !asked; i++) {
            if (process.env.DEBUG && i % 10 === 0) console.log("  step", i, await page.locator(".df-sheet__title").first().textContent({ timeout: 200 }).catch(() => "-"), await page.locator('[role="tab"][aria-selected="true"]').getAttribute("aria-label", { timeout: 200 }).catch(() => "-"), "hand", await page.locator(".df-hand__card").count(), "poly", await inHand(POLY).count(), "manip", await inHand(MANIP).count(), await onField(MANIP).count(), "masaki", await inHand(MASAKI).count(), await onField(MASAKI).count());
            await page.waitForTimeout(600);
            if (await page.getByText(/ wins$/).count()) break;
            // The question asking for materials (a card's text in the detail panel can say it too).
            if (await page.locator(".df-sheet__title", { hasText: /Fusion Material/ }).count()) { asked = true; break; }
            if (await page.getByText("Choose the card to discard").count()) { await page.locator(".df-hand__card.is-glow").first().click({ force: true }).catch(() => {}); continue; }
            if (await btn("No").count()) { await btn("No").click().catch(() => {}); continue; }
            const zone = page.locator(".df-zone.is-offered").first();
            if (await zone.count()) { await zone.click({ force: true }).catch(() => {}); continue; }
            const pick = page.locator(".df-sheet__list .df-listcard").first(); // the Fusion Monster to summon
            if (await pick.count()) { await pick.click().catch(() => {}); continue; }
            if (!(await page.locator('[role="tab"][aria-label="Main 1"][aria-selected="true"]').count())) { if (await end.count()) await end.click().catch(() => {}); continue; }
            // Main Phase: one material on the field and the other in hand, then Polymerization.
            const manipUp = await onField(MANIP).count(), masakiUp = await onField(MASAKI).count();
            const ready = (manipUp && (await inHand(MASAKI).count())) || (masakiUp && (await inHand(MANIP).count()));
            if (ready && (await inHand(POLY).count())) {
                await inHand(POLY).click({ force: true }).catch(() => {});
                await page.waitForTimeout(300);
                if (await btn("Activate").count()) { await btn("Activate").first().click({ force: true, timeout: 3000 }).catch(() => {}); continue; }
            } else if (!manipUp && !masakiUp) {
                const m = (await inHand(MANIP).count()) ? inHand(MANIP) : inHand(MASAKI);
                if (await m.count()) {
                    await m.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(300);
                    if (await btn("Normal Summon").count()) { await btn("Normal Summon").click({ force: true, timeout: 3000 }).catch(() => {}); continue; }
                }
            }
            if (await end.count()) await end.click().catch(() => {});
        }
    }
    check(asked, "Polymerization asks for its materials");
    await page.waitForTimeout(800);
    await page.screenshot({ path: outPath(`duel-fusion-asked-${phone ? "phone" : "desktop"}.png`) });
    const glowingHand = page.locator(".df-hand__card.is-glow");
    check((await glowingHand.count()) > 0, `the material in hand glows (${await glowingHand.count()})`);
    // Tap it where it lies: it must take the tap (nothing on top of it).
    const target = glowingHand.first();
    const box = await target.boundingBox();
    const hit = box && await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".df-hand__card") !== null, [box.x + box.width / 2, box.y + Math.min(box.height / 2, 30)]);
    check(!!hit, "nothing covers the hand card");
    await target.click({ timeout: 3000 }).catch(() => {});
    // Then the one on the field (once the next step of the pick is up).
    for (let i = 0; i < 10 && (await page.locator(".df-sheet__title", { hasText: /Fusion Material/ }).count()); i++) {
        await page.waitForTimeout(700);
        const fieldMat = page.locator(".df-card.is-glow").first();
        if (await fieldMat.count()) await fieldMat.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: outPath(`duel-fusion-after-${phone ? "phone" : "desktop"}.png`) });
    // Flame Swordsman on the field, or the duel asking where (its zones glow) or in what position.
    const on = (await onField(FLAME_SWORDSMAN).count()) > 0 || (await page.locator(".df-zone.is-offered").count()) > 0 || (await page.getByText(/which position/).count()) > 0;
    check((await page.locator(".df-sheet__title", { hasText: /Fusion Material/ }).count()) === 0 && on, "the fusion goes on (Flame Swordsman, or its zone or position)");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
