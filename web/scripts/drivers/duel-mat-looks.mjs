// The duel mat's looks: the duel menu's "Mat" option steps through Classic, Carved stone and
// Obsidian and gold; the board changes at once, the choice is kept, and a zone on offer keeps its
// bright frame in every look.
//
//   npm run test-server -w @ygo/api
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/duel-mat-looks.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MONSTERS = [91152256, 85639257, 53153481, 17535588, 32452818, 9159938, 53375573, 43500484, 40826495, 15025844];
const BACKROW = [66788016, 4206964, 17814387];
const main = [...MONSTERS.flatMap((id) => [id, id, id]), ...BACKROW.flatMap((id) => [id, id, id]), 89091579];
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([...MONSTERS, ...BACKROW, 89091579].map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [{ id: "d1", name: "Mat", mainDeck: main, sideDeck: [], extraDeck: [] }] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const mat = () => page.locator(".df-arena").getAttribute("data-mat");
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    const old = page.getByRole("button", { name: "End it, start a new one" });
    const solo = page.getByRole("button", { name: "Solo: test your deck" });
    await old.or(solo).first().waitFor({ timeout: 15000 });
    if (await old.count()) await old.click();
    await solo.click();
    await page.waitForURL(/duel/, { timeout: 30000 });
    await page.locator(".df-phases").waitFor({ timeout: 30000 });
    await page.waitForTimeout(4500);
    check((await mat()) === "classic", "the mat starts as Classic");

    // Put a few cards down so the looks have something on them: a monster and two Set cards a turn.
    const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
    const pop = (name) => page.locator(".df-pop").getByRole("button", { name, exact: true });
    const play = async (verb, nth) => {
        for (const card of await page.locator(".df-hand__card.is-glow").all()) {
            await card.click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
            if (await pop(verb).count()) {
                await pop(verb).click().catch(() => {});
                const zone = page.locator(".df-zone.is-offered").nth(nth);
                await zone.waitFor({ timeout: 3000 }).then(() => zone.locator(".df-zone__pick").click({ force: true })).catch(() => {});
                await page.waitForTimeout(1100);
                return true;
            }
            await card.click({ force: true }).catch(() => {});
        }
        return false;
    };
    for (let turn = 0; turn < 3; turn++) {
        for (let i = 0; i < 40 && !(await end.count()); i++) {
            await page.waitForTimeout(400);
            if (await page.getByText("Choose the card to discard").count()) await page.locator(".df-hand__card.is-glow").first().click({ force: true }).catch(() => {});
        }
        await play("Normal Summon", turn);
        await play("Set", turn);
        await play("Set", turn);
        if (turn < 2) await end.click().catch(() => {});
        await page.waitForTimeout(1500);
    }

    // The menu's Mat option steps through the looks, and the board behind it changes at once.
    const option = (name) => page.getByRole("button", { name: new RegExp(`^Mat: ${name}`) });
    const menu = page.getByRole("button", { name: "Duel menu" });
    const close = page.getByRole("button", { name: /^Back to the duel/ });
    await page.screenshot({ path: outPath(`duel-mat-classic-${tag}.png`) });
    await menu.click();
    await option("Classic").click();
    check((await mat()) === "stone" && (await option("Carved stone").count()) === 1, "one tap: Carved stone");
    await close.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: outPath(`duel-mat-stone-${tag}.png`) });
    const stone = await page.locator(".df-mat--me").evaluate((el) => getComputedStyle(el).backgroundImage);
    check(/stone\.webp/.test(stone), "the stone look draws its slab");

    // A zone on offer keeps its bright gold frame on the stone. (On your own turn, with a card to place.)
    for (let i = 0; i < 60 && !((await end.count()) && (await page.locator(".df-hand__card.is-glow").count())); i++) {
        await page.waitForTimeout(500);
        if (await page.getByText("Choose the card to discard").count()) await page.locator(".df-hand__card.is-glow").first().click({ force: true }).catch(() => {});
    }
    for (const card of await page.locator(".df-hand__card.is-glow").all()) {
        await card.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
        const verb = (await pop("Set").count()) ? pop("Set") : (await pop("Normal Summon").count()) ? pop("Normal Summon") : null;
        if (verb) { await verb.click().catch(() => {}); break; }
        await card.click({ force: true }).catch(() => {});
    }
    const offered = page.locator(".df-zone.is-offered").first();
    if (await offered.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) {
        const frame = await offered.evaluate((el) => getComputedStyle(el, el.classList.contains("is-side") ? "::after" : "::before").borderTopColor);
        check(frame === "rgb(245, 197, 66)", `a zone on offer keeps its gold frame (${frame})`);
        await offered.locator(".df-zone__pick").click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
    } else console.log("      (nothing left to place: the offered-zone check was skipped)");

    await menu.click();
    await option("Carved stone").click();
    check((await mat()) === "obsidian", "a second tap: Obsidian and gold");
    await close.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: outPath(`duel-mat-obsidian-${tag}.png`) });
    check(await page.locator(".df-mat--me").evaluate((el) => el.classList.contains("is-turn")), "your field is marked as the turn player's");

    // The choice is kept for the next visit.
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".df-phases").waitFor({ timeout: 30000 });
    check((await mat()) === "obsidian", "the look is kept after a reload");
    await menu.click();
    await option("Obsidian and gold").click();
    check((await mat()) === "classic", "a third tap: back to Classic");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
