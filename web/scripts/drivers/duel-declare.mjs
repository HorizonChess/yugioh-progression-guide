// Declarations: the bot plays a copy of your deck, Sets DNA Surgery and Prohibition and springs them.
// The board shows what it declared in a banner, and the face-up card wears it as a gold note.
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-declare.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const DNA_SURGERY = 74701381, PROHIBITION = 43711255;
// Three copies at most: the two declaring traps and Legend of Blue Eyes Normal Monsters.
const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const deck = { id: "d1", name: "Declare", mainDeck: [DNA_SURGERY, DNA_SURGERY, DNA_SURGERY, PROHIBITION, PROHIBITION, PROHIBITION, ...Array.from({ length: 34 }, (_, i) => MAIN[i % MAIN.length])], sideDeck: [], extraDeck: [] };
const save = makeSave({
    currentSetIndex: 0,
    collection: Object.fromEntries([DNA_SURGERY, PROHIBITION, ...MAIN].map((id) => [`${id}_LOB_Common`, 3])),
    savedDecks: [deck],
});

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {

    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    // The shuffle decides when the bot draws them: a duel over before it declares is played again.
    let banner = "", note = "";
    for (let attempt = 0; attempt < 5 && !banner; attempt++) {
        await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
        // (Playing here is what the board opens on.)
        const old = page.getByRole("button", { name: "End it, start a new one" });
        const practice = page.getByRole("button", { name: "Practice against the bot" });
        await old.or(practice).first().waitFor({ timeout: 15000 });
        if (await old.count()) await old.click();
        await practice.click();
        await page.waitForURL(/duel/, { timeout: 30000 });
        await throughPregame(page);
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        const listed = page.locator(".df-sheet__list .df-listcard");
        const pass = page.getByRole("button", { name: /^(Pass|No|Don't)/ });
        for (let i = 0; i < 200; i++) {
            await page.waitForTimeout(500);
            if (await page.getByText(/ wins$/).count()) break;
            if (await page.locator(".df-declare").count()) {
                banner = (await page.locator(".df-declare").textContent()) ?? "";
                await page.screenshot({ path: outPath(`duel-declare-banner-${phone ? "phone" : "desktop"}.png`) });
                await page.waitForTimeout(2500);
                note = (await page.locator(".df-note").first().textContent().catch(() => "")) ?? "";
                break;
            }
            // Your side does nothing: it passes, ends turns and discards what it must.
            const discard = page.locator(".df-hand__card.is-glow").first();
            if (await discard.count()) await discard.click({ force: true }).catch(() => {});
            else if (await pass.count()) await pass.first().click().catch(() => {});
            else if (await end.count()) await end.click().catch(() => {});
            else if (await listed.count()) await listed.first().click().catch(() => {});
        }
    }
    await page.screenshot({ path: outPath(`duel-declare-${phone ? "phone" : "desktop"}.png`) });
    check(/declares/.test(banner), `a banner says what the bot declared (${banner})`);
    check(note.length > 0, `the trap wears it as a note (${note})`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
