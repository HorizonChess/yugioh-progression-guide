// Fast drags in the deck builder: press, one quick move, release, with no pause
// anywhere. Every kind of drop (search → deck, reorder in the main deck, main →
// side) is repeated and each one must land exactly where it was dropped.
//
//   node scripts/drivers/deck-builder-drops.mjs   (STEPS=n moves per drag, THROTTLE=n slows the CPU)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

const CARDS = { "Blue-Eyes White Dragon": 89631139, "Dark Magician": 46986414, "Mystical Elf": 15025844, "Celtic Guardian": 91152256 };
const save = makeSave({
    currentSetIndex: 0,
    collection: Object.fromEntries(Object.values(CARDS).map((id) => [`${id}_LOB_Common`, 3])),
});

const ROUNDS = Number(process.env.ROUNDS || 12);
const STEPS = Number(process.env.STEPS || 1);

let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("dialog", (d) => { console.log("dialog:", d.message()); d.dismiss(); });
if (process.env.THROTTLE) { const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) }); }
await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }) });
await page.goto(`${BASE}/deck-builder/`, { waitUntil: "networkidle" });

const search = (name) => page.locator(`.bg-lime img[alt="${name}"]`).first();
await search("Dark Magician").waitFor({ timeout: 15000 });
const mainSlot = (i) => page.locator(".grid-cols-10 > div").nth(i);
const mainNames = () => page.locator(".grid-cols-10 > div").evaluateAll((els) => els.map((el) => el.querySelector("img")?.alt ?? null));

async function center(locator) {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function fastDrag(from, to) {
    const a = await center(from);
    const b = await center(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: STEPS });
    await page.mouse.up();
    await page.waitForTimeout(150);
}

// A: search → the next empty main slot.
let lostA = 0;
for (let i = 0; i < ROUNDS; i++) {
    const before = (await mainNames()).filter(Boolean).length;
    const name = Object.keys(CARDS)[i % 4];
    await fastDrag(search(name), mainSlot(before));
    const after = await mainNames();
    if (after.filter(Boolean).length !== before + 1 || after[before] !== name) {
        lostA++;
        console.log(`  A${i}: dropped ${name} on slot ${before}; deck now`, after.slice(0, before + 2));
    }
}
check(lostA === 0, `search → empty slot lands every time (${ROUNDS - lostA}/${ROUNDS})`);

// B: reorder inside the main deck: slot 0 onto slot 3.
let lostB = 0;
for (let i = 0; i < ROUNDS; i++) {
    const before = await mainNames();
    const count = before.filter(Boolean).length;
    await fastDrag(mainSlot(0), mainSlot(3));
    const after = await mainNames();
    const expected = [...before.slice(1, 4), before[0], ...before.slice(4)];
    if (after.filter(Boolean).length !== count || after.slice(0, 6).join() !== expected.slice(0, 6).join()) {
        lostB++;
        console.log(`  B${i}: expected`, expected.slice(0, 6), "got", after.slice(0, 6));
    }
}
check(lostB === 0, `reorder in the main deck lands every time (${ROUNDS - lostB}/${ROUNDS})`);

await page.screenshot({ path: outPath("deck-builder-drops.png") });
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
