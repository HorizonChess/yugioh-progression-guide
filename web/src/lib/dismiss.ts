"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Keeps the newest callback in a ref, so a long-lived listener always calls the current one. */
function useLatest<T>(value: T) {
    const ref = useRef(value);
    useLayoutEffect(() => {
        ref.current = value;
    });
    return ref;
}

/** A pop-up (a ⋯ menu): a tap anywhere outside `ref`, or Escape, closes it while it's open; that tap does nothing else. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
    const latest = useLatest(close);
    useEffect(() => {
        if (!open) return;
        const outside = (e: PointerEvent) => {
            if (ref.current?.contains(e.target as Node)) return;
            latest.current();
            // the tap that closes the menu does only that: it doesn't also press what's underneath
            const eat = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); removeEventListener("click", eat, true); };
            addEventListener("click", eat, true);
            setTimeout(() => removeEventListener("click", eat, true), 500);
        };
        const key = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("keydown", key);
        };
    }, [open, ref, latest]);
}

/** The scrollable box the touch began in (inside `root`), if its content overflows. */
function scrollerOf(target: EventTarget | null, root: HTMLElement) {
    for (let el = target as HTMLElement | null; el && el !== root.parentElement; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
}

/**
 * A bottom sheet you can swipe down to close: it follows the finger down and, past a short pull
 * or on a quick flick, slides away and calls `onClose`; otherwise it springs back. A pull that
 * starts in content scrolled away from its top scrolls that content instead. `move` is the
 * element that slides (the sheet itself by default). Touch only, and only while `enabled`.
 */
export function useSwipeClose(ref: RefObject<HTMLElement | null>, onClose: () => void, { enabled = true, move }: { enabled?: boolean; move?: RefObject<HTMLElement | null> } = {}) {
    const latest = useLatest(onClose);
    useEffect(() => {
        const root = ref.current;
        if (!root || !enabled) return;
        let start: { x: number; y: number; t: number; scroller: HTMLElement | null } | null = null;
        let dragging = false, dy = 0, lastY = 0, lastT = 0, v = 0;
        const target = () => move?.current ?? root;
        const onStart = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!t || e.touches.length > 1) return;
            start = { x: t.clientX, y: t.clientY, t: e.timeStamp, scroller: scrollerOf(e.target, root) };
            dragging = false; dy = 0; v = 0; lastY = t.clientY; lastT = e.timeStamp;
        };
        const onMove = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!start || !t) return;
            const ddy = t.clientY - start.y, ddx = t.clientX - start.x;
            if (!dragging) {
                if (Math.abs(ddy) < 8 && Math.abs(ddx) < 8) return;
                const atTop = !start.scroller || start.scroller.scrollTop <= 0;
                if (ddy > 0 && ddy > Math.abs(ddx) * 1.2 && atTop) dragging = true;
                else { start = null; return; }
            }
            e.preventDefault();
            dy = Math.max(0, ddy);
            v = (t.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
            lastY = t.clientY; lastT = e.timeStamp;
            const el = target();
            el.style.transition = "none";
            el.style.transform = `translateY(${dy}px)`;
        };
        const onEnd = () => {
            if (!start) return;
            start = null;
            if (!dragging) return;
            dragging = false;
            const el = target();
            el.style.transition = "transform .22s cubic-bezier(.2,.8,.3,1)";
            if (dy > 90 || v > 0.6) {
                el.style.transform = "translateY(100%)";
                // a dismissed drag shouldn't leave a click behind on whatever is underneath
                const eat = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
                addEventListener("click", eat, true);
                setTimeout(() => {
                    removeEventListener("click", eat, true);
                    el.style.transition = ""; el.style.transform = "";
                    latest.current();
                }, 200);
            } else {
                el.style.transform = "";
                setTimeout(() => (el.style.transition = ""), 240);
            }
        };
        root.addEventListener("touchstart", onStart, { passive: true });
        root.addEventListener("touchmove", onMove, { passive: false });
        root.addEventListener("touchend", onEnd);
        root.addEventListener("touchcancel", onEnd);
        return () => {
            root.removeEventListener("touchstart", onStart);
            root.removeEventListener("touchmove", onMove);
            root.removeEventListener("touchend", onEnd);
            root.removeEventListener("touchcancel", onEnd);
        };
    }, [ref, move, enabled, latest]);
}
