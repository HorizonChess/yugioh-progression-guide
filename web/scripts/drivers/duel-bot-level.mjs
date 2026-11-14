// The bot's level: the launcher offers Easy, Normal and Hard (Normal by default), remembers the
// choice, and a practice match started at Hard is played against "Practice Bot (Hard)". Then a few
// turns are played (the bot thinking ahead), to see it answers in good time.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/duel-bot-level.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { id: "d1", name: "Levels", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const shot = (n) => page.screenshot({ path: outPath(`duel-bot-level-${n}-${phone ? "phone" : "desktop"}.png`) });
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    const old = btn("End it, start a new one"), practice = btn("Practice against the bot");
    await old.or(practice).first().waitFor({ timeout: 15000 });
    if (await old.count()) await old.click();
    await practice.waitFor();

    const levels = page.getByRole("radiogroup", { name: "How well the bot plays" }).getByRole("radio");
    check((await levels.allTextContents()).join(",") === "Easy,Normal,Hard", "Easy, Normal and Hard are offered");
    check((await page.getByRole("radio", { name: "Normal" }).getAttribute("aria-checked")) === "true", "Normal by default");
    await page.getByRole("radio", { name: "Hard" }).click();
    check((await page.getByRole("radio", { name: "Hard" }).getAttribute("aria-checked")) === "true", "Hard is chosen");
    await shot("launcher");

    // Remembered on the next visit.
    await page.reload({ waitUntil: "networkidle" });
    await practice.waitFor();
    check((await page.getByRole("radio", { name: "Hard" }).getAttribute("aria-checked")) === "true", "the choice is remembered");

    await practice.click();
    await page.waitForURL(/duel/, { timeout: 30000 });
    await page.getByText("Practice Bot (Hard)").first().waitFor({ timeout: 15000 });
    check(true, "the match is against Practice Bot (Hard)");

    await throughPregame(page);
    const duel = btn("Duel!");
    if (await duel.count()) await duel.click();

    // A few turns: end each of ours at once, and time how long the bot takes with its own.
    let slowest = 0;
    for (let turn = 0; turn < 4; turn++) {
        const end = page.getByRole("tab", { name: "End", exact: true }).and(page.locator(":enabled"));
        const pass = page.getByRole("button", { name: /^(Pass|No|Don't)/ }).first();
        const t0 = Date.now();
        await end.or(pass).first().waitFor({ timeout: 60000 });
        slowest = Math.max(slowest, Date.now() - t0);
        if (await pass.count()) await pass.click();
        else await end.click();
        await page.waitForTimeout(600);
    }
    await shot("board");
    check(slowest < 20000, `the bot answers in good time (slowest wait ${slowest} ms)`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
