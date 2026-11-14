// The duel's piles: your own Extra Deck opens (the rival's doesn't), and the Graveyard and Extra
// Deck stay reachable while a question is up. A guest practice duel against the bot.
//
//   npm run test-server -w @ygo/api
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/duel-piles.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

// Fourteen Legend of Blue Eyes Normal Monsters, three of each, and two Fusions.
const MAIN = [85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 91152256, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 16353197];
const FLAME_SWORDSMAN = 45231177, THOUSAND_DRAGON = 41462083;
const deck = { id: "d1", name: "Piles", mainDeck: Array.from({ length: 42 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [FLAME_SWORDSMAN, THOUSAND_DRAGON] };
const save = makeSave({
    currentSetIndex: 0,
    collection: Object.fromEntries([...MAIN.map((id) => [`${id}_LOB_Common`, 3]), [`${FLAME_SWORDSMAN}_LOB_Super Rare`, 1], [`${THOUSAND_DRAGON}_LOB_Secret Rare`, 1]]),
    savedDecks: [deck],
});

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
if (process.env.DEBUG) page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    // (Playing here is what the board opens on.)
    const old = page.getByRole("button", { name: "End it, start a new one" });
    if (await old.count()) await old.click();
    await page.getByRole("button", { name: "Practice against the bot" }).click();
    await page.waitForURL(/duel/, { timeout: 30000 }).catch(async (e) => {
        // A refusal shows in the game's dialog: say what it was.
        throw new Error(`no duel: ${(await page.locator(".gd").textContent().catch(() => null)) ?? e.message}`);
    });
    await throughPregame(page);
    await page.locator(".df-pile").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);

    // The bot plays a copy of your deck: both Extra Decks hold 2, and only yours opens.
    const piles = page.locator('.df-pile[data-label="Extra"]');
    check((await piles.count()) === 2 && (await page.locator('.df-pile[data-label="Extra"]:not([disabled])').count()) === 1, "one Extra Deck opens (yours), the rival's doesn't");
    const mine = page.locator('.df-pile[data-label="Extra"]:not([disabled])');
    await mine.click();
    const sheet = page.getByText("Your Extra Deck");
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800); // the sheet slides up
    const listed = (await page.locator(".df-sheet__list .df-listcard span").allTextContents()).join(", ");
    await page.screenshot({ path: outPath(`duel-extra-${phone ? "phone" : "desktop"}.png`) });
    check(/Flame Swordsman/.test(listed) && /Thousand Dragon/.test(listed), `it lists both Fusions (${listed})`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
