// Spell Counters on the board: Breaker the Magical Warrior is Normal Summoned (api/scripts/duel-moment.ts,
// "breaker"), and the page shows its Spell Counter as a labelled badge on the card. PHONE=1 for a phone.
//
//   API_BASE=http://localhost:4000 APP_BASE=http://localhost:3107 node web/scripts/drivers/duel-counters.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame, practiceAgainstBot, openBotsArena } from "./_lib.mjs";
const API = process.env.API_BASE || "http://localhost:4100";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const BREAKER = 71413901;
const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const main = [BREAKER, BREAKER, BREAKER, ...Array.from({ length: 37 }, (_, i) => MAIN[i % MAIN.length])];
const deck = { id: "d1", name: "Breaker", mainDeck: main, sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries([BREAKER, ...MAIN].map((id) => [id + "_LOB_Common", 3])), savedDecks: [deck] });
let ok = false;
const phone = process.env.PHONE === "1";
const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await openBotsArena(page);
    await practiceAgainstBot(page);
    await page.waitForURL(/duel/, { timeout: 30000 });
    await throughPregame(page);
    await page.waitForTimeout(2500);
    if (!process.env.SKIP_MOMENT) {
        const out = execFileSync("npx", ["tsx", "scripts/duel-moment.ts", API, "breaker"], { cwd: join(ROOT, "api"), encoding: "utf-8", shell: true });
        console.log(out.trim().split("\n").at(-1));
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".df-phases").waitFor({ timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: outPath(`counters-${phone ? "phone" : "desk"}.png`) });
    const onField = await page.locator(`.df-card img[src*="${BREAKER}"]`).count();
    const labels = await page.locator(".df-counters").evaluateAll((e) => e.map((x) => x.getAttribute("aria-label")));
    ok = onField === 1 && labels.length === 1 && labels[0] === "1 Spell Counter" && (await page.locator(".df-counters").first().isVisible());
    console.log(`${ok ? "PASS" : "FAIL"}  Breaker shows its Spell Counter (on field: ${onField}, badges: ${JSON.stringify(labels)})`);
} finally { await browser.close(); }
process.exit(ok ? 0 : 1);
