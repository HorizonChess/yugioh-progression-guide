// Guest saves moving into an account: a guest with two saves signs up on the
// letter and brings them along; another, already signed in, moves one from the
// Campaign list (after first putting the offer off). Moved saves leave the
// browser, land as solo series placed by set name, and unknown cards stay behind.
//
//   npm run test-server -w @ygo/api            (copies card data from api/.env's database)
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/guest-import.mjs

import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const suffix = Date.now().toString(36).slice(-5);
const PASSWORD = "heart of the cards";
const BLUE_EYES = "89631139_LOB-EN001_Ultra Rare";
const browser = await launchBrowser();
const problems = [];

const guestSave = (id, name, overrides = {}) =>
    makeSave({
        id,
        name,
        createdAt: Date.now(),
        lastPlayed: Date.now(),
        // A stale index: the name says where the run stands.
        currentSetIndex: 0,
        currentSetName: "Metal Raiders",
        collection: { [BLUE_EYES]: 2, "1_UNKNOWN_Common": 1 },
        matchHistory: [{ winner: "player", packName: "Legend of Blue Eyes White Dragon", date: new Date().toISOString() }],
        settings: { startSetIndex: 0, packsPerRound: 24 },
        savedDecks: [{ id: "deck-1", name: "Dragons", mainDeck: [89631139], extraDeck: [], sideDeck: [], createdAt: Date.now() }],
        ...overrides,
    });

async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/40[149]|Failed to load resource/.test(m.text()) && problems.push(`${new URL(page.url()).pathname}: ${m.text().split("\n")[0]}`));
    const series = async () => (await (await context.request.get(`${API}/api/series`)).json()).series ?? [];
    const localSaves = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{"saves":[]}').saves.length, STORE_KEY);
    return { context, page, series, localSaves };
}

try {
    // 1. A guest with two saves signs up on the letter; the saves come along.
    const pegasus = await newPage();
    const { page } = pegasus;
    const NAME = `Pegasus${suffix}`;
    await seedStorage(page, {
        [STORE_KEY]: JSON.stringify({ saves: [guestSave("guest-a", "Toon World"), guestSave("guest-b", "Second Run", { collection: {} })], activeSaveId: "guest-a" }),
    });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Press Start", exact: true }).click();
    await page.getByRole("button", { name: "Break the seal", exact: true }).click({ timeout: 15000 });
    await page.getByLabel("Duelist name", { exact: true }).fill(NAME);
    await page.getByText("✓ Available").waitFor({ timeout: 5000 });
    await page.getByLabel("Email", { exact: true }).fill(`${NAME.toLowerCase()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Accept the Invitation", exact: true }).click();
    const bring = page.getByLabel("Bring the 2 guest saves on this device into your account");
    await bring.waitFor({ timeout: 8000 });
    check(await bring.isChecked(), "sign-up: the letter offers to bring both guest saves, ticked");
    await page.waitForTimeout(1800);
    await page.screenshot({ path: outPath("guest-import-1-letter.png") });
    await page.getByRole("button", { name: "Enter the Kingdom", exact: true }).click();
    await page.waitForURL(/menu/, { timeout: 15000 });
    const moved = await pegasus.series();
    check(moved.length === 2 && moved.every((s) => s.mode === "solo"), "sign-up: both saves are now solo series in the account");
    const toonWorld = moved.find((s) => s.name === "Toon World");
    check(toonWorld?.currentSetName === "Metal Raiders", `the series stands where the save did, by set name (${toonWorld?.currentSetName})`);
    const detail = await (await pegasus.context.request.get(`${API}/api/series/${toonWorld?.id}`)).json();
    check(JSON.stringify(detail.me?.collection) === JSON.stringify({ [BLUE_EYES]: 2 }), "the binder came along, minus the card the game doesn't know");
    check(detail.me?.savedDecks?.[0]?.name === "Dragons" && detail.series?.matchHistory?.length === 1, "decks and match history came along");
    check((await pegasus.localSaves()) === 0, "the moved saves left this browser");
    await page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    await page.getByText("Toon World").waitFor();
    check((await page.getByRole("region", { name: "Guest saves" }).count()) === 0, "campaign: the series are listed and nothing is left to offer");

    // 2. Already signed in, with a guest save left on the device: put it off, then move it from the Campaign list.
    const croquet = await newPage();
    const CROQUET = `Croquet${suffix}`;
    await croquet.context.request.post(`${API}/api/auth/signup`, {
        headers: { origin: BASE },
        data: { email: `${CROQUET.toLowerCase()}@example.com`, password: PASSWORD, duelistName: CROQUET },
    });
    await seedStorage(croquet.page, { [STORE_KEY]: JSON.stringify({ saves: [guestSave("guest-c", "Castle Run")], activeSaveId: null }) });
    await croquet.page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    await croquet.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    const offer = croquet.page.getByRole("region", { name: "Guest saves" });
    await offer.waitFor({ timeout: 8000 });
    check(await offer.getByText("This device has 1 guest save").isVisible(), "campaign: a signed-in player is offered the guest save");
    await croquet.page.getByRole("button", { name: "NOT NOW" }).click();
    check((await offer.count()) === 0, "campaign: NOT NOW puts the offer away");
    // Next time the list opens (here, without a reload), it's offered again.
    await croquet.page.evaluate(() => sessionStorage.clear());
    await croquet.page.getByRole("button", { name: "◀ BACK TO MENU" }).click();
    await croquet.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    await offer.waitFor({ timeout: 8000 });
    await croquet.page.screenshot({ path: outPath("guest-import-2-offer.png") });
    await croquet.page.getByRole("button", { name: "MOVE TO ACCOUNT" }).click();
    const status = croquet.page.getByRole("status").filter({ hasText: "Moved 1 save" });
    await status.waitFor({ timeout: 8000 });
    check(/1 card the game no longer knows stayed behind/.test(await status.textContent()), "campaign: moved, and told about the unknown card");
    await croquet.page.getByText("Castle Run").waitFor();
    check((await croquet.series()).length === 1, "campaign: the save is a series in the account");

    // 3. Signed out again, the guest list is empty: the saves moved, they weren't copied.
    await croquet.page.getByRole("button", { name: "◀ BACK TO MENU" }).click();
    await croquet.page.getByRole("button", { name: /^SIGN OUT/ }).click();
    await croquet.page.getByRole("link", { name: /^SIGN IN/ }).waitFor();
    await croquet.page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    await croquet.page.getByText("No save files found.").waitFor({ timeout: 8000 });
    check(true, "signed out: the guest list no longer has the moved save");
} catch (error) {
    check(false, `driver stopped early: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
} finally {
    check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(" | ")}` : ""}`);
    await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
