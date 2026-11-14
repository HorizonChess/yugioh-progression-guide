// Injection Fairy Lily in the damage step: summon her, attack, say yes when asked, tap her and
// Activate. She pays 2000 LP and the duel goes on (it used to get stuck).
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-lily.mjs          (PHONE=1 for a phone)

import { launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame, practiceAgainstBot, openBotsArena } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const LILY = 79575620;
const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const deck = { id: "d1", name: "Lily", mainDeck: [LILY, LILY, LILY, ...Array.from({ length: 37 }, (_, i) => MAIN[i % MAIN.length])], sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([LILY, ...MAIN].map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: outPath(`duel-lily-${n}-${phone ? "phone" : "desktop"}.png`) });
const btn = (name) => page.getByRole("button", { name, exact: true });
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    let asked = false, activated = false, lpBefore = "", lpAfter = "";
    for (let attempt = 0; attempt < 6 && !asked; attempt++) {
        await openBotsArena(page);
        await practiceAgainstBot(page);
        await page.waitForURL(/duel/, { timeout: 30000 });
        await throughPregame(page);
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        const battle = page.locator('[role="tab"][aria-label="Battle"]:not([disabled])');
        const lilyHand = page.locator(`[aria-label="Card in hand ${LILY}"]`).first();
        for (let i = 0; i < 160 && !asked; i++) {
            await page.waitForTimeout(600);
            if (await page.getByText(/ wins( game \d+)?$/).count()) break;
            if (await page.getByText(/^Damage calculation/).count()) { asked = true; break; }
            const discard = page.locator(".df-hand__card.is-glow").first();
            if (await discard.count()) { await discard.click({ force: true }).catch(() => {}); continue; }
            if (await btn("No").count()) { await btn("No").click().catch(() => {}); continue; }
            const zone = page.locator(".df-zone.is-offered").first();
            if (await zone.count()) { await zone.click({ force: true }).catch(() => {}); continue; }
            const lilyField = page.locator(`.df-card.is-glow[data-uid]`).filter({ has: page.locator(`img[src*="${LILY}"]`) }).first();
            // Summon Lily, go to battle, attack with her (a target if asked), else end the turn.
            if (await lilyHand.count() && await page.locator(".df-hand__card.is-glow, .df-hand__card").count() && !(await battle.count() && await page.locator('[role="tab"][aria-label="Main 1"][aria-selected="true"]').count() === 0)) {
                await lilyHand.click({ force: true }).catch(() => {});
                await page.waitForTimeout(300);
                if (await btn("Normal Summon").count()) { await btn("Normal Summon").click({ force: true, timeout: 3000 }).catch(() => {}); continue; }
            }
            if (await page.locator('[role="tab"][aria-label="Battle"][aria-selected="true"]').count()) {
                const attacker = page.locator(".df-card.is-glow").first();
                if (await attacker.count()) {
                    await attacker.click({ force: true });
                    await page.waitForTimeout(300);
                    if (await btn("Attack").count()) { await btn("Attack").first().click({ force: true, timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); const t = page.locator(".df-card.is-glow").first(); if (await t.count()) await t.click({ force: true }).catch(() => {}); continue; }
                }
            } else if (await battle.count() && await page.locator(`.df-card img[src*="${LILY}"]`).count()) { await battle.click({ timeout: 3000 }).catch(() => {}); continue; }
            if (await end.count()) await end.click().catch(() => {});
        }
    }
    check(asked, "you're asked about the damage step");
    await shot("asked");
    lpBefore = (await page.locator(".df-lp--me .df-lp__value b").textContent()) ?? "";
    await btn("Yes").click();
    await page.waitForTimeout(500);
    const glowing = page.locator(".df-card.is-glow");
    check((await glowing.count()) > 0, `Lily glows (${await glowing.count()})`);
    await glowing.first().click({ force: true });
    await page.waitForTimeout(400);
    await shot("held");
    const act = page.locator(".df-pop__btn", { hasText: "Activate" });
    check((await act.count()) === 1, "an Activate button pops up over her");
    if (await act.count()) { await act.click(); activated = true; }
    await page.waitForTimeout(3000);
    await shot("after");
    lpAfter = (await page.locator(".df-lp--me .df-lp__value b").textContent()) ?? "";
    check(activated && Number(lpAfter) === Number(lpBefore) - 2000, `she pays 2000 LP (${lpBefore} → ${lpAfter})`);
    check((await page.getByText(/^Damage calculation/).count()) === 0, "the question is gone");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
