// The collection wall draws only the rows in view: with thousands of cards owned, scrolling a long
// way keeps a few dozen cards in the page (not every card passed on the way), the scrollbar still
// spans the whole collection, cards are on screen wherever you stop, and the chapter chips follow
// (and jump).
//
// Needs the dev server, and a network for the card data (the card list comes from YGOPRODeck).
//
//   node scripts/drivers/collection-scroll-window.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const res = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php?type=Effect%20Monster");
const cards = (await res.json()).data.filter((c) => c.card_sets?.length);
const collection = {};
for (const c of cards.slice(0, 3000)) {
    const s = c.card_sets[0];
    collection[`${c.id}_${s.set_code}_${s.set_rarity}`] = 1;
}
const owned = Object.keys(collection).length;
console.log(`seeded ${owned} cards`);

const browser = await launchBrowser();
let failed = false;
const check = (ok, what) => {
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

for (const [name, viewport, opts] of [["desktop", { width: 1440, height: 900 }, {}], ["phone", { width: 390, height: 844 }, { isMobile: true, hasTouch: true }]]) {
    const page = await browser.newPage({ viewport, ...opts });
    page.on("pageerror", (e) => { failed = true; console.log(`FAIL page error: ${e.message}`); });
    const save = makeSave({ currentSetIndex: 30, collection });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".cvault", { timeout: 60_000 });
    await page.waitForTimeout(800);

    const probe = () => page.evaluate(() => {
        const box = document.querySelector(".cscroll");
        const r = box.getBoundingClientRect();
        const inView = [...document.querySelectorAll(".cvault")].filter((f) => { const b = f.getBoundingClientRect(); return b.bottom > r.top + 60 && b.top < r.bottom; }).length;
        return { drawn: document.querySelectorAll(".cvault").length, inView, height: box.scrollHeight, top: box.scrollTop, chip: document.querySelector(".cscroll__chip--on")?.getAttribute("data-chip") ?? null };
    });

    const first = await probe();
    check(first.drawn < 120, `${name}: ${first.drawn} cards drawn at the top, of ${owned}`);

    // Scroll right down the wall in swipes, as a reader would.
    let worst = first.drawn, minInView = Infinity;
    for (let i = 0; i < 60; i++) {
        await page.evaluate(() => document.querySelector(".cscroll").scrollBy({ top: 1400, behavior: "instant" }));
        await page.waitForTimeout(60);
        const p = await probe();
        worst = Math.max(worst, p.drawn);
        minInView = Math.min(minInView, p.inView);
    }
    await page.waitForTimeout(300);
    const deep = await probe();
    check(worst < 150, `${name}: never more than ${worst} cards drawn while scrolling`);
    check(minInView > 0, `${name}: cards were on screen at every stop (fewest ${minInView})`);
    check(deep.top > first.height * 0.3, `${name}: scrolled a long way (${Math.round(deep.top)}px of ${deep.height}px)`);
    check(Math.abs(deep.height - first.height) < first.height * 0.05, `${name}: the scroll height held steady (${first.height} → ${deep.height})`);
    console.log(`  chip at depth: ${deep.chip}`);
    await page.screenshot({ path: outPath(`collection-window-${name}-deep.png`) });

    // Jump to the last chapter by its chip, then back to the first.
    // (Chapters that hold cards of the seeded collection: the others have nothing to scroll to.)
    const chips = await page.locator(".cscroll__chip").evaluateAll((els) => els.filter((e) => parseInt(e.querySelector("small")?.textContent ?? "0", 10) > 0).map((e) => e.getAttribute("data-chip")));
    if (chips.length > 2) {
        const last = chips.filter((c) => c !== "MORE").at(-1);
        console.log(`  chapters with cards: ${chips.length}, jumping to ${last}`);
        await page.locator(`.cscroll__chip[data-chip="${last}"]`).click();
        await page.waitForTimeout(1500);
        const at = await probe();
        // Its first card is drawn and sits just under the chips.
        const under = await page.evaluate((k) => {
            const box = document.querySelector(".cscroll").getBoundingClientRect();
            const chips = document.querySelector(".cscroll__chips").getBoundingClientRect().bottom;
            const card = document.querySelector(`.cvault[data-chapter="${k}"]`);
            return card ? Math.round(card.getBoundingClientRect().top - chips) : null;
        }, last);
        check(under !== null && under >= -30 && under < 120, `${name}: the last chapter's chip (${last}) puts its first card under the chips (${under}px below them, ${at.drawn} cards drawn)`);
        await page.locator(`.cscroll__chip[data-chip="${chips[0]}"]`).click();
        await page.waitForTimeout(1500);
        check((await probe()).top < 400, `${name}: the first chip comes back to the top`);
    }
    await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
