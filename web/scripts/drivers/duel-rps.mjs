// Rock-paper-scissors as a showdown: against the bot, throw Rock until each outcome has been seen.
// Winning, the pregame shows both cards turned over and then asks who goes first; losing, the bot
// chooses at once and the board opens on the showdown (its hand, and that it chose to go first);
// a tie shows both cards, then asks for another throw.
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-rps.mjs          (PHONE=1 for a phone)

import { launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, practiceAgainstBot, openBotsArena } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { id: "d1", name: "RPS", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const shot = (n) => page.screenshot({ path: outPath(`duel-rps-${n}-${phone ? "phone" : "desktop"}.png`) });
const seen = { win: false, lose: false, tie: false };
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    for (let attempt = 0; attempt < 12 && !(seen.win && seen.lose); attempt++) {
        await openBotsArena(page);
        await practiceAgainstBot(page);
        await page.waitForURL(/duel/, { timeout: 30000 });
        for (let i = 0; i < 12; i++) {
            const rock = page.locator(".pg-rps[aria-label='Rock']");
            await rock.or(page.locator(".rps, .df-phases")).first().waitFor({ timeout: 15000 });
            if (await page.locator(".df-rps .rps").count()) {
                // Lost: the bot chose at once, and the board opens on the showdown.
                await page.waitForTimeout(2600);
                const text = (await page.locator(".df-rps").textContent()) ?? "";
                if (!seen.lose) {
                    await shot("lose");
                    check(/Practice Bot wins!/.test(text) && /chose to go first/.test(text), `lost: the board shows it (${text.replace(/\s+/g, " ").trim()})`);
                    check((await page.locator(".df-rps .rps-face").count()) === 2, "both hands are turned over");
                }
                seen.lose = true;
                await btn("Duel!").click();
                check((await page.locator(".df-rps").count()) === 0, "Duel! closes it");
                break;
            }
            if (await page.locator(".rps--tie").count()) {
                const said = (await page.locator(".rps").textContent()) ?? "";
                await page.waitForTimeout(1800);
                if (!seen.tie) {
                    await shot("tie");
                    check(/You both threw Rock\. Again!/.test(said), "a tie shows both cards and says so");
                }
                seen.tie = true;
                await rock.waitFor({ timeout: 6000 });
                continue;
            }
            if (await page.locator(".rps--win").count()) {
                await page.waitForTimeout(2700);
                if (!seen.win) {
                    await shot("win");
                    check(/You win!/.test((await page.locator(".rps").textContent()) ?? ""), "won: the pregame shows it");
                    check((await btn("Go first").count()) === 1, "and then asks who goes first");
                }
                seen.win = true;
                break;
            }
            if (await page.locator(".df-phases").count()) break; // a board without a showdown
            await rock.click();
            await page.waitForTimeout(400);
        }
    }
    check(seen.win && seen.lose, `both outcomes seen (win ${seen.win}, lose ${seen.lose}, tie ${seen.tie})`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
