"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * What a line of Yugi's points at: the first element on screen matching `target` (a CSS
 * selector, alternatives comma-separated), followed as it moves, and where he should stand
 * so he doesn't cover it.
 *  - Phones: from the top when the target is in the lower half (his strip is at the bottom).
 *  - Wider screens: in the right-hand corner when his left-hand corner would cover it.
 *    Nothing on the page moves for him either way.
 *
 * The ring is drawn next to Yugi (in his own container) rather than on the target, so a
 * container that clips its contents can't cut it off, and inside a scaled page (the deck
 * builder) it's placed in that page's own coordinates.
 */
export type Spot = { left: number; top: number; width: number; height: number };
export type Placement = "left" | "right" | "top";

const PAD = 6;

/** Where a fixed child of `el` is placed against (on screen), and its scale: the viewport, or a scaled page. */
function containingBlock(el: Element | null): { x: number; y: number; w: number; h: number; scale: number } {
    for (let at = el?.parentElement; at && at !== document.body; at = at.parentElement) {
        const s = getComputedStyle(at);
        if (s.transform !== "none" || s.filter !== "none" || s.perspective !== "none" || /transform|filter/.test(s.willChange)) {
            const r = at.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height, scale: at.offsetWidth ? r.width / at.offsetWidth : 1 };
        }
    }
    return { x: 0, y: 0, w: innerWidth, h: innerHeight, scale: 1 };
}

export function findTarget(target: string | undefined): Element | null {
    if (!target) return null;
    for (const sel of target.split(",")) {
        try {
            const el = document.querySelector(sel.trim());
            if (el && el.getBoundingClientRect().width > 0) return el;
        } catch {
            /* a selector this browser can't read: try the next */
        }
    }
    return null;
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * Wider screens: the corner that covers least, of the target above all (ten times over), then
 * of the page's buttons and links. His left-hand corner wins a tie.
 */
function pickCorner(guideEl: HTMLElement | null, target: DOMRect): Placement {
    if (!guideEl) return "left";
    // His size on screen, and his two corners of the page he stands in (on screen).
    const g = guideEl.getBoundingClientRect(), cb = containingBlock(guideEl);
    const at = (parseFloat(getComputedStyle(guideEl).left) || 0) * cb.scale;
    const w = g.width, bottom = cb.y + cb.h, top = bottom - g.height;
    const corners: Record<"left" | "right", Box> = {
        left: { left: cb.x + at, right: cb.x + at + w, top, bottom },
        right: { left: cb.x + cb.w - w, right: cb.x + cb.w, top, bottom },
    };
    const controls = [...document.querySelectorAll("a, button, input, select")]
        .filter((el) => !guideEl.contains(el))
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0);
    const cost = (c: Box) => overlap(c, target) * 10 + controls.reduce((sum, b) => sum + overlap(c, b), 0);
    return cost(corners.right) < cost(corners.left) ? "right" : "left";
}

/** Follows `target` while `active`; returns the ring (in `root`'s coordinates) and where Yugi should stand. */
export function useSpotlight(root: RefObject<HTMLElement | null>, target: string | undefined, active: boolean, lineAt: number | undefined) {
    const [spot, setSpot] = useState<Spot | null>(null);
    const [placement, setPlacement] = useState<Placement>("left");

    useLayoutEffect(() => {
        if (!active || !target) {
            setSpot(null);
            setPlacement("left");
            return;
        }
        const el = findTarget(target);
        if (!el) {
            setSpot(null);
            setPlacement("left");
            return;
        }
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        // Where he stands, decided once per line from where the target is as he starts.
        const r = el.getBoundingClientRect();
        if (window.matchMedia("(max-width: 767px)").matches) setPlacement(r.top + r.height / 2 > innerHeight / 2 ? "top" : "left");
        else setPlacement(pickCorner(root.current, r));
        let frame = 0;
        let last = "";
        const follow = () => {
            const b = el.getBoundingClientRect(), cb = containingBlock(root.current);
            const next = { left: (b.left - cb.x) / cb.scale - PAD, top: (b.top - cb.y) / cb.scale - PAD, width: b.width / cb.scale + 2 * PAD, height: b.height / cb.scale + 2 * PAD };
            const key = `${Math.round(next.left)},${Math.round(next.top)},${Math.round(next.width)},${Math.round(next.height)}`;
            if (key !== last) {
                last = key;
                setSpot(next);
            }
            frame = requestAnimationFrame(follow);
        };
        follow();
        return () => cancelAnimationFrame(frame);
        // Once per line (its `at`), not per render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, target, lineAt]);

    return { spot, placement };
}
