/**
 * Phones: a swipe left or right across a page goes to the next or previous tab, in tab
 * bar order. The page that arrives slides in from the side the swipe came from (the
 * template reads `takeSwipe`).
 *
 * A swipe is ignored when it starts on something with its own gestures or horizontal
 * scrolling (marked `data-own-swipe`, a dialog, a form field, Yugi, a row that scrolls
 * sideways), when it's short, slow or mostly vertical, and while a dialog is open.
 * `data-own-swipe="next"` (or "prev") claims only swipes that way: a carousel at its
 * first page lets a swipe back through to the previous tab (see `edgeSwipe`).
 */

/** How far, how straight and how quick a swipe has to be. */
const MIN_DX = 70;
const MAX_MS = 700;
const STRAIGHT = 2; // |dx| at least twice |dy|

let pending: -1 | 0 | 1 = 0;
/** The direction the last swipe went (1: to the next tab), once; 0 if the page wasn't reached by a swipe. */
export function takeSwipe(): -1 | 0 | 1 {
    const d = pending;
    pending = 0;
    return d;
}

/** Which swipes something with pages of its own keeps, given its page and page count: none past its edges. */
export function edgeSwipe(page: number, pages: number): "both" | "next" | "prev" | "none" {
    const back = page > 0, on = page < pages - 1;
    return back && on ? "both" : on ? "next" : back ? "prev" : "none";
}

type Claim = "both" | "next" | "prev" | "none";
const OWN = "[role=dialog], input, textarea, select, [role=slider], .guide";

/** Which swipes a touch starting at `el` leaves to something else (its own gesture or a sideways scroll). */
function claimed(el: Element | null): Claim {
    if (!el || el.closest(OWN)) return "both";
    const own = el.closest("[data-own-swipe]");
    if (own) {
        const v = own.getAttribute("data-own-swipe");
        if (v === "next" || v === "prev" || v === "none") return v;
        return "both";
    }
    for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) {
        const ox = getComputedStyle(at).overflowX;
        if ((ox === "auto" || ox === "scroll") && at.scrollWidth > at.clientWidth + 1) return "both";
    }
    return "none";
}

/**
 * Listens for swipes; `go(dir)` moves to the neighbouring tab and returns whether there
 * was one. Returns the cleanup.
 */
export function listenForSwipes(go: (dir: -1 | 1) => boolean): () => void {
    let start: { x: number; y: number; t: number; claim: Claim } | null = null;
    const down = (e: TouchEvent) => {
        const t = e.touches[0];
        const claim = claimed(e.target as Element);
        start = e.touches.length === 1 && t && claim !== "both" && !document.querySelector("[role=dialog]") ? { x: t.clientX, y: t.clientY, t: performance.now(), claim } : null;
    };
    const up = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        const s = start;
        start = null;
        if (!s || !t) return;
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (Math.abs(dx) < MIN_DX || Math.abs(dx) < STRAIGHT * Math.abs(dy) || performance.now() - s.t > MAX_MS) return;
        // Swiping left (finger moving left) brings in the next tab, like turning a page.
        const dir = dx < 0 ? 1 : -1;
        if (s.claim === (dir > 0 ? "next" : "prev")) return;
        pending = dir;
        if (!go(dir)) pending = 0;
    };
    const cancel = () => (start = null);
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
        document.removeEventListener("touchstart", down);
        document.removeEventListener("touchend", up);
        document.removeEventListener("touchcancel", cancel);
    };
}
