// Verifies the 3-pack reveal for tournament AND core (pity) rewards:
//  - tournament packs (≤5 cards) use the SINGLE-row layout (slab shrinks to the
//    cards, no tall empty box) with extra gap above the controls;
//  - core/pity packs (9 cards) keep the classic 5+4 two-row layout.
//
//   node scripts/drivers/rewards-packs.mjs

import { launchSeeded, reward, outPath } from "./_lib.mjs";

async function openReveal(save, shot) {
    const { browser, page, errors } = await launchSeeded(save);
    await page.getByRole("button", { name: "Open 3 Packs" }).first().click();
    await page.locator(".pack-grid").waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Flip All" }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => {
        const grid = document.querySelector(".pack-grid");
        const s = getComputedStyle(grid);
        return {
            classes: grid.className.trim(),
            rows: s.gridTemplateRows,
            top: grid.querySelectorAll(".pack-grid__cell--top").length,
            bottom: grid.querySelectorAll(".pack-grid__cell--bottom").length,
        };
    });
    await page.screenshot({ path: outPath(shot) });
    await browser.close();
    return { info, errors };
}

const tourney = await openReveal(
    makeTourney(),
    "packs-tournament.png"
);
console.log("TOURNAMENT (expect --single, one row):", JSON.stringify(tourney.info));

const core = await openReveal(makeCore(), "packs-core.png");
console.log("CORE/PITY (expect two rows, 5+4):", JSON.stringify(core.info));

console.log("ERRORS:", JSON.stringify([...tourney.errors, ...core.errors].slice(-5)));

function makeTourney() {
    return {
        id: "test-save", name: "Tester", currentSetIndex: 30, collection: [], savedDecks: [],
        bannedCardIds: [],
        rewards: [reward({ prizeId: "tournament-packs", wonFromSetIndex: 30 })],
    };
}
function makeCore() {
    return {
        id: "test-save", name: "Tester", currentSetIndex: 30, collection: [], savedDecks: [],
        bannedCardIds: [],
        rewards: [reward({ prizeId: "pity-packs", wonFromSetIndex: 5 })],
    };
}
