// Question: the bot plays a copy of your deck and activates Question, so you have to name the first
// monster in its Graveyard from memory. Its Graveyard and the log are shut meanwhile, and the name
// is typed and picked from the matching monsters.
//
//   npm run test-server -w @ygo/api   (WEB_DIST serves the built web on the same port)
//   node web/scripts/drivers/duel-question.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const QUESTION = 38723936, GRACEFUL_CHARITY = 79571449, CURSE_OF_DRAGON = 28279543, DARK_MAGICIAN = 36996508;
// Monsters the bot Tributes for (so its Graveyard fills), Graceful Charity to discard more, and small Normal Monsters.
const SMALL = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 9159938, 53375573, 43500484, 40826495];
const three = (id) => [id, id, id];
const mainDeck = [...three(QUESTION), ...three(GRACEFUL_CHARITY), ...three(CURSE_OF_DRAGON), ...three(DARK_MAGICIAN), ...SMALL.flatMap(three).slice(0, 28)];
const deck = { id: "d1", name: "Question", mainDeck, sideDeck: [], extraDeck: [] };
const save = makeSave({
    currentSetIndex: 0,
    collection: Object.fromEntries([...new Set(mainDeck)].map((id) => [`${id}_LOB_Common`, 3])),
    savedDecks: [deck],
});

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    const asked = page.getByRole("heading", { name: "Declare a monster's name" });
    // The shuffle decides when the bot has Question and a monster in its Graveyard: a duel that
    // ends first is played again.
    let got = false;
    for (let attempt = 0; attempt < 10 && !got; attempt++) {
        await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
        // (Playing here is what the board opens on.)
        const old = page.getByRole("button", { name: "End it, start a new one" });
        const practice = page.getByRole("button", { name: "Practice against the bot" });
        await old.or(practice).first().waitFor({ timeout: 15000 });
        if (await old.count()) await old.click();
        await practice.click();
        await page.waitForURL(/duel/, { timeout: 30000 });
        await throughPregame(page);
        const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
        const listed = page.locator(".df-sheet__list .df-listcard");
        const pass = page.getByRole("button", { name: /^(Pass|No|Don't)/ });
        for (let i = 0; i < 220 && !got; i++) {
            await page.waitForTimeout(500);
            if (await asked.count()) { got = true; break; }
            if (await page.getByText(/ wins$/).count()) break;
            // Your side does nothing: it passes, ends its turns and discards what it must.
            const discard = (await page.getByText("Choose the card to discard").count()) ? page.locator(".df-hand__card.is-glow").first() : page.locator("#none");
            if (await discard.count()) await discard.click({ force: true }).catch(() => {});
            else if (await pass.count()) await pass.first().click().catch(() => {});
            else if (await end.count()) await end.click().catch(() => {});
            else if (await listed.count()) {
                await listed.first().click().catch(() => {});
                const ok = page.getByRole("button", { name: /^(Confirm|Done|OK)/ });
                if (await ok.count()) await ok.first().click().catch(() => {});
            }
        }
    }
    check(got, "the bot's Question asks you to name a monster");
    await page.waitForTimeout(600);
    const sheet = page.locator(".df-sheet");
    const words = (await sheet.textContent()) ?? "";
    check(/For Question: name the first monster in Practice Bot's Graveyard.*You can't look/.test(words), "the question says what to name, and that you can't look");
    await page.screenshot({ path: outPath(`duel-question-asked-${tag}.png`) });

    // The rival's Graveyard is shut: a tap says so and opens nothing.
    const graveyard = page.locator('.df-pile[data-label="GY"]').first();
    await graveyard.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    check((await page.locator(".df-notice").textContent().catch(() => ""))?.includes("can't look at Practice Bot's Graveyard"), "tapping the rival's Graveyard says it's shut");
    check((await page.getByRole("heading", { name: /Practice Bot's Graveyard/ }).count()) === 0, "and its cards aren't listed");
    if (!phone) check((await page.locator(".df-log__list").count()) === 0 && (await page.getByText("Closed while Question is being resolved.").count()) > 0, "the log is closed too");

    // Type a few letters: only monsters are offered. Pick one and declare it.
    const input = page.getByLabel("Card name");
    await input.fill("dark ma");
    const matches = sheet.locator(".df-sheet__list .df-listcard");
    await matches.first().waitFor({ timeout: 15000 }).catch(() => {});
    const names = await matches.locator("span").allTextContents();
    check(names.length > 0 && names.every((n) => /dark ma/i.test(n)), `matching cards are offered (${names.slice(0, 4).join(", ")})`);
    check(!names.some((n) => /Dark Magic Attack|Dark Magic Curtain|Dark Magic Ritual/.test(n)), "Spells and Traps by that name are left out");
    const declare = sheet.getByRole("button", { name: /^Declare/ });
    check(await declare.isDisabled(), "nothing can be declared before a card is picked");
    const pick = matches.filter({ hasText: /^Dark Magician$/ }).first();
    await ((await pick.count()) ? pick : matches.first()).click();
    const label = (await declare.textContent()) ?? "";
    check(/^Declare \S/.test(label) && !(await declare.isDisabled()), `the button names the card (${label})`);
    await page.screenshot({ path: outPath(`duel-question-picked-${tag}.png`) });
    await declare.click();
    await asked.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    check((await asked.count()) === 0, "the name is taken and the duel goes on");
    await page.locator(".df-declare").waitFor({ timeout: 8000 }).catch(() => {});
    check(/You declare/.test((await page.locator(".df-declare").textContent().catch(() => "")) ?? ""), "the board shows what you declared");
    await page.waitForTimeout(3500);
    // Resolved: the Graveyard opens again.
    await graveyard.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    check((await page.locator(".df-notice").filter({ hasText: "can't look" }).count()) === 0, "once it has resolved, the Graveyard opens again");
    await page.screenshot({ path: outPath(`duel-question-after-${tag}.png`) });
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
