// The bot's level: the launcher offers Easy, Normal and Hard (Normal by default), remembers the
// choice, and a practice match started at Hard is played against "Practice Bot (Hard)". Then a few
// turns are played (the bot thinking ahead), to see it answers in good time and that each of your
// answers shows at once (before the bot thinks about its reply). The game is played on
// this device (the engine and the bot in a Web Worker): no live socket, the answers are sent to the
// server to keep, and a reload picks the game up where it was.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/duel-bot-level.mjs          (PHONE=1 for a phone)

import { BASE, launchBrowser, makeSave, outPath, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { id: "d1", name: "Levels", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on("worker", (w) => {
    consoleLines.push(`[worker] started ${w.url()}`);
    w.on("console", (m) => consoleLines.push(`[worker ${m.type()}] ${m.text()}`));
});
// What goes to the server: a live socket for the duel (there should be none), and the answers kept.
const sockets = [], uploads = [];
page.on("websocket", (ws) => sockets.push(ws.url()));
page.on("request", (r) => {
    if (r.method() === "POST" && /\/answers$/.test(r.url())) uploads.push(r.postDataJSON());
});
// How long each answer takes to show (from the page handing it to the worker to its first word back),
// and how long the worker takes to have the next question for you (the bot's thinking).
await page.addInitScript(() => {
    const Real = window.Worker;
    window.__lags = [];
    window.__thinks = [];
    window.Worker = class extends Real {
        constructor(...args) {
            super(...args);
            // When the last answer went, and whether its first word back has come (`__lags`); then
            // how long until the next question for you (`__thinks`: the bot's turn worked out).
            let sentAt = 0, heard = false;
            const post = this.postMessage.bind(this);
            this.postMessage = (m, ...rest) => {
                if (m?.type === "answer") (sentAt = performance.now()), (heard = false);
                return post(m, ...rest);
            };
            this.addEventListener("message", (e) => {
                if (!sentAt || e.data?.type !== "state") return;
                const ms = Math.round(performance.now() - sentAt);
                if (!heard) window.__lags.push(ms);
                heard = true;
                if (!e.data.state.prompt) return;
                window.__thinks.push(ms);
                sentAt = 0;
            });
        }
    };
});
const btn = (name) => page.getByRole("button", { name, exact: true });
const shot = (n) => page.screenshot({ path: outPath(`duel-bot-level-${n}-${phone ? "phone" : "desktop"}.png`) });
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off" });
    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    const old = btn("End it, start a new one"), practice = btn("Practice against the bot");
    await old.or(practice).first().waitFor({ timeout: 15000 });
    if (await old.count()) await old.click();
    // "Duel the bot" opens the choice of opponent: the practice bot is the first, at a level.
    await practice.click();
    await page.getByRole("radio", { name: "Practice Bot", exact: true }).click();

    const levels = page.getByRole("radiogroup", { name: "How well the bot plays" }).getByRole("radio");
    check((await levels.allTextContents()).join(",") === "Easy,Normal,Hard", "Easy, Normal and Hard are offered");
    check((await page.getByRole("radio", { name: "Normal" }).getAttribute("aria-checked")) === "true", "Normal by default");
    await page.getByRole("radio", { name: "Hard" }).click();
    check((await page.getByRole("radio", { name: "Hard" }).getAttribute("aria-checked")) === "true", "Hard is chosen");
    await shot("launcher");

    // Remembered on the next visit.
    await page.reload({ waitUntil: "networkidle" });
    await practice.click();
    check((await page.getByRole("radio", { name: "Hard" }).getAttribute("aria-checked")) === "true", "the choice is remembered");

    await page.getByRole("button", { name: /^Duel the bot/ }).click();
    await page.waitForURL(/duel/, { timeout: 30000 });
    await page.getByText("Practice Bot (Hard)").first().waitFor({ timeout: 15000 });
    check(true, "the match is against Practice Bot (Hard)");

    await throughPregame(page);
    const duel = btn("Duel!");
    if (await duel.count()) await duel.click();

    // A few turns: end each of ours at once, and time how long the bot takes with its own.
    let slowest = 0;
    const turnLabel = page.getByText(/^Turn \d+/).first();
    const turnNo = async () => Number((/Turn (\d+)/.exec((await turnLabel.textContent().catch(() => "")) ?? "") ?? [])[1] ?? 0);
    const end = page.getByRole("tab", { name: "End", exact: true }).and(page.locator(":enabled"));
    const pass = page.getByRole("button", { name: /^(Pass|No|Don't)/ }).first();
    let waitFrom = Date.now();
    for (let step = 0; step < 40 && (await turnNo()) < 7; step++) {
        // (A card to discard at the end of the turn: the first that glows.)
        const discard = page.locator(".df-hand__card.is-glow").first();
        await end.or(pass).or(discard).first().waitFor({ timeout: 60000 });
        // (Not the first: that's the game's opening, shuffling and all.)
        if (step > 0) slowest = Math.max(slowest, Date.now() - waitFrom);
        // Let the board's animations settle, then answer.
        await page.waitForTimeout(800);
        if ((await discard.count()) && !(await end.count())) await discard.click({ force: true }).catch(() => {});
        else if (await pass.count()) await pass.click().catch(() => {});
        else await end.click().catch(() => {});
        await page.waitForTimeout(400);
        waitFrom = Date.now();
    }
    check((await turnNo()) >= 5, `a few turns were played (turn ${await turnNo()})`);
    await shot("board");
    check(slowest < 8000, `your turn comes back in good time (slowest wait, the bot's turn played out: ${slowest} ms)`);
    const { lags, thinks } = await page.evaluate(() => ({ lags: window.__lags, thinks: window.__thinks }));
    const sorted = [...lags].sort((a, b) => a - b);
    check(lags.length > 3 && sorted.at(-1) < 1000, `each answer shows at once, before the bot thinks (${lags.length} answers: median ${sorted[sorted.length >> 1]} ms, slowest ${sorted.at(-1)} ms)`);
    // The rest of a wait for your turn is the board playing out what the bot did.
    check(thinks.length > 0 && Math.max(...thinks) < 2000, `the bot's thinking is quick (until your next question: ${thinks.join(", ")} ms)`);
    check(!sockets.some((u) => u.includes("/api/duels/")), `the game has no live socket (${sockets.join(", ") || "none"})`);
    const kept = uploads.reduce((n, u) => u.from + u.answers.length, 0);
    check(uploads.length > 0 && kept > 10, `the answers are sent to the server to keep (${uploads.length} uploads, ${kept} answers)`);

    // A reload picks the game up from what the server kept (once the board has caught up: your turn).
    await end.or(pass).first().waitFor({ timeout: 60000 });
    const turnBefore = await turnNo();
    await page.reload({ waitUntil: "load" });
    await turnLabel.waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    check((await turnNo()) === turnBefore, `a reload picks the game up where it was (turn ${turnBefore} → ${await turnNo()})`);
    check(errors.length === 0, `no page errors ${errors.join(" | ")}`);
} catch (error) {
    failures++;
    console.log(`FAIL  ${error.message.split("\n")[0]}`);
    console.log(`  uploads: ${uploads.length}, sockets: ${sockets.join(", ")}`);
    console.log(consoleLines.slice(-25).join("\n"));
    await shot("failed").catch(() => {});
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
