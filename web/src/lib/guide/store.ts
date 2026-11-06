/**
 * What Yugi is saying right now. Screens hand him lines (see lines.ts) with `say`; the
 * GuideSprite on the page shows the current one. One line at a time:
 *  - a higher-priority line (a result, a pull) cuts in over a tip; a lower one waits its
 *    turn only if it's still fresh when he's done, else it's dropped;
 *  - tips are rate-limited, so browsing a card list doesn't turn into a lecture;
 *  - a line isn't said twice in a visit (keys remembered in sessionStorage).
 */
import { PRIORITY, type Line } from "@/lib/guide/lines";

export type Spoken = Line & { at: number };

/** Gap between two tips (card views, set lists). */
const TIP_GAP_MS = 15_000;
/** A line waiting behind another is dropped if it waited longer than this. */
const STALE_MS = 6_000;
const SEEN_KEY = "ygo-guide-seen";

let current: Spoken | null = null;
let waiting: Spoken | null = null;
let lastTip = -Infinity;
let expiry: ReturnType<typeof setTimeout> | undefined;

/** Make `line` the one on screen. It clears itself in time even if no Yugi is on the page to say it. */
function show(line: Spoken | null) {
    current = line;
    clearTimeout(expiry);
    if (line) expiry = setTimeout(() => guide.done(line.at), 4_000 + line.text.length * 55);
}
/** Off in Options (or the nav's Yugi button): read from the same setting the menu writes. */
const enabled = () => {
    try {
        return localStorage.getItem("ygo-guide") !== "off";
    } catch {
        return true;
    }
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

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
    /** Offer a line. Returns whether he'll say it (now or right after the current one). */
    say(line: Line | null): boolean {
        if (!line || !enabled() || seen().has(line.key)) return false;
        const now = Date.now();
        const isTip = line.priority <= PRIORITY.details;
        if (isTip && now - lastTip < TIP_GAP_MS) return false;
        const spoken = { ...line, at: now };
        if (!current || line.priority > current.priority) {
            show(spoken);
        } else if (!waiting || line.priority >= waiting.priority) {
            waiting = spoken;
        } else return false;
        if (isTip) lastTip = now;
        markSeen(line.key);
        emit();
        return true;
    },
    /** He's done with the current line (it timed out or was tapped away). `at` names the line, so a late call for an old one does nothing. */
    done(at?: number) {
        if (!current || (at !== undefined && current.at !== at)) return;
        const next = waiting && Date.now() - waiting.at < STALE_MS ? { ...waiting, at: Date.now() } : null;
        waiting = null;
        show(next);
        emit();
    },
    /** Turned off in Options or the nav: he stops talking at once. */
    silence() {
        show(null);
        waiting = null;
        emit();
    },
    current: () => current,
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    /** Tests only. */
    reset() {
        show(null);
        waiting = null;
        lastTip = -Infinity;
        try {
            sessionStorage.removeItem(SEEN_KEY);
        } catch {
            /* nothing to clear */
        }
    },
};

/** A seed for picking among a line's wordings: different each visit, steady within one render. */
export const seed = () => Math.floor(Math.random() * 1000);

// Development builds: the browser drivers read and drive the guide from the page (window.__guide).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const w = window as unknown as { __guide: typeof guide; __guideLines: unknown };
    w.__guide = guide;
    void import("@/lib/guide/lines").then((m) => (w.__guideLines = m));
}
