// A card that targets, on the chain: the bot (playing a copy of your deck) casts Change of Heart on
// your monster while you hold a Set Waboku. The "Respond to Change of Heart?" question says which
// card it targets, and that card is marked on the board.
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-chain-target.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const CHANGE_OF_HEART = 4031928, WABOKU = 12607053;
const MONSTERS = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const mainDeck = [...Array(6).fill(0).map((_, i) => (i % 2 ? WABOKU : CHANGE_OF_HEART)), ...Array.from({ length: 34 }, (_, i) => MONSTERS[i % MONSTERS.length])];
// Three copies each: three Change of Heart, three Waboku.
const deck = { id: "d1", name: "Targets", mainDeck, sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([CHANGE_OF_HEART, WABOKU, ...MONSTERS].map((id) => [`${id}_LOB_Common`, 4])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const pop = (name) => page.locator(".df-pop__btn", { hasText: new RegExp(`^${name}$`) });
const inHand = (code) => page.locator(`[aria-label="Card in hand ${code}"]`).first();
const myTurnMain = () => page.locator('[role="tab"][aria-label="Main 1"][aria-selected="true"]').count();
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    let asked = false;
    for (let attempt = 0; attempt < 5 && !asked; attempt++) {
        await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
        const old = btn("End it, start a new one"), practice = btn("Practice against the bot");
        await old.or(practice).first().waitFor({ timeout: 15000 });
        if (await old.count()) await old.click();
        await practice.click();
        await page.waitForURL(/duel/, { timeout: 30000 }).catch(async (e) => {
            await page.screenshot({ path: outPath("duel-chain-target-stuck.png") });
            throw new Error(`no duel: ${(await page.locator(".gd").textContent().catch(() => null)) ?? e.message}`);
        });
        await throughPregame(page);
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        let summoned = 0, setOne = 0;
        for (let i = 0; i < 220 && !asked; i++) {
            await page.waitForTimeout(500);
            if (await page.getByText(/ wins$/).count()) break;
            if (await page.locator(".df-sheet__title", { hasText: "Respond to Change of Heart?" }).count()) { asked = true; break; }
            const discard = page.locator(".df-hand__card.is-glow").first();
            if (await btn("No").count()) { await btn("No").click().catch(() => {}); continue; }
            const zone = page.locator(".df-zone.is-offered").first();
            if (await zone.count()) { await zone.click({ force: true }).catch(() => {}); continue; }
            if (await discard.count() && !(await end.count())) { await discard.click({ force: true }).catch(() => {}); continue; }
            if (!(await end.count())) continue; // not your move
            // Your Main Phase: Set a Waboku and summon a monster once a turn, then end the turn.
            if (await myTurnMain() && (await inHand(WABOKU).count()) && setOne < 2) {
                setOne++;
                await inHand(WABOKU).click({ force: true }).catch(() => {});
                await page.waitForTimeout(300);
                if (await pop("Set").count()) { await pop("Set").click({ force: true }).catch(() => {}); continue; }
            }
            const monster = page.locator(".df-hand__card").filter({ has: page.locator(MONSTERS.map((m) => `img[src*="${m}"]`).join(", ")) }).first();
            if (await myTurnMain() && (await monster.count()) && summoned < 1) {
                summoned++;
                await monster.click({ force: true }).catch(() => {});
                await page.waitForTimeout(300);
                if (await pop("Normal Summon").count()) { await pop("Normal Summon").click({ force: true }).catch(() => {}); continue; }
            }
            summoned = 0; setOne = 0;
            await end.click().catch(() => {});
        }
    }
    check(asked, "you're asked to respond to Change of Heart");
    await page.waitForTimeout(600);
    await page.screenshot({ path: outPath(`duel-chain-target-${phone ? "phone" : "desktop"}.png`) });
    const words = (await page.locator(".df-sheet").first().textContent().catch(() => "")) ?? "";
    check(/targeting your .+\./.test(words), `the question says what it targets (${words.replace(/\s+/g, " ").trim()})`);
    check((await page.locator(".df-card.is-targeted .df-target").count()) === 1, "the targeted card is marked on the board");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
