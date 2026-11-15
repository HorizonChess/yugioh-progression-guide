// The Bots Arena's wall in 3D (desktop): going to the arena, a canvas takes over from the page's
// wall and the camera moves round the corner to the torch; leaving, it moves back and the canvas
// goes. Its first frames are the page's wall: the left margin's brightness holds steady through
// the handoff. Writes out/bots-arena-wall.mp4 (Chrome's screencast).
//
//   NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev -w web    (any API: the arena opens as a guest)
//   PW_CHANNEL=chrome node web/scripts/drivers/bots-arena-wall.mjs
import fs from "fs";
import { chromium } from "playwright";
import { BASE, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failures++; };
// (on the GPU: the wall is a heavy shader)
const browser = await chromium.launch({ ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}), args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const dir = outPath("bots-arena-wall"); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const cdp = await ctx.newCDPSession(page);
let n = 0, casting = false;
cdp.on("Page.screencastFrame", async (f) => {
    if (casting) fs.writeFileSync(`${dir}/${String(n++).padStart(5, "0")}_${f.metadata.timestamp.toFixed(4)}.jpg`, Buffer.from(f.data, "base64"));
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
const nav = (href) => page.locator(`nav[aria-label="Main"] a[href*="${href}"]:visible`).first();
try {
    const save = makeSave({ currentSetIndex: 0 });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/collection/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000); // (the scene's code is fetched once a page has rested 2.5 s)
    check((await page.locator("canvas.arena-3d.is-shown").count()) === 0, "elsewhere, no 3D wall");
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92 }); casting = true;
    await page.waitForTimeout(600);
    await nav("bots-arena").click();
    await page.locator("canvas.arena-3d.is-shown").waitFor({ timeout: 15000 });
    check(true, "in the arena, the 3D wall takes over");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: outPath("bots-arena-wall-arena.png") });
    await nav("collection").click();
    await page.waitForFunction(() => !document.querySelector("canvas.arena-3d.is-shown"), null, { timeout: 15000 });
    check(true, "leaving, it moves back and goes");
    await page.waitForTimeout(500);
    casting = false; await cdp.send("Page.stopScreencast");
    check(n > 60, `the screencast has frames (${n})`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
