/// <reference lib="webworker" />
import createCore, { type OcgResponse } from "ocgcore-wasm";
import { decodeAnswer as decode, encodeAnswer as encode } from "@ygo/duel/answers";
import type { DeviceAnswers, DuelAnswer, DuelFrame, DuelOnDevice, DuelState } from "@ygo/shared";
import { createEngine, type CardRow, type Engine } from "@ygo/duel/engine";
import { DuelSession, type DuelSetup, type Team } from "@ygo/duel/session";

/*
 * A practice game against the bot, played on this device: EDOPro's engine (WebAssembly) and the
 * bot run here, off the page's thread, with the same card scripts the server has (fetched from
 * storage). The page sends the player's answers and gets back what happened; the answers given
 * (the bot's too) go to the server to keep, so the game can be picked up again after a reload.
 *
 * One worker serves a tab's games one after another (a match's games, the next match): the engine
 * is loaded once, and each WASM engine is hundreds of MB, so a tab must never start a worker a game.
 */

export type ToWorker =
    | { type: "open"; base: string; duelId: string; device: DuelOnDevice }
    | { type: "answer"; seq: number; answer: DuelAnswer }
    | { type: "back"; seq: number }
    | { type: "concede" }
    /** The game is left: its duel is let go. */
    | { type: "close" };

/** Each names the game it's about (`duelId`): one left may still have a message on its way. */
export type FromWorker = { duelId: string } & (
    | { type: "state"; frames: DuelFrame[]; state: DuelState }
    /** The game's answers from `from` on (earlier ones past `from` are taken back), and how it ended once it's over. */
    | ({ type: "answers" } & DeviceAnswers)
    | { type: "error"; message: string }
);

type Unnamed<T> = T extends unknown ? Omit<T, "duelId"> : never;
const post = (m: Unnamed<FromWorker>) => self.postMessage({ ...m, duelId });

async function json<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The duel engine's data didn't load (${res.status})`);
    return (await res.json()) as T;
}

let engine: Engine | null = null;
let root = "";
/** Scripts at hand: name → text, or null for a card with none. */
const scripts = new Map<string, string | null>();
/** Card scripts the engine asked for that aren't at hand yet. */
const misses = new Set<string>();

/** The engine for a version of its data, loaded once (a game of another version loads that one). */
async function loadEngine(base: string, id: string): Promise<Engine> {
    if (engine && root === `${base}/engine/${id}`) return engine;
    root = `${base}/engine/${id}`;
    scripts.clear();
    const [rows, strings, libs, core] = await Promise.all([
        json<Record<string, CardRow>>(`${root}/cards.json`),
        json<{ system: Record<string, string>; victory: Record<string, string> }>(`${root}/strings.json`),
        json<Record<string, string>>(`${root}/libs.json`),
        createCore({ sync: true }),
    ]);
    for (const [name, text] of Object.entries(libs)) scripts.set(name, text);
    engine = createEngine({
        core, newCore: () => createCore({ sync: true }), version: id, rows, strings,
        readFile(name) {
            if (scripts.has(name)) return scripts.get(name);
            // Every library came with libs.json: one not there doesn't exist (as on the server).
            if (!/^c\d+\.lua$/.test(name)) return null;
            misses.add(name);
            return undefined;
        },
    });
    return engine;
}

/** Fetches card scripts not at hand (a card with none is a 404). */
async function fetchScripts(names: Iterable<string>) {
    const wanted = [...new Set(names)].filter((n) => !scripts.has(n));
    for (let i = 0; i < wanted.length; i += 24) {
        await Promise.all(wanted.slice(i, i + 24).map(async (name) => {
            const res = await fetch(`${root}/scripts/${name}`);
            if (res.ok) scripts.set(name, await res.text());
            else if (res.status === 404 || res.status === 403) scripts.set(name, null);
            else throw new Error(`A card script didn't load (${res.status})`);
        }));
    }
}

let duelId = "";
let setup: DuelSetup;
let team: Team = 0;
let session: DuelSession | null = null;
/** How many of the game's answers the page has been sent. */
let sent = 0;

function build(answers: readonly OcgResponse[]) {
    session?.destroy();
    session = new DuelSession(engine!, setup, { pauseForBot: true });
    session.start(answers);
}

/**
 * Does `step` to the game; if the engine asked for a card script not at hand (a card an effect
 * brought in), fetches it and does the step again on the game rebuilt from before it.
 */
async function play(step: () => void) {
    const before = session ? [...session.answers] : null;
    for (let round = 0; ; round++) {
        misses.clear();
        step();
        if (!misses.size) return;
        if (round >= 3) throw new Error(`Card scripts missing: ${[...misses].join(", ")}`);
        await fetchScripts(misses);
        if (before) build(before);
    }
}

/** Whether the game was already over (and booked) when it was opened: then it's only looked at. */
let booked = false;

/** Tells the page what happened, and sends on the answers given since the last time (and the result, once it's over). */
function report(frames: DuelFrame[]) {
    const s = session!;
    const state = s.state(team, duelId);
    post({ type: "state", frames, state });
    if (booked) return;
    const end = state.result ? { winner: state.result.winner, reason: state.result.reason } : undefined;
    if (sent === s.answers.length && !end) return;
    post({ type: "answers", from: sent, answers: s.answers.slice(sent).map(encode), ...(end ? { end } : {}) });
    sent = s.answers.length;
    booked = !!end;
}

/**
 * The bot's decisions, one at a time, each shown as it's made: what came before (the player's
 * move) is already on the board while the bot thinks, and its turn plays out as it goes.
 */
async function think() {
    while (session?.botToThink) {
        // A message come in meanwhile (the game left, a concession) goes first; it thinks on after.
        await new Promise((r) => setTimeout(r));
        if (inbox) return;
        await play(() => session!.botThink());
        report(session!.takeFrames(team));
    }
}

async function handle(m: ToWorker) {
    switch (m.type) {
        case "open": {
            session?.destroy();
            session = null;
            duelId = m.duelId;
            setup = m.device.setup as DuelSetup;
            team = m.device.team;
            booked = m.device.over;
            const e = await loadEngine(m.base, m.device.engine);
            for (const [code, base] of Object.entries(m.device.learned)) e.learnAs(Number(code), base);
            const codes = [...setup.decks.flatMap((d) => [...d.main, ...d.extra]), ...Object.values(m.device.learned)];
            await fetchScripts(codes.map((c) => `c${c}.lua`));
            const answers = m.device.answers.map(decode);
            sent = answers.length;
            await play(() => build(answers));
            report(session!.framesOnConnect(team));
            await think();
            return;
        }
        case "close":
            session?.destroy();
            session = null;
            return;
        case "answer": {
            if (!session) return;
            const s = session;
            let ok = false;
            await play(() => {
                ok = session!.answer(team, m.seq, m.answer);
            });
            report(ok || s !== session ? session!.takeFrames(team) : []);
            await think();
            return;
        }
        case "back": {
            if (!session) return;
            const s = session;
            const answers = s.state(team, duelId).seq === m.seq ? s.backAnswers(team) : null;
            if (answers) {
                await play(() => build(answers));
                sent = Math.min(sent, answers.length);
            }
            report([]);
            await think();
            return;
        }
        case "concede":
            if (!session) return;
            session.concede(team);
            report(session.takeFrames(team));
            return;
    }
}

// One message at a time, in order.
let queue: Promise<unknown> = Promise.resolve();
/** Messages come in and not yet handled. */
let inbox = 0;
self.onmessage = (event: MessageEvent<ToWorker>) => {
    inbox++;
    queue = queue.then(() => {
        inbox--;
        return handle(event.data);
    }).catch((error: unknown) => {
        post({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
};
