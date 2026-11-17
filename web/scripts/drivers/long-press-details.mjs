// A long press on a card, on a phone, opens its details (the close-up): in the collection and in
// a duel's hand, where a tap picks the card up instead. The tap that ends the press does nothing
// more (the card isn't picked up); a plain tap still does what it did. A finger that slides
// (scrolling) opens nothing.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/long-press-details.mjs
import { launchBrowser, makeSave, openBotsArena, outPath, practiceAgainstBot, seedStorage, STORE_KEY, throughPregame, BASE } from "./_lib.mjs";

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { id: "d1", name: "Hold", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
const results = [];
const check = (what, ok, detail = "") => results.push(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
/** A finger on the element's middle for `ms`, sliding `slide` px down meanwhile, then lifted. */
async function hold(loc, ms, slide = 0) {
    const b = await loc.boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await touch("touchStart", x, y);
    for (let i = 1; i <= 5; i++) {
        await page.waitForTimeout(ms / 5);
        if (slide) await touch("touchMove", x, y + (slide * i) / 5);
    }
    await touch("touchEnd");
    await page.waitForTimeout(700);
}
const closeup = page.locator(".closeup");
async function closeIt() {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
}

try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });

    // 1. The collection: a long press opens the card (once); a slide opens nothing.
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });
    const art = page.locator("img[src*='/cards/']").first();
    await art.waitFor({ timeout: 15000 });
    await hold(art, 150, 40);
    check("collection: a sliding finger opens nothing", (await closeup.count()) === 0);
    await hold(art, 650);
    check("collection: a long press opens the card's details", (await closeup.count()) === 1, `${await closeup.count()} close-ups`);
    await page.screenshot({ path: outPath("long-press-collection-phone.png") });
    await closeIt();

    // 2. A duel: a long press on a card in your hand opens it, and doesn't pick it up.
    await openBotsArena(page);
    if (!(await page.locator(".op-side.is-open").count())) await page.locator(".op-door__lintel").click().catch(() => {});
    await practiceAgainstBot(page);
    await page.waitForURL(/duel/, { timeout: 30000 });
    await throughPregame(page);
    // (The last: the dev server's badge sits over the first, bottom left.)
    const card = page.locator(".df-hand__card.is-glow").last();
    await card.waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    await hold(card, 650);
    const name = await closeup.getAttribute("aria-label").catch(() => null);
    check("duel: a long press on a hand card opens its details", (await closeup.count()) === 1, name ?? "none");
    check("duel: and doesn't pick the card up", (await page.locator(".df-hand__card.is-raised, .df-pop").count()) === 0);
    await page.screenshot({ path: outPath("long-press-duel-phone.png") });
    await closeIt();
    check("duel: closed again", (await closeup.count()) === 0);

    // 3. A plain tap still picks the card up.
    await page.waitForTimeout(500);
    await card.tap({ timeout: 5000 }).catch((e) => errors.push(`tap: ${e.message.split(String.fromCharCode(10))[0]}`));
    await page.waitForTimeout(600);
    check("duel: a tap still picks the card up", (await page.locator(".df-pop").count()) === 1 && (await closeup.count()) === 0);
} finally {
    console.log(results.join("\n"));
    if (errors.length) console.log("page errors:", errors.slice(0, 5));
    process.exitCode = results.some((r) => r.startsWith("FAIL")) || !results.length ? 1 : 0;
    await browser.close();
}
