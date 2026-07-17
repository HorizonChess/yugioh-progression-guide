// Verifies the ban claim + claimed-ledger display:
//  - ban search is restricted to cards that existed by the cutoff (post-cutoff
//    cards excluded; structure-deck-only pre-cutoff cards included);
//  - clicking a result opens its DETAIL MODAL with a confirm step (not instant);
//  - the claimed section shows each single-pick reward's card image + caption
//    (wildcard → "Added to collection"; ban → greyed thumb + "Banned").
//
//   node scripts/drivers/rewards-ban-claimed.mjs

import { launchSeeded, reward, readSave, outPath } from "./_lib.mjs";

const DARK_MAGICIAN = 46986414;

const save = {
    id: "test-save", name: "Tester", currentSetIndex: 30, collection: [], savedDecks: [],
    bannedCardIds: [],
    rewards: [
        reward({ prizeId: "ban" }),
        // A pre-claimed wildcard so the claimed thumbnail renders on load.
        reward({
            prizeId: "wildcard-rare", wonFromPackName: "LOB", wonFromSetIndex: 0,
            status: "claimed", claimedDate: new Date().toISOString(), grantedCardId: DARK_MAGICIAN,
        }),
    ],
};

const { browser, page, errors } = await launchSeeded(save);
await page.waitForTimeout(1200);

// (A) Claimed wildcard row shows the picked card.
const wildRow = page.locator(".reward-card", { hasText: "Wildcard (Rare)" }).first();
await wildRow.waitFor({ timeout: 8000 });
console.log("CLAIMED WILDCARD →",
    "thumb:", await wildRow.locator(".reward-card__thumb img").count(),
    "| name:", JSON.stringify(await wildRow.locator(".reward-card__pick-name").innerText().catch(() => "")),
    "| caption:", JSON.stringify(await wildRow.locator(".reward-card__pick-caption").innerText().catch(() => "")));

// (B) Ban search timeline filtering.
await page.getByRole("button", { name: "Ban a Card" }).first().click();
const input = page.getByPlaceholder("Type a card name…");
await input.waitFor({ state: "visible", timeout: 8000 });
async function search(term) {
    await input.fill(""); await input.fill(term);
    await page.waitForTimeout(1600);
    return page.locator("ul li .font-bold").allInnerTexts();
}
console.log("Accesscode Talker (post-cutoff, expect 0):", (await search("Accesscode Talker")).length);
console.log("Command Knight (structure-deck, expect ≥1):", (await search("Command Knight")).length);

// (C) Confirm-in-details flow.
await search("Blue-Eyes White Dragon");
await page.locator("ul li button").first().click();
const confirm = page.getByRole("button", { name: "Ban This Card" });
console.log("CONFIRM MODAL appeared (not instant):", await confirm.isVisible().catch(() => false));
await confirm.click();
await page.waitForTimeout(1200);

// (D) After confirm: banned + claimed row with greyed thumb.
const banned = (await readSave(page)).bannedCardIds;
console.log("AFTER CONFIRM → bannedCardIds:", JSON.stringify(banned));
const banRow = page.locator(".reward-card", { hasText: "Ban a Card" })
    .filter({ has: page.locator(".reward-card__claimed-badge") }).first();
console.log("CLAIMED BAN →",
    "banned-thumb:", await banRow.locator(".reward-card__thumb--banned img").count().catch(() => 0),
    "| caption:", JSON.stringify(await banRow.locator(".reward-card__pick-caption").innerText().catch(() => "")));

await page.screenshot({ path: outPath("ban-claimed.png") });
console.log("ERRORS:", JSON.stringify(errors.slice(-5)));
await browser.close();
