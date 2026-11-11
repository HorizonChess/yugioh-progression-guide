// Ordering cards: you play Spellbook Organization against the bot and put the top 3 cards of your
// Deck in order. Each card shows its place as you tap it, and the duel goes on once all are placed.
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-sort.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const ORGANIZATION = 96677818, NORMAL = 91152256; // Spellbook Organization, a Normal Monster
// Three copies at most: three Spellbook Organizations and Legend of Blue Eyes Normal Monsters, Warriors among them.
const MAIN = [NORMAL, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const deck = { id: "d1", name: "Reveal", mainDeck: [ORGANIZATION, ORGANIZATION, ORGANIZATION, ...Array.from({ length: 37 }, (_, i) => MAIN[i % MAIN.length])], sideDeck: [], extraDeck: [] };
const save = makeSave({
    currentSetIndex: 0,
    collection: Object.fromEntries([ORGANIZATION, ...MAIN].map((id) => [`${id}_LOB_Common`, 3])),
    savedDecks: [deck],
});

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    // Which cards come first is down to the shuffle: a duel that ends before anyone draws
    // Spellbook Organization is played again (up to twelve times).
    let played = false;
    for (let attempt = 0; attempt < 12 && !played; attempt++) {
        await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /Duel in the app/i }).click();
        // A duel from an earlier attempt may still be open: end it first.
        const old = page.getByRole("button", { name: "End it, start a new one" });
        const practice = page.getByRole("button", { name: "Practice against the bot" });
        await old.or(practice).first().waitFor({ timeout: 15000 }).catch(async () => {
            await page.screenshot({ path: outPath("duel-reveal-stuck.png") });
            throw new Error(`stuck before the duel: ${(await page.locator(".gd").textContent().catch(() => null)) ?? "?"}`);
        });
        if (await old.count()) await old.click();
        await practice.click();
        await page.waitForURL(/duel/, { timeout: 30000 }).catch(async (e) => {
            throw new Error(`no duel: ${(await page.locator(".gd").textContent().catch(() => null)) ?? e.message}`);
        });

        // Turns pass (End, and the first card for any question) until Spellbook Organization is in hand.
        const card = page.locator(`[aria-label="Card in hand ${ORGANIZATION}"]`).first();
        const activate = page.getByRole("button", { name: "Activate", exact: true });
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        const listed = page.locator(".df-sheet__list .df-listcard");
        for (let i = 0; i < 150 && !played; i++) {
            if (await page.getByText(/ wins$/).count()) break; // over before anyone drew it: try another
            await page.waitForTimeout(800);
            // Hand cards glow when they can be played too: discard only when asked to.
            const discard = (await page.getByText("Choose the card to discard").count()) ? page.locator(".df-hand__card.is-glow").first() : page.locator("#none");
            if (!(await card.count()) || (await discard.count())) {
                if (await discard.count()) await discard.click({ force: true }).catch(() => {});
                else if (await end.count()) await end.click().catch(() => {});
                else if (await listed.count()) {
                    await listed.first().click().catch(() => {});
                    const ok = page.getByRole("button", { name: /^(Confirm|Done|OK)$/ });
                    if (await ok.count()) await ok.first().click().catch(() => {});
                }
                continue;
            }
            await card.click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
            if (await activate.count()) { await activate.first().click(); played = true; }
        }
    }
    check(played, "Spellbook Organization activates");
    // Pick its zone, then tap the three cards last to first: each shows its place.
    const zone = page.locator(".df-zone.is-offered").first();
    await zone.waitFor({ timeout: 5000 }).then(() => zone.click({ force: true })).catch(() => {});
    const sheetCards = page.locator(".df-sheet__list .df-listcard");
    await sheetCards.nth(2).waitFor({ timeout: 15000 }).catch(() => {});
    if ((await sheetCards.count()) !== 3) await page.screenshot({ path: outPath(`duel-sort-missing-${phone ? "phone" : "desktop"}.png`) });
    check((await sheetCards.count()) === 3, "you're asked to order three cards");
    for (const i of [2, 1, 0]) await sheetCards.nth(i).click({ timeout: 5000 }).catch(() => {});
    const places = await page.locator(".df-listcard__order").allTextContents();
    await page.waitForTimeout(400);
    await page.screenshot({ path: outPath(`duel-sort-${phone ? "phone" : "desktop"}.png`) });
    check(places.join() === "3,2,1", `each card shows its place (${places.join()})`);
    await page.getByRole("button", { name: /^Confirm \(3\/3\)$/ }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    check((await page.locator(".df-listcard__order").count()) === 0, "the order is taken and the duel goes on");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
