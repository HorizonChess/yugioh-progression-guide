// Phone ring: a tap on a face-down common at the side flips it where it is (the ring
// doesn't turn); a tap on a face-down rare at the side turns it to the front first.
// Needs the dev server.
//
//   node scripts/drivers/ring-tap.mjs
import { BASE, STORE_KEY, launchBrowser, makeSave, outPath, seedStorage } from "./_lib.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const save = makeSave({ currentSetIndex: 0 });
await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
await page.goto(`${BASE}/packs/?set=0`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Open/ }).first().click();
await page.waitForTimeout(1500);
// Tear the pack: a swipe across its top strip.
const box = await page.locator(".ps-pack").boundingBox();
const y = box.y + box.height * 0.12;
const cdp = await page.context().newCDPSession(page);
const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
await touch("touchStart", box.x + 10);
for (let x = box.x + 10; x < box.x + box.width - 10; x += 12) await touch("touchMove", x);
await touch("touchEnd");
await page.waitForTimeout(4000);

// The cards: which is in front, where each is, face up or not, common or not.
const cards = () => page.evaluate(() => [...document.querySelectorAll(".ps-card")].map((el, i) => {
    const r = el.getBoundingClientRect();
    return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, z: Number(el.style.zIndex), up: el.classList.contains("ps-card--up") || el.classList.contains("is-up") || el.dataset.up === "1", glow: el.classList.contains("ps-card--glowing"), cls: el.className };
}));
const before = await cards();
console.log("classes of a card:", before[0]?.cls);
const front = before.reduce((a, b) => (b.z > a.z ? b : a));
// A side card: visible, not in front, not glowing (a common).
const side = before.filter((c) => c.i !== front.i && !c.glow && c.x > 30 && c.x < 360).sort((a, b) => b.z - a.z)[0];
console.log("front", front.i, "tapping side common", side?.i);
await page.touchscreen.tap(side.x, side.y);
await page.waitForTimeout(1500);
const after = await cards();
const nowFront = after.reduce((a, b) => (b.z > a.z ? b : a));
console.log(`side card ${side.i}: before "${before[side.i].cls}" after "${after[side.i].cls}"; front was ${front.i}, now ${nowFront.i}`);
await page.screenshot({ path: outPath("ring-tap.png") });
await browser.close();
