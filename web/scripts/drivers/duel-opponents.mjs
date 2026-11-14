// Choosing who to practice against, chess.com style: the Bots Arena's roster (the practice
// bot and solo, then the duelists from the anime, weakest first, each with their face and rating). Picking
// one puts them on the stage, with their eras to choose from; the match is against them, by name,
// and the choice is remembered for next time. A guest practice match.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/duel-opponents.mjs          (PHONE=1 for a phone)

import { launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame, openBotsArena } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { id: "d1", name: "Mine", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const starts = [];
page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/duels\/practice$/.test(r.url())) starts.push(r.postDataJSON());
});
const shot = (n) => page.screenshot({ path: outPath(`duel-opponents-${n}-${phone ? "phone" : "desktop"}.png`) });
const btn = (name) => page.getByRole("button", { name, exact: true });
const radio = (name) => page.getByRole("radio", { name, exact: true });
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await openBotsArena(page);

    // The roster: the practice bot and solo, then sixteen duelists in three groups, weakest first.
    const roster = page.getByRole("radiogroup", { name: "Opponents" });
    await roster.waitFor({ timeout: 5000 });
    const names = await roster.getByRole("radio").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    check(names.length === 18 && names[0] === "Practice Bot" && names[1] === "Solo", `the roster has the practice bot, solo and 16 duelists (${names.length})`);
    const groups = await page.locator(".op-group h4").allTextContents();
    check(groups.join(",") === "Practice,Beginner,Intermediate,Advanced", `grouped by strength (${groups.join(", ")})`);
    const ratings = await page.locator(".op-tile small").allTextContents();
    const numbers = ratings.slice(2).map(Number);
    check(numbers.every((n, i) => i === 0 || n >= numbers[i - 1]), `weakest first (${numbers.join(" ")})`);
    const faces = await page.locator(".op-face:not(.op-face--bot)").evaluateAll((els) => els.filter((e) => /sprites\//.test(getComputedStyle(e).backgroundImage)).length);
    check(faces === 16, `each duelist shows their face (${faces})`);
    await page.waitForTimeout(600); // (the faces fade in)
    await shot("roster");

    // Joey on stage: his name, rating, level, and his three eras; Battle City chosen.
    await radio("Joey Wheeler").click();
    await page.getByText("Joey Wheeler", { exact: true }).first().waitFor();
    check((await page.locator(".op-name").textContent()) === "Joey Wheeler", "Joey takes the stage");
    check(/1200/.test((await page.locator(".op-rating").textContent()) ?? "") && /Normal/.test((await page.locator(".op-rating").textContent()) ?? ""), "with his rating and level");
    const figure = page.locator(".op-figure img");
    check(/joey_neutral_transparent/.test((await figure.getAttribute("src")) ?? ""), "and his sprite");
    const eras = page.getByRole("radiogroup", { name: "Joey's deck" }).getByRole("radio");
    check((await eras.allTextContents()).join(",") === "Duelist Kingdom,Battle City,Waking the Dragons", "his three eras are offered");
    await radio("Battle City").click();
    check((await radio("Battle City").getAttribute("aria-checked")) === "true", "Battle City is chosen");
    check(/Joey Wheeler \(Battle City\) Deck/.test((await page.locator(".op-credit").textContent()) ?? ""), "the deck's source is credited");
    await page.waitForTimeout(600); // (his figure steps in)
    await shot("joey");

    // Remembered on the next visit.
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("radiogroup", { name: "Opponents" }).waitFor({ timeout: 15000 });
    check((await page.locator(".op-name").textContent()) === "Joey Wheeler" && (await radio("Battle City").getAttribute("aria-checked")) === "true", "the choice is remembered");

    // The match is against him.
    await page.getByRole("button", { name: /^Duel Joey/ }).click();
    await page.waitForURL(/duel/, { timeout: 30000 });
    check(starts.at(-1)?.duelist?.id === "joey" && starts.at(-1)?.duelist?.era === "bc", `the match is asked for against Joey, Battle City (${JSON.stringify(starts.at(-1)?.duelist)})`);
    await page.getByText("Joey Wheeler").first().waitFor({ timeout: 15000 });
    check(true, "the pregame names Joey Wheeler");
    await throughPregame(page);
    const duel = btn("Duel!");
    if (await duel.count()) await duel.click();
    await page.getByText(/^Turn \d+/).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    check((await page.getByText("Joey Wheeler").count()) > 0, "the board names Joey Wheeler");
    await shot("board");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} catch (error) {
    console.log(`FAIL  ${error.message}`);
    failures++;
    await shot("failure").catch(() => {});
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
