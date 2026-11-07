"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * What a line of Yugi's points at: the first element on screen matching `target` (a CSS
 * selector, alternatives comma-separated), followed as it moves, and where he should stand
 * so he doesn't cover it.
 *  - Phones: from the top when the target is in the lower half (his strip is at the bottom).
 *  - Wider screens: always his left-hand corner. When his tablet would cover the target,
 *    it rises above it, like a speech bubble, while he stays standing in his corner.
 *    Nothing on the page moves for him either way.
 *
 * The ring is drawn next to Yugi (in his own container) rather than on the target, so a
 * container that clips its contents can't cut it off, and inside a scaled page (the deck
 * builder) it's placed in that page's own coordinates.
 */
export type Spot = { left: number; top: number; width: number; height: number };
export type Placement = "left" | "top";

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
 * Wider screens: how far his tablet rises (in the page's own pixels) so it sits above the
 * target instead of on it. 0 when it doesn't cover it; at most half the page's height.
 */
function tabletRise(guideEl: HTMLElement | null, target: DOMRect): number {
    const tablet = guideEl?.querySelector(".guide__tablet");
    if (!guideEl || !tablet) return 0;
    const cb = containingBlock(guideEl);
    // Where the tablet is once he's in: he may still be off to the left, sliding in.
    const at = (parseFloat(getComputedStyle(guideEl).left) || 0) * cb.scale;
    const dx = cb.x + at - guideEl.getBoundingClientRect().left;
    const t = tablet.getBoundingClientRect();
    const rise = parseFloat(getComputedStyle(guideEl).getPropertyValue("--guide-rise")) || 0;
    const resting = { left: t.left + dx, right: t.right + dx, top: t.top + rise * cb.scale, bottom: t.bottom + rise * cb.scale };
    if (!overlap(resting, target)) return 0;
    const up = (resting.bottom - (target.top - 12)) / cb.scale;
    return Math.max(0, Math.min(up, cb.h / cb.scale / 2));
}

/** Follows `target` while `active`; returns the ring (in `root`'s coordinates) and where Yugi should stand. */
export function useSpotlight(root: RefObject<HTMLElement | null>, target: string | undefined, active: boolean, lineAt: number | undefined) {
    const [spot, setSpot] = useState<Spot | null>(null);
    const [placement, setPlacement] = useState<Placement>("left");
    const [rise, setRise] = useState(0);

    useLayoutEffect(() => {
        if (!active || !target) {
            setSpot(null);
            setPlacement("left");
            setRise(0);
            return;
        }
        const el = findTarget(target);
        if (!el) {
            setSpot(null);
            setPlacement("left");
            setRise(0);
            return;
        }
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        // Where he stands, decided once per line from where the target is as he starts.
        const r = el.getBoundingClientRect();
        if (window.matchMedia("(max-width: 767px)").matches) {
            setPlacement(r.top + r.height / 2 > innerHeight / 2 ? "top" : "left");
            setRise(0);
        } else {
            setPlacement("left");
            setRise(tabletRise(root.current, r));
        }
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

    return { spot, placement, rise };
}
