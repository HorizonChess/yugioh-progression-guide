// Declarations: the rival (played by the driver, _rival.mjs) Sets DNA Surgery and Prohibition and
// springs them. The board shows what they declared in a banner, and the face-up card wears it as a
// gold note.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/duel-declare.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, outPath } from "./_lib.mjs";
import { chainWith, rivalDuel, setCard } from "./_rival.mjs";

const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const DNA_SURGERY = 74701381, PROHIBITION = 43711255;
// Legend of Blue Eyes Normal Monsters.
const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 6368038, 74677422, 76184692];
const monsters = (n) => Array.from({ length: n }, (_, i) => MAIN[i % MAIN.length]);
const traps = [DNA_SURGERY, DNA_SURGERY, DNA_SURGERY, PROHIBITION, PROHIBITION, PROHIBITION];

const browser = await launchBrowser();
const errors = [];
let game;
try {
    const { you, rival, duelId } = await rivalDuel(browser, { you: monsters(40), rival: [...traps, ...monsters(34)], viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    const page = you.page;
    page.on("pageerror", (e) => errors.push(e.message));
    // The rival Sets its declaring traps, and springs them at the first chance.
    game = await rival.play(duelId, (p) => setCard(p, DNA_SURGERY) ?? setCard(p, PROHIBITION) ?? chainWith(p, DNA_SURGERY) ?? chainWith(p, PROHIBITION));

    // Rock beats the rival's Scissors; you go second, so the rival Sets first.
    await page.goto(`${BASE}/duel/?id=${duelId}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Rock", exact: true }).click({ timeout: 20000 });
    await rival.api("POST", `/api/duels/${duelId}/pregame`, { rps: "scissors" });
    await page.getByRole("button", { name: "Go second", exact: true }).click({ timeout: 20000 });
    await page.locator(".df-phases").waitFor({ timeout: 30000 });

    const end = page.locator('[role="tab"][aria-label="End"]:not([disabled])');
    const listed = page.locator(".df-sheet__list .df-listcard");
    const pass = page.getByRole("button", { name: /^(Pass|No|Don't)/ });
    let banner = "", note = "";
    for (let i = 0; i < 200 && !banner; i++) {
        await page.waitForTimeout(400);
        if (await page.getByText(/ wins( game \d+)?$/).count()) break;
        if (await page.locator(".df-declare").count()) {
            banner = (await page.locator(".df-declare").textContent()) ?? "";
            await page.screenshot({ path: outPath(`duel-declare-banner-${tag}.png`) });
            await page.waitForTimeout(2500);
            note = (await page.locator(".df-note").first().textContent().catch(() => "")) ?? "";
            break;
        }
        // Your side does nothing: it passes, ends turns and discards what it must.
        const discard = (await page.getByText("Choose the card to discard").count()) ? page.locator(".df-hand__card.is-glow").first() : page.locator("#none");
        if (await discard.count()) await discard.dispatchEvent("click").catch(() => {});
        else if (await pass.count()) await pass.first().click().catch(() => {});
        else if (await end.count()) await end.click().catch(() => {});
        else if (await listed.count()) await listed.first().click().catch(() => {});
    }
    await page.screenshot({ path: outPath(`duel-declare-${tag}.png`) });
    check(/declares/.test(banner), `a banner says what the rival declared (${banner})`);
    check(note.length > 0, `the trap wears it as a note (${note})`);
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
