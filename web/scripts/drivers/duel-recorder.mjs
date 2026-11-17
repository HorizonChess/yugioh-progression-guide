// The duel recorder at work: plays practice games against the bot through the board, the way a
// player does (cards picked up from the hand and Summoned, Set or activated, attacks, questions
// answered, turns ended), with the recorder on, and reports what it caught: cards of yours that
// moved while their place in the duel stayed put, vanished, or were drawn twice.
//
//   npm run test-server -w @ygo/api
//   node web/scripts/drivers/duel-recorder.mjs        (GAMES=3, PHONE=1 for a phone, SEED=n)
import { writeFileSync } from "node:fs";
import { launchBrowser, makeSave, openBotsArena, outPath, practiceAgainstBot, seedStorage, STORE_KEY, throughPregame } from "./_lib.mjs";

const phone = process.env.PHONE === "1";
const GAMES = Number(process.env.GAMES ?? 3);
let seed = Number(process.env.SEED ?? 7);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];

// Monsters of every size, a Spell or two and Traps to Set: summons, Sets, Tributes and attacks.
const MAIN = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844, 4206964, 44095762, 83968380, 12580477];
const deck = { id: "d1", name: "Recorder", mainDeck: Array.from({ length: 40 }, (_, i) => MAIN[i % MAIN.length]), sideDeck: [], extraDeck: [] };
const save = makeSave({ currentSetIndex: 0, collection: Object.fromEntries(MAIN.map((id) => [`${id}_LOB_Common`, 3])), savedDecks: [deck] });

const browser = await launchBrowser();
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const warnings = [];
page.on("console", (m) => m.type() === "warning" && m.text().startsWith("[duel recorder]") && warnings.push(m.text()));

const visible = async (sel) => (await page.locator(sel).count()) > 0 && (await page.locator(sel).first().isVisible().catch(() => false));
const click = async (loc) => {
    await loc.click({ timeout: 1500 }).catch(() => loc.dispatchEvent("click").catch(() => {}));
};

/** One move: whatever the board asks, answered as a player would (a little at random). */
async function step() {
    if (await visible(".df-result")) return "over";
    const duel = page.getByRole("button", { name: "Duel!", exact: true });
    if (await duel.count()) return click(duel);
    // A card's choices popped up over it: Summon, Set, activate, attack (not "Details").
    const pop = page.locator(".df-pop__btn:not(.df-pop__btn--quiet)");
    if (await pop.count()) return click(pop.nth(Math.floor(rand() * (await pop.count()))));
    // Where it goes.
    const zone = page.locator(".df-zone__pick");
    if (await zone.count()) return click(zone.first());
    // A question in the sheet: cards to choose, then yes/no or the first answer.
    if (await visible(".df-sheet")) {
        const list = page.locator(".df-sheet .df-listcard:not(.is-picked)");
        if (await list.count()) await click(list.first());
        const opts = page.locator(".df-sheet .df-opt:not([disabled])");
        const n = await opts.count();
        if (n) {
            const texts = await opts.allTextContents();
            const yes = texts.findIndex((t) => /^Yes/.test(t)), no = texts.findIndex((t) => /^(No|Pass|Don't|Back)/.test(t));
            const i = yes >= 0 && no >= 0 ? (rand() < 0.4 ? yes : no) : texts.findIndex((t) => !/^(Back|Surrender)/.test(t));
            if (i >= 0) return click(opts.nth(i));
        }
    }
    // Cards that glow can be used: a hand card picked up (most often), or one on the field (an attack).
    const hand = page.locator(".df-hand__card.is-glow"), field = page.locator(".df-mat--me .df-card.is-glow, .df-card.is-glow");
    const phase = await page.locator(".df-phases [role=tab][aria-selected=true]").first().getAttribute("aria-label").catch(() => "");
    if ((await hand.count()) && rand() < 0.8 && phase !== "Battle") return click(hand.nth(Math.floor(rand() * (await hand.count()))));
    if ((await field.count()) && rand() < 0.85) return click(field.nth(Math.floor(rand() * (await field.count()))));
    // Nothing more to do: on to the Battle Phase from Main 1 now and then, else end the turn.
    const tab = (name) => page.getByRole("tab", { name, exact: true }).and(page.locator(":enabled"));
    if (phase === "Main 1" && (await tab("Battle").count()) && rand() < 0.6) return click(tab("Battle"));
    if (await tab("End").count()) return click(tab("End"));
    // A card to tap in a question (a Tribute, a target) glows on the board.
    const any = page.locator(".df-card.is-glow, .df-hand__card.is-glow");
    if (await any.count()) return click(any.first());
}

const summary = [];
let selftest = null;
try {
    await seedStorage(page, { [STORE_KEY]: JSON.stringify({ saves: [save], activeSaveId: save.id }), "ygo-guide": "off", "ygo-duel-recorder": "on" });
    for (let game = 1; game <= GAMES; game++) {
        await openBotsArena(page);
        if (phone && !(await page.locator(".op-side.is-open").count())) await page.locator(".op-door__lintel").click().catch(() => {});
        await practiceAgainstBot(page);
        await page.waitForURL(/duel/, { timeout: 30000 });
        await throughPregame(page);
        const started = Date.now();
        let steps = 0;
        for (; steps < 400 && Date.now() - started < 6 * 60_000; steps++) {
            if ((await step()) === "over") break;
            // Time for the board to play out what happened (the recorder watches all of it); now and
            // then the next move comes at once, while it's still playing out.
            await page.waitForTimeout(rand() < 0.25 ? 80 : 450 + rand() * 500);
            // A mouse wanders over your cards (the detail panel follows it).
            if (!phone && rand() < 0.3) {
                const mine = page.locator(".df-mat--me .df-card, .df-hand__card");
                const n = await mine.count();
                if (n) await mine.nth(Math.floor(rand() * n)).hover({ timeout: 800 }).catch(() => {});
            }
            // The recorder's own check: a card of yours nudged and one hidden for a moment, as the bug looks.
            if (process.env.SELFTEST === "1" && game === 1 && steps === 25) {
                selftest = await page.evaluate(async () => {
                    const [a, b] = [...document.querySelectorAll(".df-hand__card")].filter((el) => !el.matches(":hover"));
                    if (!a || !b) return null;
                    a.style.translate = "40px 0";
                    b.style.visibility = "hidden";
                    await new Promise((r) => setTimeout(r, 330));
                    a.style.translate = "";
                    b.style.visibility = "";
                    return [a.dataset.uid, b.dataset.uid];
                });
            }
        }
        const turn = await page.getByText(/^Turn \d+/).first().textContent().catch(() => "?");
        const log = await page.evaluate(() => window.__duelRecorder?.log());
        summary.push(`game ${game}: ${steps} moves, ${turn}, ${log?.incidents.length ?? "no recorder"} incidents so far`);
        await page.screenshot({ path: outPath(`duel-recorder-${game}-${phone ? "phone" : "desktop"}.png`) });
    }
} finally {
    const log = await page.evaluate(() => window.__duelRecorder?.log()).catch(() => null);
    writeFileSync(outPath(`duel-recorder-${phone ? "phone" : "desktop"}.json`), JSON.stringify(log, null, 1));
    console.log(summary.join("\n"));
    const list = log?.incidents ?? [];
    const kinds = list.reduce((m, i) => ((m[`${i.kind} (${i.side})`] = (m[`${i.kind} (${i.side})`] ?? 0) + 1), m), {});
    console.log(`incidents: ${list.length}`, kinds);
    for (const i of list.slice(0, 15)) console.log(`  ${i.kind} ${i.side} ${i.uid} ${i.code} ${i.place} turn ${i.turn} ${i.phase}${i.off ? ` off ${i.off.max}px (${i.off.dx},${i.off.dy}) ${i.off.ms}ms` : ""}`);
    if (selftest) {
        const [moved, hidden] = selftest;
        console.log(`self-test: nudged ${moved} ${list.some((i) => i.uid === moved && i.kind === "moved") ? "CAUGHT" : "MISSED"}, hid ${hidden} ${list.some((i) => i.uid === hidden && i.kind === "hidden") ? "CAUGHT" : "MISSED"}`);
    }
    if (errors.length) console.log("page errors:", errors.slice(0, 5));
    await browser.close();
}
