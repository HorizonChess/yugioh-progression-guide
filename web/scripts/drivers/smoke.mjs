// App-wide smoke test: every route renders without uncaught errors, the nav
// highlights the right tab, removed routes 404, the root goes to the menu, and
// the deck builder's add / drag / drag-to-remove still work.
//
// The seeded save is deliberately PARTIAL (no matchHistory/settings, collection
// as an array) to prove old or hand-edited saves load with defaults.
//
//   node scripts/drivers/smoke.mjs

import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const BLUE_EYES = 89631139;
const DARK_MAGICIAN = 46986414;

const save = makeSave({
    currentSetIndex: 0,
    collection: { [`${BLUE_EYES}_LOB_Ultra Rare`]: 3, [`${DARK_MAGICIAN}_LOB_Ultra Rare`]: 3 },
});

const NAV_ROUTES = {
    "/timeline": "CAMPAIGN",
    "/collection": "COLLECTION",
    "/deck-builder": "DECK BUILDER",
    "/rewards": "REWARDS",
    "/packs": null,
    "/record-match": null,
};

let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const browser = await launchBrowser();

async function seededPage(seed = save) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seedStorage(page, { [STORE_KEY]: seed && JSON.stringify({ saves: [seed], activeSaveId: seed.id }) });
    return { page, errors };
}

// 1. Every route renders; nav tab highlight.
{
    const { page, errors } = await seededPage();
    for (const route of [...Object.keys(NAV_ROUTES), "/menu"]) {
        errors.length = 0;
        await page.goto(`${BASE}${route}/`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        check(errors.length === 0, `${route} renders without page errors ${errors.join(" | ")}`);
        const expected = NAV_ROUTES[route];
        if (expected) {
            const active = await page.locator('a[aria-current="page"]').innerText().catch(() => "");
            check(active.trim() === expected, `${route} nav highlights ${expected} (got "${active.trim()}")`);
        }
    }
    const navName = await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" }).then(() =>
        page.locator("h2.text-primary").first().innerText()
    );
    check(navName.trim().toUpperCase() === "GUEST", `nav names a signed-out player Guest (got "${navName.trim()}")`);
    await page.close();
}

// 2. Removed routes 404; the root goes straight to the menu.
{
    const { page } = await seededPage(null);
    for (const route of ["/map", "/start", "/onboarding", "/dev/auth"]) {
        const res = await page.goto(`${BASE}${route}/`, { waitUntil: "domcontentloaded" });
        check(res?.status() === 404, `${route} is gone (status ${res?.status()})`);
    }
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/menu\/?$/, { timeout: 8000 }).catch(() => {});
    check(/\/menu\/?$/.test(page.url()), `/ → /menu (at ${page.url()})`);
    await page.close();
}

// 3. Deck builder: double-click add, drag search → deck, drag-to-remove.
{
    const { page, errors } = await seededPage();
    await page.goto(`${BASE}/deck-builder/`, { waitUntil: "networkidle" });
    const total = page.locator('[title="Total Cards"] span');
    const search = (name) => page.locator(`.bg-lime img[alt="${name}"]`).first();
    await search("Blue-Eyes White Dragon").waitFor({ timeout: 10000 });

    await search("Blue-Eyes White Dragon").dblclick();
    check((await total.innerText()) === "1", `double-click adds to main deck (total ${await total.innerText()})`);

    const emptySlot = page.locator(".grid-cols-10 > div").nth(5);
    await search("Dark Magician").dragTo(emptySlot);
    check((await total.innerText()) === "2", `drag from search adds to main deck (total ${await total.innerText()})`);

    const deckCard = page.locator('.grid-cols-10 img[alt="Dark Magician"]').first();
    await deckCard.dragTo(page.locator(".bg-wood-dark").first());
    check((await total.innerText()) === "1", `drag out of the deck removes it (total ${await total.innerText()})`);
    check(errors.length === 0, `deck builder raised no page errors ${errors.join(" | ")}`);
    await page.screenshot({ path: outPath("smoke-deck-builder.png") });
    await page.close();
}

// 4. The partial save was normalised and re-persisted with full defaults.
{
    const { page } = await seededPage();
    await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
    const persisted = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).saves[0], STORE_KEY);
    check(Array.isArray(persisted.matchHistory) && typeof persisted.settings === "object",
        "partial save re-persisted with matchHistory + settings defaults");
    await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
