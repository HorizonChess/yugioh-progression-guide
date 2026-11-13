// Calling a duel off: two players in two browsers, in a duo series. One asks from the duel menu,
// the other is asked on the board and refuses; asked again, they agree. Nobody wins, nothing is
// recorded, and a new challenge can be sent.
//
//   npm run test-server -w @ygo/api            (copies card data from api/.env's database)
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/duel-call-off.mjs          (PHONE=1 for phones)

import { BASE, launchBrowser, outPath } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
const phone = process.env.PHONE === "1";
const tag = phone ? "phone" : "desktop";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const suffix = Date.now().toString(36).slice(-5);
const browser = await launchBrowser();
const problems = [];

/** A signed-up player in a browser context of their own. */
async function player(name) {
    const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    // Yugi's lines on the rules would sit over the duel menu on a phone: the guide is off here.
    await context.addInitScript(() => localStorage.setItem("ygo-guide", "off"));
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
    const res = await context.request.post(`${API}/api/auth/signup`, { headers: { origin: BASE }, data: { email: `${name.toLowerCase()}@example.com`, password: "heart of the cards", duelistName: name } });
    if (!res.ok()) throw new Error(`sign-up failed for ${name}: ${res.status()}`);
    const api = async (method, path, data) => {
        const r = await context.request.fetch(`${API}${path}`, { method, headers: { origin: BASE }, ...(data ? { data } : {}) });
        if (!r.ok()) throw new Error(`${name}: ${method} ${path} -> ${r.status()} ${await r.text()}`);
        return r.status() === 204 ? null : r.json();
    };
    return { name, context, page, api };
}

/** Opens and saves this set's packs, then saves a 40-card deck of what was pulled (three of a card at most). */
async function ready(p, seriesId) {
    const { session } = await p.api("POST", `/api/series/${seriesId}/packs/open`, {});
    await p.api("POST", `/api/series/${seriesId}/packs/${session.id}/save`);
    const counts = new Map();
    const main = [];
    for (const card of session.packs.flat()) {
        const n = counts.get(card.id) ?? 0;
        if (n >= 3 || main.length >= 40 || /Fusion/.test(card.type)) continue;
        counts.set(card.id, n + 1);
        main.push(card.id);
    }
    if (main.length < 40) throw new Error(`${p.name}: only ${main.length} cards for a deck`);
    await p.api("PUT", `/api/series/${seriesId}/decks/main`, { name: "Main", mainDeck: main, extraDeck: [], sideDeck: [] });
}

try {
    const yugi = await player(`Yugi${suffix}`);
    const kaiba = await player(`Kaiba${suffix}`);
    const seriesId = (await yugi.api("POST", "/api/series", { name: "Duelist Kingdom", mode: "duo", startSetIndex: 0, packsPerSet: 12 })).series.id;
    const { code } = await yugi.api("POST", `/api/series/${seriesId}/invites`);
    await kaiba.api("POST", "/api/invites/accept", { code });
    await ready(yugi, seriesId);
    await ready(kaiba, seriesId);
    const duelId = (await yugi.api("POST", `/api/series/${seriesId}/duels`, { deckId: "main", against: "rival" })).duel.id;
    await kaiba.api("POST", `/api/duels/${duelId}/accept`, { deckId: "main" });

    for (const p of [yugi, kaiba]) await p.page.goto(`${BASE}/duel/?id=${duelId}`, { waitUntil: "networkidle" });
    // The match opens on rock-paper-scissors: Yugi throws Rock, Kaiba Scissors, and Yugi goes first.
    await yugi.page.getByRole("button", { name: "Rock", exact: true }).click({ timeout: 20000 });
    await kaiba.page.getByRole("button", { name: "Scissors", exact: true }).click({ timeout: 20000 });
    await yugi.page.getByRole("button", { name: "Go first", exact: true }).click({ timeout: 20000 });
    for (const p of [yugi, kaiba]) await p.page.locator(".df-phases").waitFor({ timeout: 30000 });
    await yugi.page.waitForTimeout(4000); // the opening hands are dealt

    const banner = (p) => p.page.locator(".df-calloff");
    const ask = async (p) => {
        await p.page.getByRole("button", { name: "Duel menu" }).click();
        await p.page.getByRole("button", { name: /^Call the duel off/ }).click();
    };

    // 1. Yugi asks; Kaiba is asked on the board and keeps dueling.
    await ask(yugi);
    await banner(kaiba).waitFor({ timeout: 8000 }).catch(() => {});
    check(((await banner(kaiba).textContent().catch(() => "")) ?? "").includes(`${yugi.name} asks to call the duel off`), "the rival is asked on the board");
    check(/You asked to call the duel off/.test((await banner(yugi).textContent().catch(() => "")) ?? ""), "the one who asked sees that it's waiting");
    await kaiba.page.screenshot({ path: outPath(`duel-call-off-asked-${tag}.png`) });
    await kaiba.page.getByRole("button", { name: "Notifications" }).first().waitFor({ timeout: 100 }).catch(() => {});
    await banner(kaiba).getByRole("button", { name: "Keep dueling" }).click();
    await banner(yugi).waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    check((await banner(yugi).count()) === 0 && (await banner(kaiba).count()) === 0, "refused: the request is gone and the duel goes on");
    check((await yugi.page.getByText("Duel called off").count()) === 0, "nothing ended");

    // 2. Yugi asks again and could take it back; then Kaiba agrees.
    await ask(yugi);
    await banner(yugi).waitFor({ timeout: 8000 }).catch(() => {});
    await yugi.page.getByRole("button", { name: "Duel menu" }).click();
    check((await yugi.page.getByRole("button", { name: /^Take back your request/ }).count()) === 1, "the menu offers to take the request back");
    await yugi.page.getByRole("button", { name: /^Back to the duel/ }).click();
    await banner(kaiba).getByRole("button", { name: "Call it off" }).click({ timeout: 8000 });
    for (const p of [yugi, kaiba]) await p.page.getByRole("heading", { name: "Duel called off" }).waitFor({ timeout: 10000 }).catch(() => {});
    check((await yugi.page.getByRole("heading", { name: "Duel called off" }).count()) === 1 && (await kaiba.page.getByRole("heading", { name: "Duel called off" }).count()) === 1, "agreed: both see the duel called off");
    check((await kaiba.page.getByText("Nothing was recorded. You can challenge each other again.").count()) === 1, "it says nothing was recorded");
    await yugi.page.screenshot({ path: outPath(`duel-call-off-done-${tag}.png`) });

    // 3. Back to the match screen, not to a reward; the series is where it was and a new challenge goes out.
    await kaiba.page.getByRole("button", { name: "Back to the board" }).click();
    await kaiba.page.waitForURL(/record-match/, { timeout: 15000 }).catch(() => {});
    check(/record-match/.test(kaiba.page.url()), "leaving goes to the match screen");
    const series = (await yugi.api("GET", `/api/series/${seriesId}`)).series;
    check((series.matchHistory ?? []).length === 0, "no match was recorded");
    const again = await kaiba.api("POST", `/api/series/${seriesId}/duels`, { deckId: "main", against: "rival" });
    check(again.duel.status === "waiting", "a new challenge can be sent");
    await yugi.page.goto(`${BASE}/duel/?id=${duelId}`, { waitUntil: "networkidle" });
    check((await yugi.page.getByText(/That duel was called off/).count()) === 1, "the old duel's page says it was called off");
    check(problems.length === 0, `no page errors ${problems.join(" | ")}`);
} finally {
    await browser.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
