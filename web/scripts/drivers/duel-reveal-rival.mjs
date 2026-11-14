// Cards shown to you, against a rival the driver plays itself (_rival.mjs), so each happens for sure:
//  1. The rival searches with Reinforcement of the Army and shows you the Warrior: the banner stays
//     up (still there seconds later) until you say "Got it".
//  2. You play Confiscation: their hand is shown in the pick itself, with no banner before it.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/duel-reveal-rival.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, outPath } from "./_lib.mjs";
import { activate, rivalDuel } from "./_rival.mjs";

const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const REINFORCEMENT = 32807846, CONFISCATION = 17375316;
// Legend of Blue Eyes Normal Monsters, Warriors among them (for Reinforcement to find).
const MONSTERS = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495];
const deckWith = (card) => [card, card, card, ...Array.from({ length: 37 }, (_, i) => MONSTERS[i % MONSTERS.length])];

const browser = await launchBrowser();
const errors = [];
let game;
try {
    const { you, rival, duelId } = await rivalDuel(browser, { you: deckWith(CONFISCATION), rival: deckWith(REINFORCEMENT), viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    const page = you.page;
    page.on("pageerror", (e) => errors.push(e.message));
    // Every reveal banner that comes up, with whether it asked for a "Got it" (kept from the page itself).
    await page.addInitScript(() => {
        window.__reveals = [];
        new MutationObserver(() => {
            for (const el of document.querySelectorAll(".df-reveal:not([data-seen])")) {
                el.setAttribute("data-seen", "");
                window.__reveals.push({ text: el.querySelector("p")?.textContent ?? "", ack: !!el.querySelector(".df-reveal__ok") });
            }
        }).observe(document, { childList: true, subtree: true });
    });
    game = await rival.play(duelId, (p) => activate(p, REINFORCEMENT));

    // Rock beats the rival's Scissors; you go second, so the rival plays first.
    await page.goto(`${BASE}/duel/?id=${duelId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Rock", exact: true }).click({ timeout: 20000 });
    await rival.api("POST", `/api/duels/${duelId}/pregame`, { rps: "scissors" });
    await page.getByRole("button", { name: "Go second", exact: true }).click({ timeout: 20000 });
    await page.locator(".df-phases").waitFor({ timeout: 30000 });

    const banner = page.locator(".df-reveal");
    const gotIt = page.getByRole("button", { name: "Got it" });
    const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
    const confiscation = page.locator(`[aria-label="Card in hand ${CONFISCATION}"]`).first();
    const pick = page.locator(".df-sheet__list .df-listcard");
    let shownToYou = false, confiscated = false;
    for (let i = 0; i < 300 && !(shownToYou && confiscated); i++) {
        if (await page.getByText(/ wins( game \d+)?$/).count()) break;
        await page.waitForTimeout(400);
        // 1. The rival's Warrior, shown to you: it waits.
        if (!shownToYou && (await gotIt.count())) {
            const words = (await banner.textContent()) ?? "";
            check(/shows you 1 card from the hand/.test(words), `the rival shows you the card they searched (${words})`);
            await page.waitForTimeout(3500);
            check((await gotIt.count()) === 1, "it's still up 3.5 s later, waiting for you");
            await page.screenshot({ path: outPath(`duel-reveal-rival-got-it-${tag}.png`) });
            await gotIt.click();
            await banner.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
            check((await banner.count()) === 0, "Got it puts it away");
            shownToYou = true;
            continue;
        }
        if (await gotIt.count()) { await gotIt.click(); continue; }
        // 2. Your Confiscation: the pick of their hand comes with no banner first.
        if (!confiscated && (await end.count()) && (await confiscation.count())) {
            const before = await page.evaluate(() => window.__reveals.length);
            await confiscation.click({ force: true });
            // (Not offered at this moment, a Battle Phase say: put it down and move on.)
            const go = page.getByRole("button", { name: "Activate", exact: true });
            if (!(await go.waitFor({ timeout: 1500 }).then(() => true, () => false))) {
                await page.keyboard.press("Escape");
                await end.click().catch(() => {});
                continue;
            }
            await go.click();
            for (let j = 0; j < 30 && !(await pick.count()); j++) {
                await page.waitForTimeout(300);
                const zone = page.locator(".df-zone.is-offered").first();
                if (await zone.count()) await zone.click({ force: true }).catch(() => {});
            }
            const hand = Number(((await page.locator(".df-rival-hand").getAttribute("aria-label")) ?? "").match(/holds (\d+)/)?.[1] ?? -1);
            check((await pick.count()) > 0 && (await pick.count()) === hand, `the pick shows their whole hand (${await pick.count()} of ${hand})`);
            const since = await page.evaluate((n) => window.__reveals.slice(n), before);
            check(since.length === 0, `no reveal banner before it (${JSON.stringify(since)})`);
            await page.screenshot({ path: outPath(`duel-reveal-rival-pick-${tag}.png`) });
            await pick.first().click();
            const ok = page.getByRole("button", { name: /^(Confirm|Done|OK)$/ });
            if (await ok.count()) await ok.first().click();
            confiscated = true;
            continue;
        }
        // Otherwise turns pass: a discard at the End Phase, the first card of any pick, End.
        if (await page.getByText("Choose the card to discard").count()) {
            await page.locator(".df-hand__card.is-glow").first().click({ force: true }).catch(() => {});
            continue;
        }
        if (await end.count()) { await end.click().catch(() => {}); continue; }
        if (await pick.count()) {
            await pick.first().click().catch(() => {});
            const ok = page.getByRole("button", { name: /^(Confirm|Done|OK)$/ });
            if (await ok.count()) await ok.first().click().catch(() => {});
        }
    }
    check(shownToYou, "the rival's Reinforcement was seen");
    check(confiscated, "your Confiscation was played");
    // Your own cards shown to the rival never ask anything of you.
    const reveals = await page.evaluate(() => window.__reveals);
    check(reveals.every((r) => r.ack === !/^You /.test(r.text)), `only cards shown to you wait (${JSON.stringify(reveals)})`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} catch (error) {
    console.log(`FAIL  ${error.message}`);
    failures++;
} finally {
    game?.close();
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
