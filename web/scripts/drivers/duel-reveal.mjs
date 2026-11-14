// A card shown by an effect: you play Reinforcement of the Army against the bot, pick the Warrior,
// and the board says you showed it to the rival, with the card face up in the banner and the log.
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-reveal.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const REINFORCEMENT = 32807846, CELTIC_GUARDIAN = 91152256;
// Three copies at most: three Reinforcements and Legend of Blue Eyes Normal Monsters, Warriors among them.
const MAIN = [CELTIC_GUARDIAN, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const deck = { id: "d1", name: "Reveal", mainDeck: [REINFORCEMENT, REINFORCEMENT, REINFORCEMENT, ...Array.from({ length: 37 }, (_, i) => MAIN[i % MAIN.length])], sideDeck: [], extraDeck: [] };
const save = makeSave({
    currentSetIndex: 0,
    collection: Object.fromEntries([REINFORCEMENT, ...MAIN].map((id) => [`${id}_LOB_Common`, 3])),
    savedDecks: [deck],
});

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    // Which cards come first is down to the shuffle: a duel that ends before anyone draws
    // Reinforcement is played again (up to five times).
    let played = false, words = "";
    const banner = page.locator(".df-reveal");
    for (let attempt = 0; attempt < 5 && !played && !words; attempt++) {
        await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
        // (Playing here is what the board opens on.)
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
        await throughPregame(page);

        // Turns pass (End, and the first card for any question) until Reinforcement is in hand.
        const card = page.locator(`[aria-label="Card in hand ${REINFORCEMENT}"]`).first();
        const activate = page.getByRole("button", { name: "Activate", exact: true });
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        const listed = page.locator(".df-sheet__list .df-listcard");
        for (let i = 0; i < 150 && !played; i++) {
            if (await page.getByText(/ wins( game \d+)?$/).count()) break; // over before anyone drew it: try another
            await page.waitForTimeout(800);
            // The bot plays a copy of your deck, so it may show you its Warrior first: that counts too.
            if (await banner.count()) { words = (await banner.textContent()) ?? ""; break; }
            // (On your turn the cards you can play glow too: only a discard is clicked.)
            const discard = (await page.getByText("Choose the card to discard").count()) ? page.locator(".df-hand__card.is-glow").first() : page.locator("#none");
            const canEnd = (await end.count()) > 0;
            if (await discard.count()) {
                await discard.click({ force: true }).catch(() => {});
                continue;
            }
            if (!(await card.count()) || !canEnd) {
                if (canEnd) await end.click().catch(() => {});
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
    check(played || words, "Reinforcement of the Army activates");
    // Put the Spell in a zone (the first offered), then pick the Warrior (the first card offered) and confirm if asked.
    for (let i = 0; i < 20 && played; i++) {
        await page.waitForTimeout(500);
        const zone = page.locator(".df-zone.is-offered").first();
        if (await zone.count()) {
            await zone.click({ force: true }).catch(() => {});
            continue;
        }
        const pick = page.locator(".df-sheet__list .df-listcard").first();
        if (await pick.count()) {
            await pick.click();
            const ok = page.getByRole("button", { name: /^(Confirm|Done|OK)$/ });
            if (await ok.count()) await ok.first().click();
            break;
        }
    }
    if (!words) {
        await banner.waitFor({ timeout: 15000 }).catch(() => {});
        words = (await banner.textContent().catch(() => "")) ?? "";
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: outPath(`duel-reveal-${phone ? "phone" : "desktop"}.png`) });
    check(/(You show .+|shows you) 1 card/.test(words), `the banner says who showed it (${words})`);
    check((await page.locator(`.df-reveal img[alt]`).count()) === 1, "the shown card is in the banner");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
