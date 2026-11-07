// Yugi's welcome, played for real by a new guest: the main menu's hello, Campaign Mode,
// a new run's form, creating it, the timeline tour, then the first visit to each screen.
// Taps through every line as a player would, checks each spotlight is on screen and Yugi
// doesn't cover it, and stacks the shots (desktop and phone) into out/guide/welcome-flow-*.png.
// Needs the dev server.
//
//   node scripts/drivers/welcome-flow.mjs
import { mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { BASE, OUT_DIR, launchBrowser, seedStorage } from "./_lib.mjs";

const DIR = join(OUT_DIR, "guide", "welcome-flow");
mkdirSync(DIR, { recursive: true });
const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};

const browser = await launchBrowser();
const shots = { desktop: [], phone: [] };
const problems = [];

for (const [size, options] of Object.entries(SIZES)) {
    const page = await browser.newPage(options);
    const phone = size === "phone";
    await seedStorage(page, { "ygo-guide": "on", "ygo-pack-sound": "off" });
    const press = (loc) => (phone ? loc.tap() : loc.click());

    /** Waits for Yugi, then shoots and taps through every line he says here. */
    async function listen(where) {
        await page.waitForSelector(".guide--on", { timeout: 8000 }).catch(() => problems.push(`${size} ${where}: Yugi didn't speak`));
        for (let n = 0; n < 12 && (await page.locator(".guide--on").count()); n++) {
            // Until it's typed out (the untyped rest is empty).
            await page.waitForFunction(() => !document.querySelector(".guide--on .guide__rest")?.textContent, null, { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(400);
            const m = await page.evaluate(() => {
                const r = (e) => e?.getBoundingClientRect();
                const spot = r(document.querySelector(".guide-spot")), tablet = r(document.querySelector(".guide--on .guide__tablet")), yugi = r(document.querySelector(".guide--on .guide__yugi"));
                const hit = (a, b) => !!a && !!b && a.left < b.right - 4 && b.left < a.right - 4 && a.top < b.bottom - 4 && b.top < a.bottom - 4;
                return {
                    text: document.querySelector(".guide--on .guide__text")?.textContent?.replace("▼", "").trim() ?? "",
                    more: !!document.querySelector(".guide__text--more"),
                    spot: !!spot,
                    covered: hit(spot, tablet) || hit(spot, yugi),
                    offscreen: !!spot && (spot.bottom < 0 || spot.top > innerHeight),
                };
            });
            const file = join(DIR, `${size}-${shots[size].length}.png`);
            await page.screenshot({ path: file });
            shots[size].push({ file, caption: `${where}: ${m.text.slice(0, 70)}${m.text.length > 70 ? "…" : ""}` });
            if (!m.spot) problems.push(`${size} ${where}: no spotlight on "${m.text.slice(0, 40)}"`);
            if (m.covered) problems.push(`${size} ${where}: Yugi covers his spotlight on "${m.text.slice(0, 40)}"`);
            if (m.offscreen) problems.push(`${size} ${where}: spotlight off screen on "${m.text.slice(0, 40)}"`);
            if (!m.more) break;
            await press(page.locator(".guide--on .guide__tablet"));
            await page.waitForTimeout(700);
        }
        // Past the last line: let him go.
        await page.evaluate(() => window.__guide?.silence());
        await page.waitForTimeout(600);
    }

    // 1. The main menu: hello, Campaign Mode, the account, Options.
    await page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    await listen("Menu");
    // 2. Campaign Mode's list, then the new run's form.
    await press(page.getByRole("button", { name: /CAMPAIGN MODE/ }));
    await listen("Campaign");
    await press(page.locator("[data-guide='new-game']"));
    await listen("New run");
    // 3. Create it; the road and the tour.
    await page.locator("form input").first().fill("First Run");
    await press(page.locator("form button[type='submit'], form button:has-text('Create'), form button:has-text('START')").first());
    await page.waitForURL(/timeline/, { timeout: 15000 }).catch(async () => {
        await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
    });
    await page.waitForLoadState("networkidle");
    await listen("Tour");
    // 4. First visits.
    for (const [where, route] of [["Packs", "/packs/?set=0"], ["Collection", "/collection/"], ["Deck Builder", "/deck-builder/"], ["Record Match", "/record-match/"], ["Rewards", "/rewards/"]]) {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        await listen(where);
    }
    await page.close();
}
await browser.close();

console.log(problems.length ? `PROBLEMS:\n  ${problems.join("\n  ")}` : "every line spoke, with its spotlight on screen and uncovered");

// Sheets: desktop and phone side by side, one line per row.
const DW = 960, DH = 600, PW = 277, PH = 600, CAP = 40, GAP = 12, W = DW + GAP + PW, per = 4;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const rows = Math.max(shots.desktop.length, shots.phone.length);
for (let s = 0; s * per < rows; s++) {
    const layers = [];
    const count = Math.min(per, rows - s * per);
    for (let i = 0; i < count; i++) {
        const d = shots.desktop[s * per + i], p = shots.phone[s * per + i];
        const top = i * (CAP + DH + GAP);
        const caption = d?.caption ?? p?.caption ?? "";
        layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}"><rect width="100%" height="100%" fill="#0b0810"/><text x="10" y="27" font-family="Segoe UI, Arial" font-size="19" font-weight="700" fill="#ffe08a">${s * per + i + 1}. ${esc(caption)}</text></svg>`), top, left: 0 });
        if (d) layers.push({ input: await sharp(d.file).resize(DW, DH).toBuffer(), top: top + CAP, left: 0 });
        if (p) layers.push({ input: await sharp(p.file).resize(PW, PH).toBuffer(), top: top + CAP, left: DW + GAP });
    }
    const out = join(DIR, "..", `welcome-flow-${s + 1}.png`);
    await sharp({ create: { width: W, height: count * (CAP + DH + GAP), channels: 3, background: "#0b0810" } }).composite(layers).png().toFile(out);
    console.log(out);
}
