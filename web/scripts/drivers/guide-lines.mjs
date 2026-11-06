// Example lines for review: real lines, picked by the real logic (lib/guide/lines.ts), on
// the real screens, put on screen through the dev-only window.__guide. Each moment is
// cropped to Yugi's corner and captioned; all of them are stacked into one sheet per
// screen in out/guide/. Needs the dev server.
//
//   node scripts/drivers/guide-lines.mjs
import { mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { BASE, OUT_DIR, STORE_KEY, launchBrowser, makeSave, seedStorage } from "./_lib.mjs";

const DIR = join(OUT_DIR, "guide");
mkdirSync(DIR, { recursive: true });

// Cards by id, from data/guide/facts.json and the set notes.
const URABY = { id: 1784619, name: "Uraby", rarity: "Common" };
const FISH = { id: 23771716, name: "7 Colored Fish", rarity: "Common" };
const SKULL = { id: 70781052, name: "Summoned Skull", rarity: "Ultra Rare" };
const RAIGEKI = { id: 12580477, name: "Raigeki", rarity: "Super Rare" };
const POT = { id: 55144522, name: "Pot of Greed", rarity: "Rare" };
const FISSURE = { id: 66788016, name: "Fissure", rarity: "Rare" };
const MANEATER = { id: 54652250, name: "Man-Eater Bug", rarity: "Super Rare" };
const DULL = { id: 1, name: "Armored Starfish", rarity: "Common" };

// [screen, caption, call] — call runs in the page with L = the lines module.
const MOMENTS = [
    ["/packs/?set=0", "Card list of Legend of Blue Eyes, before opening any (stage 1)", "L.setDetails('LOB', 'Legend of Blue Eyes White Dragon', [], () => 0, 0, 0)"],
    ["/packs/?set=0", "Same, the other wording", "L.setDetails('LOB', 'Legend of Blue Eyes White Dragon', [], () => 0, 0, 1)"],
    ["/packs/?set=0", "Card list of Legend of Blue Eyes, owning Pot of Greed", `L.setDetails('LOB', 'x', [${JSON.stringify(POT)}, ${JSON.stringify(FISSURE)}], (id) => id === ${POT.id} ? 1 : 0, 0, 0)`],
    ["/packs/?set=0", "Same, still missing Fissure", `L.setDetails('LOB', 'x', [${JSON.stringify(POT)}, ${JSON.stringify(FISSURE)}], (id) => id === ${POT.id} ? 1 : 0, 0, 1)`],
    ["/packs/?set=1", "Card list of Metal Raiders, before opening any (stage 2)", "L.setDetails('MRD', 'Metal Raiders', [], () => 0, 1, 1)"],
    ["/packs/?set=0", "Looking at Uraby at stage 1 (worked out from the pool)", `L.cardTip(${JSON.stringify(URABY)}, 0, 0)`],
    ["/packs/?set=1", "Looking at 7 Colored Fish at stage 2 (a stronger monster has a catch)", `L.cardTip(${JSON.stringify(FISH)}, 1, 0)`],
    ["/packs/?set=1", "Looking at Summoned Skull (his note)", `L.cardTip(${JSON.stringify(SKULL)}, 1, 0)`],
    ["/packs/?set=0", "Looking at Man-Eater Bug (his note)", `L.cardTip(${JSON.stringify(MANEATER)}, 0, 0)`],
    ["/packs/?set=0", "Haul with a new Raigeki", `L.haulLines([{...${JSON.stringify(RAIGEKI)}, isNew: true, copies: 1}, {...${JSON.stringify(DULL)}, isNew: true, copies: 1}], 0, 0)`],
    ["/packs/?set=0", "Haul with a third Uraby, nothing else new", `L.haulLines([{...${JSON.stringify(URABY)}, isNew: false, copies: 3}], 0, 0)`],
    ["/packs/?set=0", "Haul with nothing of note", `L.haulLines([{...${JSON.stringify(DULL)}, isNew: true, copies: 1}], 0, 2)`],
    ["/record-match/", "Solo win, Spell Ruler next", "L.resultLine(true, { mode: 'solo', streak: 1, next: 'Spell Ruler', seed: 0 })"],
    ["/record-match/", "Solo, third win in a row", "L.resultLine(true, { mode: 'solo', streak: 3, next: 'Spell Ruler', seed: 0 })"],
    ["/record-match/", "Solo loss", "L.resultLine(false, { mode: 'solo', streak: -1, next: 'Spell Ruler', seed: 1 })"],
    ["/record-match/", "Solo, second loss in a row", "L.resultLine(false, { mode: 'solo', streak: -2, next: 'Spell Ruler', seed: 0 })"],
    ["/record-match/", "Duo win against Kaiba", "L.resultLine(true, { mode: 'duo', rival: 'Kaiba', streak: 1, seed: 0 })"],
    ["/record-match/", "Duo loss against Kaiba", "L.resultLine(false, { mode: 'duo', rival: 'Kaiba', streak: -1, seed: 0 })"],
    ["/record-match/", "Duo, waiting for Kaiba to confirm", "L.waitingLine('Kaiba', 0)"],
];

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [makeSave({ currentSetIndex: 2 })], activeSaveId: "test-save" }), "ygo-pack-sound": "off" });
const shots = [];
let at = "";
for (const [route, caption, call] of MOMENTS) {
    if (route !== at) {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__guideLines);
        at = route;
    }
    const text = await page.evaluate((call) => {
        window.__guide.reset();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by the eval below
        const L = window.__guideLines;
        const out = eval(call);
        const line = Array.isArray(out) ? out[0] : out;
        if (line) window.__guide.say(line);
        return line?.text ?? null;
    }, call);
    if (!text) { console.log(`(silent) ${caption}`); continue; }
    await page.waitForTimeout(1500 + text.length * 24);
    const file = join(DIR, `line-${shots.length}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 560, width: 760, height: 340 } });
    shots.push({ file, caption });
    console.log(`${caption}\n  ${text}`);
}
await browser.close();

// Stack them with captions, in sheets of 6.
const W = 760, H = 340, CAP = 44;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
for (let s = 0; s * 6 < shots.length; s++) {
    const group = shots.slice(s * 6, s * 6 + 6);
    const layers = group.flatMap(({ file, caption }, i) => [
        { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${CAP}"><rect width="100%" height="100%" fill="#0b0810"/><text x="16" y="29" font-family="Segoe UI, Arial" font-size="19" font-weight="700" fill="#ffe08a">${s * 6 + i + 1}. ${esc(caption)}</text></svg>`), top: i * (H + CAP), left: 0 },
        { input: file, top: i * (H + CAP) + CAP, left: 0 },
    ]);
    const out = join(DIR, `yugi-lines-${s + 1}.png`);
    await sharp({ create: { width: W, height: group.length * (H + CAP), channels: 3, background: "#0b0810" } }).composite(layers).png().toFile(out);
    console.log(out);
}
