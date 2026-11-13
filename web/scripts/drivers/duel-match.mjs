// A best-of-3 match against the bot: rock-paper-scissors opens it and its winner chooses who goes
// first; a lost game leads to side decking and the loser choosing who goes first; two games lost
// lose the match.
//
//   npm run test-server -w @ygo/api
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/duel-match.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const SIDE = [66788016, 66788016, 4206964]; // Fissure x2, Trap Hole
const deck = { id: "d1", name: "Match", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: SIDE, extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([...MAIN, ...SIDE].map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
/** Loses the game on the board: the duel menu, Surrender, and yes. */
const surrender = async () => {
    await page.locator(".df-phases").waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Duel menu" }).click();
    await button("Surrender").click();
    await button("Surrender").click();
};
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    const old = page.getByRole("button", { name: "End it, start a new one" });
    const practice = page.getByRole("button", { name: "Practice against the bot" });
    await old.or(practice).first().waitFor({ timeout: 15000 });
    if (await old.count()) await old.click();
    await practice.click();
    await page.waitForURL(/duel/, { timeout: 30000 });

    // Game 1 opens on rock-paper-scissors.
    await page.getByText("Game 1 of 3").waitFor({ timeout: 15000 });
    check((await page.getByText("Rock, paper, scissors: the winner chooses who goes first.").count()) === 1, "game 1 opens on rock-paper-scissors");
    check((await button("Rock").count()) + (await button("Paper").count()) + (await button("Scissors").count()) === 3, "three hands to throw");
    await page.screenshot({ path: outPath(`duel-match-rps-${tag}.png`) });
    let chose = false;
    for (let i = 0; i < 40 && !(await page.locator(".df-phases").count()); i++) {
        if (await button("Paper").count()) await button("Paper").click().catch(() => {});
        else if (await button("Go second").count()) {
            check((await page.getByText("You won, so you choose who goes first.").count()) === 1, "winning it, you choose who goes first");
            await page.screenshot({ path: outPath(`duel-match-choose-${tag}.png`) });
            await button("Go second").click();
            chose = true;
        }
        await page.waitForTimeout(400);
    }
    console.log(chose ? "      (you won rock-paper-scissors)" : "      (the bot won rock-paper-scissors and went first)");
    await page.locator(".df-phases").waitFor({ timeout: 20000 });
    check(/G1 0–0/.test((await page.locator(".df-turn").textContent()) ?? ""), "the board shows the game and the score");

    // Lose game 1: on to side decking, and the loser chooses who goes first.
    await surrender();
    await page.getByRole("heading", { name: "Practice Bot wins game 1" }).waitFor({ timeout: 15000 });
    check(((await page.locator(".df-result__score").textContent()) ?? "").replace(/\s/g, "") === "You0–1PracticeBot", "the result shows the match score, 0–1");
    await page.screenshot({ path: outPath(`duel-match-game1-${tag}.png`) });
    await button("To game 2: side decking").click();
    await page.getByText("Game 2 of 3").waitFor({ timeout: 15000 });
    check((await page.getByText("You lost the last game, so you choose who goes first.").count()) === 1, "the loser of game 1 chooses who goes first");
    const part = (label) => page.locator(".pg-part").filter({ hasText: label });
    check(((await part("Main Deck").locator("b span").textContent()) ?? "") === "40/40" && ((await part("Side Deck").locator("b span").textContent()) ?? "") === "3/3", "side decking shows the deck, 40 and 3");
    // One card out of the main deck: a part is off its size, so it can't be played yet.
    await part("Main Deck").locator(".pg-card").first().click();
    check(await button("Play with these changes").isDisabled(), "a deck a card short can't be played");
    // A Fissure in from the side deck: one in, one out.
    await part("Side Deck").getByRole("button", { name: /Fissure/ }).first().click();
    check(((await part("Main Deck").locator("b span").textContent()) ?? "") === "40/40" && !(await button("Play with these changes").isDisabled()), "one in for one out makes it playable");
    await page.screenshot({ path: outPath(`duel-match-siding-${tag}.png`) });
    await button("Play with these changes").click();
    await page.getByText("Your deck is in.").waitFor({ timeout: 8000 });
    await button("Go first").click();
    await page.locator(".df-phases").waitFor({ timeout: 20000 });
    check(/G2 0–1/.test((await page.locator(".df-turn").textContent()) ?? ""), "game 2 starts at 0–1");
    check(/Your turn/.test((await page.locator(".df-turn").textContent()) ?? ""), "and you go first, as chosen");

    // Lose game 2: the match is lost, 0–2, with no third game.
    await surrender();
    await page.getByRole("heading", { name: "Practice Bot wins the match" }).waitFor({ timeout: 15000 });
    check(((await page.locator(".df-result__score").textContent()) ?? "").replace(/\s/g, "") === "You0–2PracticeBot", "two games lost lose the match, 0–2");
    await page.screenshot({ path: outPath(`duel-match-over-${tag}.png`) });
    await button("Back to the board").click();
    await page.waitForURL(/record-match/, { timeout: 15000 });
    await practice.waitFor({ timeout: 15000 });
    check((await old.count()) === 0, "no match is left open: a new one can start");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
