// The Play / Record board: it opens on playing the duel here, with one main way to play; a duel
// played somewhere else is recorded from the link under it. In a duo series, practice stays on
// offer while your challenge waits for the rival.
//
//   npm run test-server -w @ygo/api
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/play-record.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
const size = phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } };
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { id: "d1", name: "Starter", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const errors = [];
try {
    // 1. A guest: the board opens on playing here.
    const page = await browser.newPage(size);
    page.on("pageerror", (e) => errors.push(e.message));
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/timeline/`, { waitUntil: "networkidle" });
    check((await page.getByRole("link", { name: "Play / Record" }).count()) > 0, "the campaign button reads Play / Record");
    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    const bot = page.getByRole("button", { name: "Practice against the bot" });
    await bot.waitFor({ timeout: 15000 });
    check((await page.getByText("Play the duel").count()) > 0, "the board is headed Play the duel");
    check(await bot.evaluate((el) => el.classList.contains("dl-slab--main")), "solo: dueling the bot is the main way to play");
    check((await page.getByRole("button", { name: "Record a victory" }).count()) === 0, "the result tablets aren't up yet");
    await page.screenshot({ path: outPath(`play-record-play-${tag}.png`) });
    await page.getByRole("button", { name: /Record the result/ }).click();
    await page.getByRole("button", { name: "Record a victory" }).waitFor({ timeout: 8000 });
    check((await page.getByText("Record the duel").count()) > 0, "the link under it opens the result tablets");
    await page.screenshot({ path: outPath(`play-record-record-${tag}.png`) });
    await page.getByRole("button", { name: /Play it here instead/ }).click();
    await bot.waitFor({ timeout: 8000 });
    check(true, "and back to playing here");
    await page.close();

    // 2. A duo series: the challenge is the main way; with it sent, practice is still on offer.
    const suffix = Date.now().toString(36).slice(-5);
    const player = async (name) => {
        const context = await browser.newContext(size);
        await context.addInitScript(() => localStorage.setItem("ygo-guide", "off"));
        const p = await context.newPage();
        p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
        const res = await context.request.post(`${API}/api/auth/signup`, { headers: { origin: BASE }, data: { email: `${name.toLowerCase()}@example.com`, password: "heart of the cards", duelistName: name } });
        if (!res.ok()) throw new Error(`sign-up failed for ${name}`);
        const userId = (await res.json()).user.id;
        const api = async (method, path, data) => {
            const r = await context.request.fetch(`${API}${path}`, { method, headers: { origin: BASE }, ...(data ? { data } : {}) });
            if (!r.ok()) throw new Error(`${name}: ${method} ${path} -> ${r.status()} ${await r.text()}`);
            return r.status() === 204 ? null : r.json();
        };
        return { name, page: p, api, userId };
    };
    const ready = async (p, seriesId) => {
        const { session } = await p.api("POST", `/api/series/${seriesId}/packs/open`, {});
        await p.api("POST", `/api/series/${seriesId}/packs/${session.id}/save`);
        const counts = new Map(), main = [];
        for (const card of session.packs.flat()) {
            const n = counts.get(card.id) ?? 0;
            if (n >= 3 || main.length >= 40 || /Fusion/.test(card.type)) continue;
            counts.set(card.id, n + 1);
            main.push(card.id);
        }
        await p.api("PUT", `/api/series/${seriesId}/decks/main`, { name: "Main", mainDeck: main, extraDeck: [], sideDeck: [] });
    };
    const yugi = await player(`Yugi${suffix}`), kaiba = await player(`Kaiba${suffix}`);
    const seriesId = (await yugi.api("POST", "/api/series", { name: "Duelist Kingdom", mode: "duo", startSetIndex: 0, packsPerSet: 12 })).series.id;
    const { code } = await yugi.api("POST", `/api/series/${seriesId}/invites`);
    await kaiba.api("POST", "/api/invites/accept", { code });
    await ready(yugi, seriesId);
    await ready(kaiba, seriesId);
    // The series is the one in play for this browser.
    await yugi.page.goto(`${BASE}/favicon.ico`);
    await yugi.page.evaluate(([key, id]) => localStorage.setItem(key, id), [`activeSeriesId:${yugi.userId}`, seriesId]);
    await yugi.page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    const challenge = yugi.page.getByRole("button", { name: new RegExp(`Challenge ${kaiba.name}`) });
    await challenge.waitFor({ timeout: 20000 }).catch(async () => { await yugi.page.screenshot({ path: outPath(`play-record-duo-stuck-${tag}.png`) }); });
    check(await challenge.evaluate((el) => el.classList.contains("dl-slab--main")).catch(() => false), "duo: challenging the rival is the main way to play");
    await yugi.page.screenshot({ path: outPath(`play-record-duo-${tag}.png`) });
    await challenge.click();
    await yugi.page.getByText(/Waiting for .* to accept your challenge/).waitFor({ timeout: 10000 }).catch(() => {});
    const meanwhile = yugi.page.getByRole("button", { name: "Practice against the bot" });
    check((await meanwhile.count()) === 1, "with the challenge sent, practice against the bot is still offered");
    await yugi.page.screenshot({ path: outPath(`play-record-waiting-${tag}.png`) });
    await meanwhile.click();
    await yugi.page.waitForURL(/duel/, { timeout: 30000 }).catch(() => {});
    check(/duel/.test(yugi.page.url()), "and it starts while the challenge waits");
    check((await kaiba.api("GET", `/api/series/${seriesId}/duels/open`)).duels.some((d) => d.kind === "rival" && d.status === "waiting"), "the challenge is still waiting for the rival");
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
