"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { plate, type StageCard } from "@/components/packs/stage/plate";
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
            const b = e.currentTarget.getBoundingClientRect(), w = 330;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                const onLeft = b.left + b.width / 2 > innerWidth / 2;
                const left = Math.max(8, Math.min(innerWidth - w - 8, onLeft ? b.left - w - 14 : b.right + 14));
                setPeek({ card, left, top: Math.max(8, Math.min(innerHeight - 360, b.top)) });
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
 * The close-up: the card large (it leans toward the pointer) with its plate beside
 * it on wide screens, or in a sheet under it on phones. `action` adds a button
 * under the plate (e.g. ban this card). Click outside or press Escape to close.
 */
export function CardCloseUp({ card, onClose, action }: { card: StageCard; onClose: () => void; action?: ReactNode }) {
    const tilt = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        addEventListener("keydown", onKey);
        return () => removeEventListener("keydown", onKey);
    }, [onClose]);
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
    if (typeof document === "undefined") return null;
    return createPortal(
        <div className="closeup" role="dialog" aria-label={card.card.name} onClick={onClose}>
            <span className="ps-close-hint">Tap anywhere to close</span>
            <div className="closeup__body">
                <div className="closeup__card ps-card ps-card--flipped" data-tier={card.tier} onPointerMove={lean} onPointerLeave={settle} onClick={(e) => e.stopPropagation()}>
                    <div ref={tilt} className="ps-tilt">
                        <div className="ps-face closeup__face">
                            <img src={card.image} alt={card.card.name} />
                            {card.tier !== "Common" && <div className="ps-holo closeup__holo" />}
                            <div className="ps-glare closeup__glare" />
                        </div>
                    </div>
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
