/**
 * What Yugi is saying right now. Screens hand him lines (see lines.ts) with `say`; the
 * GuideSprite on the page shows the current one, like a dialogue in old games:
 *  - lines worth hearing (pulls, results) queue up as a conversation. While more are
 *    waiting he stays and a tap on the tablet moves on; after the last he leaves by himself;
 *  - a higher-priority line (a result) cuts in, and a tip it cuts off is dropped;
 *  - tips (cards looked at, set lists) never queue behind a conversation and are
 *    rate-limited, so browsing a card list doesn't turn into a lecture;
 *  - a line isn't said twice in a visit (keys remembered in sessionStorage).
 */
import { PRIORITY, type Line } from "@/lib/guide/lines";

export type Spoken = Line & { at: number };
/** What's on the tablet, and how many lines are waiting after it. */
export type GuideState = { line: Spoken | null; more: number };

/** Gap between two tips (card views, set lists). */
const TIP_GAP_MS = 15_000;
const SEEN_KEY = "ygo-guide-seen";
const isTip = (l: Line) => l.priority <= PRIORITY.details;

let state: GuideState = { line: null, more: 0 };
let queue: Spoken[] = [];
let lastTip = -Infinity;
let expiry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

/** Publish the current line and queue. A line clears itself in time even if no Yugi is on the page to say it. */
function publish(line: Spoken | null) {
    // Re-armed on every change: a line that gains lines behind it waits for a tap (up to two minutes) instead of timing out.
    clearTimeout(expiry);
    if (line) expiry = setTimeout(() => guide.done(line.at), queue.length ? 120_000 : 4_000 + line.text.length * 55);
    state = { line, more: queue.length };
    listeners.forEach((l) => l());
}

/** Off in Options (or the nav's Yugi button): read from the same setting the menu writes. */
const enabled = () => {
    try {
        return localStorage.getItem("ygo-guide") !== "off";
    } catch {
        return true;
    }
};

function seen(): Set<string> {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
    } catch {
        return new Set();
    }
}
function markSeen(key: string) {
    try {
        const all = seen();
        all.add(key);
        sessionStorage.setItem(SEEN_KEY, JSON.stringify([...all].slice(-300)));
    } catch {
        /* storage blocked: he may repeat himself */
    }
}

export const guide = {
    /** Offer a line. Returns whether he'll say it (now, or later in the conversation). */
    say(line: Line | null): boolean {
        if (!line || !enabled() || seen().has(line.key)) return false;
        const now = Date.now();
        if (isTip(line) && now - lastTip < TIP_GAP_MS) return false;
        const spoken = { ...line, at: now };
        const current = state.line;
        if (!current) publish(spoken);
        else if (line.priority > current.priority) {
            // Cut in; a conversation line it interrupts comes back after it.
            if (!isTip(current)) queue.unshift(current);
            publish(spoken);
        } else if (!isTip(line)) {
            queue.push(spoken);
            publish(current);
        } else return false;
        if (isTip(line)) lastTip = now;
        markSeen(line.key);
        return true;
    },
    /** Offer several lines as one conversation, in order. */
    sayAll(lines: Line[]) {
        for (const line of lines) guide.say(line);
    },
    /** On to the next line (a tap), or away if that was the last. `at` names the line, so a late call for an old one does nothing. */
    done(at?: number) {
        if (!state.line || (at !== undefined && state.line.at !== at)) return;
        const next = queue.shift();
        publish(next ? { ...next, at: Date.now() } : null);
    },
    /** Turned off in Options or the nav: he stops talking at once. */
    silence() {
        queue = [];
        publish(null);
    },
    state: () => state,
    current: () => state.line,
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    /** Tests only. */
    reset() {
        queue = [];
        lastTip = -Infinity;
        publish(null);
        try {
            sessionStorage.removeItem(SEEN_KEY);
        } catch {
            /* nothing to clear */
        }
    },
};

const EMPTY: GuideState = { line: null, more: 0 };
/** The server render's state: nobody speaking. */
export const serverState = () => EMPTY;

/** A seed for picking among a line's wordings: different each visit, steady within one render. */
export const seed = () => Math.floor(Math.random() * 1000);

// Development builds: the browser drivers read and drive the guide from the page (window.__guide).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const w = window as unknown as { __guide: typeof guide; __guideLines: unknown };
    w.__guide = guide;
    void import("@/lib/guide/lines").then((m) => (w.__guideLines = m));
}
