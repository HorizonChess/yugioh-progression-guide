// A match still on in the Bots Arena: the greyed start button says why beside it, with continue it /
// end it; ending it there lets a new one start. Desktop and phone.
//
//   API_BASE=http://localhost:4000 APP_BASE=http://localhost:3107 node web/scripts/drivers/arena-open-match.mjs
import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame, practiceAgainstBot, openBotsArena } from "./_lib.mjs";
const MON = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const main = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]);
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MON.map((id) => [id + "_LOB_Common", 3])), savedDecks: [{ id: "d1", name: "M", mainDeck: main, sideDeck: [], extraDeck: [] }] });
let failures = 0;
const browser = await launchBrowser();
for (const phone of [false, true]) {
    const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await openBotsArena(page);
    await practiceAgainstBot(page);
    await page.waitForURL(/duel/, { timeout: 30000 });
    await throughPregame(page);
    await page.goto(`${BASE}/bots-arena/`, { waitUntil: "networkidle" });
    await page.getByRole("radio", { name: "Practice Bot", exact: true }).click();
    await page.locator(".ba-blocked").waitFor({ timeout: 10000 });
    await page.locator(".ba-blocked").scrollIntoViewIfNeeded();
    await page.screenshot({ path: outPath(`open-${phone ? "phone" : "desk"}.png`) });
    await page.locator(".ba-blocked").getByRole("button", { name: "end it" }).click();
    await page.locator(".ba-blocked").waitFor({ state: "detached", timeout: 15000 });
    const ok = await page.getByRole("button", { name: /^Duel the bot/ }).isEnabled();
    console.log(`${ok ? "PASS" : "FAIL"}  ${phone ? "phone" : "desktop"}: said beside the button, and ending it there frees the button`);
    if (!ok) failures++;
    await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
