// "Back to your match with <rival>" on a phone: the button (and its gold rim) stays inside the board.
//
//   API_BASE=http://localhost:4000 APP_BASE=http://localhost:3107 node web/scripts/drivers/duel-back-to-match.mjs
import { BASE, launchBrowser, outPath } from "./_lib.mjs";
import { rivalDuel } from "./_rival.mjs";
const MON = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = Array.from({ length: 40 }, (_, i) => MON[i % MON.length]);
let ok = false;
const browser = await launchBrowser();
try {
    const { you, seriesId } = await rivalDuel(browser, { you: deck, rival: deck, viewport: { width: 390, height: 844 } });
    const page = you.page;
    const me = await you.api("GET", "/api/auth/me");
    const userId = me.user?.id ?? me.id;
    await page.goto(`${BASE}/favicon.ico`);
    await page.evaluate(([key, id]) => localStorage.setItem(key, id), [`activeSeriesId:${userId}`, seriesId]);
    await page.goto(`${BASE}/record-match`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: outPath("back-1.png") });
    const play = page.getByRole("button", { name: /play/i }).first();
    const btn = page.getByRole("button", { name: /Back to your match/i });
    if (!(await btn.count()) && (await play.count())) { await play.click(); await page.waitForTimeout(1500); }
    await page.screenshot({ path: outPath("back-2.png") });
    const box = await btn.boundingBox();
    const panel = await page.locator(".dl").boundingBox();
    ok = !!box && !!panel && box.x >= panel.x + 6 && box.x + box.width <= panel.x + panel.width - 6;
    console.log(`${ok ? "PASS" : "FAIL"}  the button and its rim stay inside (${JSON.stringify(box)} in ${JSON.stringify(panel)})`);
} finally { await browser.close(); }
process.exit(ok ? 0 : 1);
