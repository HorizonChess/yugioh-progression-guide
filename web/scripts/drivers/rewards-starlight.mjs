// Verifies the Starlight Rare wildcard claim (full-catalog search):
//  - the search is gated to cards released BEFORE the won pack (a pure-date
//    rule, so off-timeline classics are reachable);
//  - clicking a result opens its DETAIL MODAL with a confirm step (not instant);
//  - confirming grants the card at Starlight Rare and moves the reward to the
//    claimed ledger, where its thumbnail + caption show.
//
//   node scripts/drivers/rewards-starlight.mjs

import { launchSeeded, reward, readSave, outPath } from "./_lib.mjs";

const DARK_MAGICIAN = 46986414; // LOB (2002) — dated well before a late pack.

// Won from a late set so the "released before this pack" gate is permissive;
// wonFromSetIndex=30 matches the seeded currentSetIndex.
const save = {
    id: "test-save", name: "Tester", currentSetIndex: 30, collection: {}, savedDecks: [],
    bannedCardIds: [],
    rewards: [reward({ prizeId: "wildcard-starlight", wonFromPackName: "Late Pack", wonFromSetIndex: 30 })],
};

const { browser, page, errors } = await launchSeeded(save);
await page.waitForTimeout(1000);

// (A) Available reward offers the Starlight search.
const searchBtn = page.getByRole("button", { name: "Search Card" });
console.log("STARLIGHT reward shows 'Search Card':", await searchBtn.first().isVisible().catch(() => false));
await searchBtn.first().click();

const input = page.getByPlaceholder("Type a card name…");
await input.waitFor({ state: "visible", timeout: 12000 });

// (B) Search a classic — eligible (printed long before the pack).
await input.fill("Dark Magician");
await page.waitForTimeout(1800);
const hits = await page.locator("ul li .font-bold").allInnerTexts();
console.log("Dark Magician search hits (expect >=1):", hits.length);

// (C) Confirm-in-details flow.
await page.locator("ul li button").first().click();
const confirm = page.getByRole("button", { name: "Claim as Starlight" });
console.log("CONFIRM MODAL appeared (not instant):", await confirm.isVisible().catch(() => false));
await confirm.click();
await page.waitForTimeout(1200);

// (D) Claimed: reward moved + granted card recorded at Starlight Rare.
const saved = await readSave(page);
const claimedEntry = saved.rewards.find((r) => r.prizeId === "wildcard-starlight");
console.log("AFTER CONFIRM → status:", claimedEntry?.status, "| grantedCardId:", claimedEntry?.grantedCardId);
const collectionKeys = Object.keys(saved.collection || {});
console.log("COLLECTION keys (expect a Starlight Rare copy):", JSON.stringify(collectionKeys));

// (E) Claimed ledger row shows the picked card + caption.
const claimedRow = page.locator(".reward-card", { hasText: "Wildcard (Starlight Rare)" }).first();
console.log("CLAIMED STARLIGHT →",
    "thumb:", await claimedRow.locator(".reward-card__thumb img").count().catch(() => 0),
    "| caption:", JSON.stringify(await claimedRow.locator(".reward-card__pick-caption").innerText().catch(() => "")));

await page.screenshot({ path: outPath("starlight.png") });
console.log("ERRORS:", JSON.stringify(errors.slice(-5)));
console.log("granted DM id matches:", claimedEntry?.grantedCardId === DARK_MAGICIAN);
await browser.close();
