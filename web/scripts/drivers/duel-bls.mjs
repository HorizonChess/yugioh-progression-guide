// Black Luster Soldier - Envoy of the Beginning's second attack, in a practice duel played on the
// device: the game is played on (api/scripts/duel-moment.ts) to your Battle Phase with it on the
// field, the page reloads there, and you attack a monster with it: you're asked whether to use its
// effect, say yes, and it can attack again.
//
//   npm run test-server -w @ygo/api   (and the web app pointed at it)
//   API_BASE=http://localhost:4000 APP_BASE=http://localhost:3107 node web/scripts/drivers/duel-bls.mjs

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame, practiceAgainstBot, openBotsArena } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const BLS = 72989439, CHARITY = 79571449;
const LIGHT = [12493482, 25652259, 15025844, 10992251, 2863439];
const DARK = [11321183, 7359741, 7459013, 13676474, 732302];
const main = [BLS, BLS, BLS, CHARITY, CHARITY, CHARITY, ...[...LIGHT, ...DARK].flatMap((c) => [c, c, c])].slice(0, 36);
main.push(20721928, 20721928, 20721928, 91152256);
const deck = { id: "d1", name: "Chaos", mainDeck: main, sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([...new Set(main)].map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: outPath(`duel-bls-${n}.png`) });
const btn = (name) => page.getByRole("button", { name, exact: true });
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await openBotsArena(page);
    await practiceAgainstBot(page);
    await page.waitForURL(/duel/, { timeout: 30000 }).catch(async (e) => {
        await shot("start");
        throw e;
    });
    await throughPregame(page);
    await page.waitForTimeout(2500);
    // On to the moment, stored; the page picks the game up there.
    const out = execFileSync("npx", ["tsx", "scripts/duel-moment.ts", API, "bls"], { cwd: join(ROOT, "api"), encoding: "utf-8", shell: true });
    console.log(out.trim().split("\n").at(-1));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".df-phases").waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    await shot("battle");
    const bls = page.locator(".df-card.is-glow").filter({ has: page.locator(`img[src*="${BLS}"]`) }).first();
    check((await bls.count()) === 1, "Black Luster Soldier is ready to attack");
    await bls.click({ force: true });
    await page.waitForTimeout(400);
    await btn("Attack").first().click({ force: true, timeout: 3000 });
    await page.waitForTimeout(600);
    const target = page.locator(".df-card.is-glow").first();
    if (await target.count()) await target.click({ force: true });
    // The battle plays out; then the question.
    const asked = page.getByText(/Activate the effect of Black Luster Soldier/);
    await asked.waitFor({ timeout: 15000 }).catch(() => {});
    await shot("after-battle");
    check((await asked.count()) > 0, "you're asked whether to use its effect");
    if (await asked.count()) {
        await btn("Yes").click();
        await page.waitForTimeout(2500);
        await shot("again");
        const again = page.locator(".df-card.is-glow").filter({ has: page.locator(`img[src*="${BLS}"]`) });
        check((await again.count()) === 1, "it can attack again");
    }
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
