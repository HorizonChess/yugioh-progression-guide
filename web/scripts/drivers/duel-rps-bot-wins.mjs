// When the bot wins rock-paper-scissors (it chooses at once), its showdown opens the board and the
// duel waits under it: nothing plays until you close it with Duel!, as when you won and chose.
//
//   API_BASE=http://localhost:4000 APP_BASE=http://localhost:3107 node web/scripts/drivers/duel-rps-bot-wins.mjs   (PHONE=1 for a phone)
import { launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, practiceAgainstBot, openBotsArena } from "./_lib.mjs";
const MON = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const main = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]);
const deck = { id: "d1", name: "M", mainDeck: main, sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MON.map((id) => [id + "_LOB_Common", 3])), savedDecks: [deck] });
const phone = process.env.PHONE === "1";
const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const turn = async () => (await page.locator(".df-phases").count()) ? await page.evaluate(() => document.body.innerText.match(/Turn \d+[^\n]*\n?[^\n]*/)?.[0]?.replace(/\n/g, " ")) : null;
const oppCards = () => page.evaluate(() => document.querySelectorAll('[aria-label^="card "], [aria-label="Set card"]').length);
let failures = 0;
const check = (ok, l) => { console.log(`${ok ? "PASS" : "FAIL"}  ${l}`); if (!ok) failures++; };
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    let botWon = false;
    for (let attempt = 0; attempt < 8 && !botWon; attempt++) {
        await openBotsArena(page);
        await practiceAgainstBot(page);
        await page.waitForURL(/duel/, { timeout: 30000 });
        for (let i = 0; i < 60; i++) {
            if (await page.getByRole("button", { name: "Go first", exact: true }).count()) break;
            if (await page.locator(".df-phases").count()) { botWon = true; break; }
            const rock = page.getByRole("button", { name: "Rock", exact: true });
            if (await rock.count()) await rock.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(300);
        }
    }
    if (!botWon) throw new Error("the bot never won");
    const overlay = page.locator(".df-rps");
    check(await overlay.isVisible(), "the bot won: its showdown is up");
    const t0 = await turn(), c0 = await oppCards();
    await page.waitForTimeout(7500);
    await page.screenshot({ path: outPath(`rps-held-${phone ? "phone" : "desk"}.png`) });
    const t1 = await turn(), c1 = await oppCards();
    console.log({ t0, t1, c0, c1 });
    check(t0 === t1 && c0 === c1 && (await overlay.isVisible()), "nothing plays under the showdown, and it stays until closed");
    await page.getByRole("button", { name: "Duel!" }).click();
    await page.waitForTimeout(6000);
    const t2 = await turn(), c2 = await oppCards();
    console.log({ t2, c2 });
    check(t2 !== t1 || c2 !== c1, "the duel goes on once it's closed");
    await page.screenshot({ path: outPath(`rps-after-${phone ? "phone" : "desk"}.png`) });
} finally { await browser.close(); }
process.exit(failures ? 1 : 0);
