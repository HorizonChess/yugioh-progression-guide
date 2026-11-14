// A rival the driver plays itself: a second duelist in a duo series, with exactly the deck the test
// names, answering over the duel's socket. The test says what it plays (`play`); anything it leaves
// alone gets the plain answer (end the turn, pass, the first card offered). No waiting for a bot to
// happen to do the thing under test.
//
//   const { you, rival, duelId } = await rivalDuel(browser, { you: [...40 ids], rival: [...40 ids], viewport });
//   const game = rival.play(duelId, (p) => (p.kind === "actions" ? activate(p, CARD) : null));
//   ... drive `you.page` ...
//   game.close();
//
// Needs the test API (npm run test-server -w @ygo/api) and the web app pointed at it.

import WebSocket from "ws";
import { BASE } from "./_lib.mjs";

export const API = process.env.API_BASE || "http://localhost:4100";

/** The plain answer to any question: move on, pass, take what's offered first. */
export function plainAnswer(p) {
    if (p.kind === "actions") return { kind: "choice", id: (p.next.find((n) => n.to === "EP") ?? p.next[0]).id };
    if (p.kind === "chain") return { kind: "choice", id: p.pass ?? p.options[0].id };
    if (p.kind === "cards") return p.step ? (p.step.canFinish && p.step.chosen.length >= p.min ? { kind: "done" } : { kind: "choice", id: p.cards.find((c) => !p.step.chosen.some((x) => x.id === c.id)).id }) : { kind: "many", ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
    if (p.kind === "place") return { kind: "many", ids: p.zones.slice(0, p.count).map((z) => z.id) };
    if (p.kind === "yesno") return { kind: "choice", id: 1 };
    return { kind: "choice", id: p.options[0].id };
}

/** In an `actions` question: activate this card if it's offered (else null, for the plain answer). */
export function activate(p, code) {
    const a = p.kind === "actions" && p.actions.find((x) => x.verb === "activate" && x.code === code);
    return a ? { kind: "choice", id: a.id } : null;
}

/** A signed-up player in a browser context of their own, who can call the API. */
export async function signUp(browser, name, viewport = { width: 1440, height: 900 }) {
    const context = await browser.newContext(viewport.width < 600 ? { viewport, isMobile: true, hasTouch: true } : { viewport });
    await context.addInitScript(() => localStorage.setItem("ygo-guide", "off"));
    const res = await context.request.post(`${API}/api/auth/signup`, { headers: { origin: BASE }, data: { email: `${name.toLowerCase()}@example.com`, password: "heart of the cards", duelistName: name } });
    if (!res.ok()) throw new Error(`sign-up failed for ${name}: ${res.status()}`);
    const api = async (method, path, data) => {
        const r = await context.request.fetch(`${API}${path}`, { method, headers: { origin: BASE }, ...(data ? { data } : {}) });
        if (!r.ok()) throw new Error(`${name}: ${method} ${path} -> ${r.status()} ${await r.text()}`);
        return r.status() === 204 ? null : r.json();
    };

    /**
     * Plays this player's side of a duel over its socket: `play(prompt, state)` answers what the test
     * cares about (null for the plain answer). `events`: everything this player was shown.
     */
    const play = async (duelId, choose = () => null) => {
        const cookie = (await context.cookies(API)).map((c) => `${c.name}=${c.value}`).join("; ");
        const events = [];
        let answered = -1, socket = null, stopped = false;
        const connect = () => {
            socket = new WebSocket(`${API.replace(/^http/, "ws")}/api/duels/${duelId}/live`, { headers: { cookie, origin: BASE } });
            socket.on("message", (data) => {
                const m = JSON.parse(String(data));
                if (m.type !== "state") return;
                for (const f of m.frames) events.push(...f.events);
                const p = m.state?.prompt;
                if (!p || m.state.seq === answered) return;
                answered = m.state.seq;
                const answer = choose(p, m.state) ?? plainAnswer(p);
                socket.send(JSON.stringify({ type: "answer", seq: m.state.seq, answer }));
            });
            socket.on("close", () => !stopped && setTimeout(connect, 500));
            socket.on("error", () => {});
        };
        connect();
        return {
            events,
            close() {
                stopped = true;
                socket?.close();
            },
        };
    };
    return { name, context, api, play };
}

/**
 * Two players in a duo series, each with exactly the main deck given (imported into their
 * collection), and a challenge from `you` that the rival has accepted. Rock-paper-scissors is
 * left to the test.
 */
export async function rivalDuel(browser, { you: yourDeck, rival: theirDeck, viewport }) {
    const suffix = Date.now().toString(36).slice(-5);
    const you = await signUp(browser, `Yugi${suffix}`, viewport);
    const rival = await signUp(browser, `Kaiba${suffix}`, viewport);
    // A series that skips the first set: each player may import their collection once.
    const seriesId = (await you.api("POST", "/api/series", { name: "Scripted", mode: "duo", startSetIndex: 1, packsPerSet: 12 })).series.id;
    const { code } = await you.api("POST", `/api/series/${seriesId}/invites`);
    await rival.api("POST", "/api/invites/accept", { code });
    for (const [p, main] of [[you, yourDeck], [rival, theirDeck]]) {
        await p.api("POST", `/api/series/${seriesId}/collection/import`, { cardIds: main, mode: "replace" });
        await p.api("PUT", `/api/series/${seriesId}/decks/main`, { name: "Main", mainDeck: main, extraDeck: [], sideDeck: [] });
    }
    const duelId = (await you.api("POST", `/api/series/${seriesId}/duels`, { deckId: "main", against: "rival" })).duel.id;
    await rival.api("POST", `/api/duels/${duelId}/accept`, { deckId: "main" });
    you.page = await you.context.newPage();
    return { you, rival, duelId, seriesId };
}
