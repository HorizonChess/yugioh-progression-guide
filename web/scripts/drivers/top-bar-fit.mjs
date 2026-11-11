// The phone top bar with a long rival's name: the stage line cuts off with …, the scoreboard
// stays in view, and the page doesn't grow wider than the screen.
//
//   node web/scripts/drivers/top-bar-fit.mjs

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
try {
    const save = makeSave({ currentSetIndex: 0 });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
    await page.locator(".phone-bar__sub").waitFor();
    // The line a duo series with a long-named rival shows.
    await page.locator(".phone-bar__sub").evaluate((el) => (el.textContent = "Stage 1 · vs Katsuya Jonouchi"));
    await page.locator(".phone-bar__name").evaluate((el) => (el.textContent = "Sato"));
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => {
        const sub = document.querySelector(".phone-bar__sub").getBoundingClientRect();
        const score = document.querySelector(".phone-bar__score")?.getBoundingClientRect();
        const bar = document.querySelector(".phone-bar").getBoundingClientRect();
        return { bar: [bar.left, bar.right], page: document.documentElement.scrollWidth, screen: innerWidth, subRight: sub.right, scoreLeft: score?.left ?? null, scoreRight: score?.right ?? null };
    });
    await page.screenshot({ path: outPath("top-bar-fit-phone.png"), clip: { x: 0, y: 0, width: 390, height: 140 } });
    check(fit.page <= fit.screen, `the page fits the screen (${fit.page} ≤ ${fit.screen})`);
    check(fit.scoreLeft !== null && fit.scoreRight <= fit.screen, `the scoreboard is in view (${fit.scoreLeft}–${fit.scoreRight})`);
    check(fit.scoreLeft === null || fit.subRight <= fit.scoreLeft + 1, `the stage line stops before the scoreboard (${fit.subRight} ≤ ${fit.scoreLeft})`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
