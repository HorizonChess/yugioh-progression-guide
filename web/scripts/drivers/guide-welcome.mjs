// Yugi's welcome, for review: every tour and first-visit line from data/guide/welcome.json,
// said on its real screen with what it points at spotlit, at desktop and phone size. Stacks
// them into captioned sheets in out/guide/welcome-*.png. Needs the dev server.
//
//   node scripts/drivers/guide-welcome.mjs
import { mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { BASE, OUT_DIR, STORE_KEY, launchBrowser, makeSave, seedStorage, reward } from "./_lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = JSON.parse(readFileSync(join(HERE, "..", "..", "src", "data", "guide", "welcome.json"), "utf8"));
const DIR = join(OUT_DIR, "guide", "welcome");
mkdirSync(DIR, { recursive: true });

const VARS = { set: "Legend of Blue Eyes White Dragon", packs: 24, rival: "Kaiba" };
const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => String(VARS[k] ?? ""));
const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};
const COLLECTION = { "89631139_LOB-EN001_Ultra Rare": 1, "55144522_LOB-EN119_Rare": 2, "12580477_LOB-EN053_Super Rare": 1 };

// Where each screen's lines are said, and how to get there.
const ROUTES = {
    tour: { route: "/timeline/" },
    menu: { route: "/menu/" },
    packs: { route: "/packs/?set=0" },
    haul: { route: "/packs/?set=0", haul: true },
    collection: { route: "/collection/" },
    "deck-builder": { route: "/deck-builder/" },
    "record-match": { route: "/record-match/" },
    rewards: { route: "/rewards/" },
};

// Every line to show: [screen, key, wording, text].
const lines = [];
for (const l of SCRIPT.tour) {
    lines.push(["tour", l, "solo", l.solo]);
    if (l.duo) lines.push(["tour", l, "duo", l.duo]);
}
for (const [screen, list] of Object.entries(SCRIPT.screens)) {
    for (const l of list) {
        lines.push([screen, l, "solo", l.solo]);
        if (l.duo) lines.push([screen, l, "duo", l.duo]);
    }
}

// The spotlight, as it will look: a ring drawn over the target, with the page dimmed around
// it. It's its own layer on top of the page (not a style on the target), so containers that
// clip their contents can't cut it off. On phones, Yugi goes to the top when the target is low.
const SPOT_CSS = `
.guide-spot { position: fixed; z-index: 115; pointer-events: none; border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(4, 3, 8, 0.55), 0 0 0 3px #ffd76a, 0 0 28px 6px rgba(255, 215, 106, 0.55); }
@media (max-width: 767px) { body.guide-top .guide { top: calc(6px + env(safe-area-inset-top)); bottom: auto; } }`;

async function openHaul(page, phone) {
    await page.getByRole("button", { name: /^Open/ }).first().click();
    await page.waitForTimeout(1500);
    const box = await page.locator(".ps-pack").boundingBox();
    if (phone) {
        const cdp = await page.context().newCDPSession(page);
        const y = box.y + box.height * 0.12;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 10, y }] });
        for (let x = box.x + 10; x < box.x + box.width - 10; x += 12) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Open All" }).click().catch(() => {});
    await page.waitForTimeout(3000);
}

const browser = await launchBrowser();
const shots = { desktop: [], phone: [] };
for (const [size, options] of Object.entries(SIZES)) {
    const page = await browser.newPage(options);
    const save = makeSave({ currentSetIndex: 0, collection: COLLECTION, rewards: [reward({ prizeId: "pity-packs", wonFromPackName: VARS.set, wonFromSetIndex: 0 })] });
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "on", "ygo-pack-sound": "off" });
    let at = "";
    for (const [screen, l, wording, text] of lines) {
        const { route, haul } = ROUTES[screen];
        const where = route + (haul ? "#haul" : "");
        if (where !== at) {
            await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
            await page.addStyleTag({ content: SPOT_CSS });
            if (haul) await openHaul(page, size === "phone");
            await page.waitForTimeout(800);
            at = where;
        }
        const found = await page.evaluate(({ target, text, key, mood }) => {
            document.querySelectorAll(".guide-spot").forEach((e) => e.remove());
            const el = target.split(",").map((s) => document.querySelector(s.trim())).find((e) => e && e.getBoundingClientRect().width > 0);
            if (el) {
                el.scrollIntoView({ block: "nearest" });
                const r = el.getBoundingClientRect(), pad = 6;
                const spot = Object.assign(document.createElement("div"), { className: "guide-spot" });
                Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
                document.body.append(spot);
                document.body.classList.toggle("guide-top", r.top + r.height / 2 > innerHeight / 2);
            }
            window.__guide.reset();
            window.__guide.say({ key: `welcome:${key}:${text.length}`, text, mood, priority: 4 });
            return !!el;
        }, { target: l.target, text: fill(text), key: l.key, mood: l.mood });
        await page.waitForTimeout(1600 + text.length * 24);
        const file = join(DIR, `${size}-${shots[size].length}.png`);
        await page.screenshot({ path: file });
        shots[size].push({ file, caption: `${screen === "tour" ? "Tour" : `First visit: ${screen}`} · ${l.key}${wording === "duo" ? " (duo)" : ""}${found ? "" : " · TARGET NOT FOUND"}` });
        if (!found) console.log(`target not found: ${screen}/${l.key} (${size}): ${l.target}`);
    }
    await page.close();
}
await browser.close();

// Sheets: each row is the desktop shot and the phone shot of one line, captioned.
const DW = 960, DH = 600, PW = 277, PH = 600, CAP = 40, GAP = 12, W = DW + GAP + PW;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const per = 4;
for (let s = 0; s * per < shots.desktop.length; s++) {
    const layers = [];
    const rows = shots.desktop.slice(s * per, s * per + per);
    for (const [i, d] of rows.entries()) {
        const p = shots.phone[s * per + i];
        const top = i * (CAP + DH + GAP);
        layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}"><rect width="100%" height="100%" fill="#0b0810"/><text x="10" y="27" font-family="Segoe UI, Arial" font-size="20" font-weight="700" fill="#ffe08a">${s * per + i + 1}. ${esc(d.caption)}</text></svg>`), top, left: 0 });
        layers.push({ input: await sharp(d.file).resize(DW, DH).toBuffer(), top: top + CAP, left: 0 });
        if (p) layers.push({ input: await sharp(p.file).resize(PW, PH).toBuffer(), top: top + CAP, left: DW + GAP });
    }
    const out = join(DIR, `..`, `welcome-${s + 1}.png`);
    await sharp({ create: { width: W, height: rows.length * (CAP + DH + GAP), channels: 3, background: "#0b0810" } }).composite(layers).png().toFile(out);
    console.log(out);
}
