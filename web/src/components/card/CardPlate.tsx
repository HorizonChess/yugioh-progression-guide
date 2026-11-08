"use client";

import NavArrow from "@/components/ui/NavArrow";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSwipeClose } from "@/lib/dismiss";
import { createPortal } from "react-dom";
import { plate, type StageCard } from "@/components/packs/stage/plate";
import { MarkToggle } from "@/components/card/LookLater";
import "@/components/packs/stage/pack-stage.css";

/** The card-styled details plate (frame, name plate, stars, text box), as the opener shows it. */
export function CardPlate({ card, className = "" }: { card: StageCard; className?: string }) {
    const host = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = host.current;
        if (!el) return;
        const p = plate(card, className);
        el.replaceChildren(p);
        return () => p.remove();
    }, [card, className]);
    return <div ref={host} className="contents" />;
}

/**
 * Desktop: resting the mouse on a card shows its plate beside it after a beat.
 * Spread `bind(card)` onto each card element and render `peek` once.
 */
export function useCardPeek() {
    const [peek, setPeek] = useState<{ card: StageCard; left: number; top: number } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const hide = () => {
        clearTimeout(timer.current);
        setPeek(null);
    };
    const bind = (card: StageCard) => ({
        onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
            if (e.pointerType !== "mouse") return;
            const b = e.currentTarget.getBoundingClientRect(), w = innerWidth >= 768 ? 390 : 330;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                const onLeft = b.left + b.width / 2 > innerWidth / 2;
                const left = Math.max(8, Math.min(innerWidth - w - 8, onLeft ? b.left - w - 14 : b.right + 14));
                setPeek({ card, left, top: Math.max(8, Math.min(innerHeight - 440, b.top)) });
            }, 220);
        },
        onPointerLeave: hide,
    });
    const node = peek && typeof document !== "undefined"
        ? createPortal(<div className="ps-peek ps-peek--react" style={{ left: peek.left, top: peek.top }}><CardPlate card={peek.card} /></div>, document.body)
        : null;
    return { bind, peek: node, hide };
}

/**
 * Where a close-up flies from when its opener doesn't say: the card (its picture)
 * last pressed on the page, if that was a moment ago. Every list of cards gets the
 * flight this way without wiring; a list whose cards move (the collection, the pack
 * opener) passes `from` so closing flies back to wherever the card is now.
 */
let lastPress: { el: Element; at: number } | null = null;
if (typeof window !== "undefined") {
    addEventListener("pointerdown", (e) => {
        const hit = (e.target as Element | null)?.closest?.("button, a, [role=button], .ps-card");
        if (hit && !hit.closest(".closeup")) lastPress = { el: hit.querySelector("img") ?? hit, at: performance.now() };
    }, true);
}
const pressedCard = () => (lastPress && performance.now() - lastPress.at < 1500 && lastPress.el.isConnected ? lastPress.el : null);

const FLY_IN = { duration: 450, easing: "cubic-bezier(.22,.9,.3,1)" };
const FLY_OUT = { duration: 350, easing: "cubic-bezier(.6,0,.8,.4)" };
/** The transform that puts `el` (laid out where it ends up) over `src`, centre on centre, scaled to its width. */
function over(el: Element, src: Element) {
    const a = src.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (!a.width || !b.width) return null;
    return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${a.width / b.width})`;
}
const isPhone = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 767px)").matches;

/**
 * The close-up, the one every screen uses (the pack opener too): the card flies up
 * out of where it was tapped, large (it leans toward the pointer), its details
 * sliding in beside it on wide screens or rising in a sheet under it on phones;
 * closing flies it back. `action` adds a button under the details (e.g. ban this
 * card). Click outside or press Escape to close.
 */
export function CardCloseUp({ card, onClose, action, mark = false, onPrev, onNext, position, from }: {
    card: StageCard;
    onClose: () => void;
    action?: ReactNode;
    /** A bookmark beside the card, to mark it to look at later. */
    mark?: boolean;
    /** Step to the card before / after in its list: a swipe, the arrow keys or the side arrows. */
    onPrev?: () => void;
    onNext?: () => void;
    /** Where this card is in that list, e.g. "12 / 144". */
    position?: string;
    /** The element showing the card now (on the page, under the close-up): it flies out of and back into it. */
    from?: () => Element | null | undefined;
}) {
    const tilt = useRef<HTMLDivElement>(null);
    // On phones a pull down on the card or its sheet closes it, as with any bottom sheet.
    const rootEl = useRef<HTMLDivElement>(null);
    const bodyEl = useRef<HTMLDivElement>(null);
    useSwipeClose(rootEl, onClose, { enabled: isPhone(), move: bodyEl });
    // Which way the last step went, so the new card slides in from that side.
    const [dir, setDir] = useState(0);
    const step = (d: 1 | -1) => {
        const go = d > 0 ? onNext : onPrev;
        if (!go) return;
        setDir(d);
        go();
    };

    // The card it opened on, for flying back to the press when no `from` is given.
    const [opened] = useState(() => ({ key: `${card.card.id}-${card.code}`, el: from?.() ?? pressedCard() }));
    const origin = () => from?.() ?? (`${card.card.id}-${card.code}` === opened.key ? opened.el : null);
    useLayoutEffect(() => {
        const body = bodyEl.current, el = body?.querySelector(".closeup__card"), side = body?.querySelector(".closeup__side");
        const src = opened.el?.isConnected ? opened.el : null;
        const t = el && src && over(el, src);
        if (el && t) {
            (el as HTMLElement).style.animation = "none";
            el.animate([{ transform: t }, { transform: "none" }], FLY_IN);
        }
        side?.animate(isPhone() ? [{ transform: "translateY(100%)" }, { transform: "none" }] : [{ opacity: 0, transform: "translateX(-20px)" }, { opacity: 1, transform: "none" }],
            { duration: isPhone() ? 400 : 350, delay: isPhone() ? 100 : 200, easing: "cubic-bezier(.22,.9,.3,1)", fill: "backwards" });
        // Only on opening: stepping to another card has its own slide.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const closing = useRef(false);
    const close = () => {
        if (closing.current) return;
        closing.current = true;
        const root = rootEl.current, el = bodyEl.current?.querySelector(".closeup__card");
        const dst = origin();
        const t = el && dst?.isConnected && over(el, dst);
        if (el && t) el.animate([{ transform: "none" }, { transform: t }], { ...FLY_OUT, fill: "forwards" });
        else el?.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { ...FLY_OUT, fill: "forwards" });
        bodyEl.current?.querySelector(".closeup__side")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
        const fade = root?.animate([{ backgroundColor: getComputedStyle(root).backgroundColor }, { backgroundColor: "rgba(4, 3, 8, 0)" }], { ...FLY_OUT, fill: "forwards" });
        root?.querySelectorAll(".closeup__nav, .ps-close-hint").forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" }));
        if (fade) fade.onfinish = () => onClose();
        else onClose();
    };

    const latest = useRef({ step, close });
    useLayoutEffect(() => {
        latest.current = { step, close };
    });
    useLayoutEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") latest.current.close();
            if (e.key === "ArrowRight") latest.current.step(1);
            if (e.key === "ArrowLeft") latest.current.step(-1);
        };
        addEventListener("keydown", onKey);
        return () => removeEventListener("keydown", onKey);
    }, []);
    // A sideways swipe steps through the list; a tap off the card and its details
    // closes. Both are read from the pointer itself: after a swipe, phones may send
    // no click for the next tap.
    const press = useRef<{ x: number; y: number; at: number } | null>(null);
    const down = (e: React.PointerEvent) => {
        press.current = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const up = (e: React.PointerEvent) => {
        const s = press.current;
        press.current = null;
        if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && (onPrev || onNext)) return step(dx < 0 ? 1 : -1);
        const tap = Math.hypot(dx, dy) < 10 && performance.now() - s.at < 600;
        if (!tap || (e.target as Element).closest(".closeup__card, .closeup__side, .closeup__nav")) return;
        // This closes on finger-up, so the tap's own click would land on whatever is
        // underneath (another pocket would open): swallow that one click.
        // (Only that one: a fresh press means the next click is a real tap, so it goes through.)
        const stop = () => {
            removeEventListener("click", eat, true);
            removeEventListener("pointerdown", stop, true);
        };
        const eat = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
            stop();
        };
        addEventListener("click", eat, true);
        addEventListener("pointerdown", stop, true);
        setTimeout(stop, 450);
        close();
    };
    const lean = (e: React.PointerEvent) => {
        const el = tilt.current;
        if (!el) return;
        const b = el.getBoundingClientRect();
        const dx = Math.max(-0.5, Math.min(0.5, (e.clientX - b.left) / b.width - 0.5));
        const dy = Math.max(-0.5, Math.min(0.5, (e.clientY - b.top) / b.height - 0.5));
        el.style.setProperty("--rx", `${(-dy * 10).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(dx * 12).toFixed(2)}deg`);
        el.style.setProperty("--mx", (dx + 0.5) * 100 + "%");
        el.style.setProperty("--my", (dy + 0.5) * 100 + "%");
    };
    const settle = () => {
        tilt.current?.style.removeProperty("--rx");
        tilt.current?.style.removeProperty("--ry");
    };
    const pics = card.card.card_images;
    const small = (pics.find((i) => i.image_url === card.image) ?? pics[0])?.image_url_small;
    if (typeof document === "undefined") return null;
    return createPortal(
        <div ref={rootEl} className="closeup" role="dialog" aria-label={card.card.name} onPointerDown={down} onPointerUp={up} onPointerCancel={() => (press.current = null)}>
            <span className="ps-close-hint">{position ? <b>{position}</b> : "Tap anywhere to close"}</span>
            {onPrev && <NavArrow dir="prev" className="closeup__nav closeup__nav--prev" label="Previous card" onClick={(e) => (e.stopPropagation(), step(-1))} />}
            {onNext && <NavArrow dir="next" className="closeup__nav closeup__nav--next" label="Next card" onClick={(e) => (e.stopPropagation(), step(1))} />}
            <div ref={bodyEl} key={`${card.card.id}-${card.code}`} className="closeup__body" data-dir={dir}>
                <div className="closeup__card ps-card ps-card--flipped" data-tier={card.tier} onPointerMove={lean} onPointerLeave={settle} onClick={(e) => e.stopPropagation()}>
                    <div ref={tilt} className="ps-tilt">
                        <div className="ps-face closeup__face">
                            {/* The small picture (already loaded wherever the card was tapped) until the full one arrives over it. */}
                            {small && small !== card.image && <img className="closeup__lo" src={small} alt="" aria-hidden="true" />}
                            <img className="closeup__hi" src={card.image} alt={card.card.name} />
                            {card.tier !== "Common" && <div className="ps-holo closeup__holo" />}
                            <div className="ps-glare closeup__glare" />
                        </div>
                    </div>
                    {mark && <MarkToggle icon cardId={card.card.id} className="closeup__mark" />}
                </div>
                <div className="closeup__side" onClick={(e) => e.stopPropagation()}>
                    <CardPlate card={card} className="closeup__plate" />
                    {action && <div className="closeup__action">{action}</div>}
                </div>
            </div>
        </div>,
        document.body,
    );
}
