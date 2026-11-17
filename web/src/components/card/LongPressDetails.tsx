"use client";

import { useEffect, useRef, useState } from "react";
import { CardCloseUp } from "@/components/card/CardPlate";
import { printedIn, type StageCard } from "@/components/packs/stage/plate";
import { fetchCardsByIds } from "@/lib/api";
import { ownedCountsById } from "@/lib/collection";
import { useProgression } from "@/context/ProgressionContext";

/*
 * A long press on any card, anywhere (on a touch screen), opens its details: what it does, in the
 * close-up. Many places only show a card's picture on a phone (side decking, the duel's hand, a
 * pick of cards), and a tap there already means something else.
 *
 * The card is found by its picture (every card's art is /cards/<passcode>...jpg), so no screen
 * needs wiring. The tap that would follow the press is swallowed: holding a card to read it
 * doesn't also play it, pick it or add it.
 */

const CARD_ART = /\/cards\/(\d+)(?:_(?:md|sm|lg))?\.jpg/;
const HOLD_MS = 450;
/** A finger that moves this far is scrolling or dragging, not holding. */
const SLOP = 10;

/** The card under the finger: its picture is the element pressed, or the only card picture in the small tile pressed. */
function cardAt(target: Element | null): { img: HTMLImageElement; code: number } | null {
    if (!target || target.closest(".closeup")) return null;
    let el: Element | null = target;
    for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
        const pics = (el instanceof HTMLImageElement ? [el] : [...el.querySelectorAll("img")]).filter((img) => CARD_ART.test(img.currentSrc || img.src));
        if (pics.length > 1) return null;
        if (pics.length === 1) {
            const img = pics[0]!;
            // A tile around one card (its frame, its name under it), not a panel that happens to hold one.
            const a = el.getBoundingClientRect(), b = img.getBoundingClientRect();
            if (a.width * a.height > b.width * b.height * 4) return null;
            const code = Number(CARD_ART.exec(img.currentSrc || img.src)![1]);
            return code > 0 ? { img, code } : null;
        }
    }
    return null;
}

/** Swallows the one click that ends a long press (and the touch's context menu). */
function swallowNextClick() {
    const stop = () => {
        removeEventListener("click", eat, true);
        removeEventListener("pointerdown", stop, true);
    };
    const eat = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        stop();
    };
    addEventListener("click", eat, true);
    addEventListener("pointerdown", stop, true);
    setTimeout(stop, 800);
}

export default function LongPressDetails() {
    const { collection } = useProgression();
    const owned = useRef(collection);
    useEffect(() => {
        owned.current = collection;
    }, [collection]);
    const [shown, setShown] = useState<{ card: StageCard; from: HTMLImageElement } | null>(null);

    useEffect(() => {
        let press: { x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null = null;
        const cancel = () => {
            if (press) clearTimeout(press.timer);
            press = null;
        };
        const down = (e: PointerEvent) => {
            cancel();
            if (e.pointerType !== "touch" || !e.isPrimary) return;
            const hit = cardAt(e.target as Element);
            if (!hit) return;
            const p = {
                x: e.clientX, y: e.clientY, fired: false,
                timer: setTimeout(() => {
                    p.fired = true;
                    swallowNextClick();
                    navigator.vibrate?.(12);
                    void fetchCardsByIds([hit.code]).then(([card]) => {
                        if (!card) return;
                        const n = ownedCountsById(owned.current).get(card.id) ?? 0;
                        setShown({ card: { ...printedIn(card, "", n), ownedNote: n ? `You own ×${n}` : "Not owned yet" }, from: hit.img });
                    });
                }, HOLD_MS),
            };
            press = p;
        };
        const move = (e: PointerEvent) => {
            if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancel();
        };
        const up = () => {
            if (press && !press.fired) cancel();
            else press = null;
        };
        // The phone's own long-press menu (save image, open in a new tab) would cover the details.
        const menu = (e: Event) => {
            if (cardAt(e.target as Element)) e.preventDefault();
        };
        addEventListener("pointerdown", down, true);
        addEventListener("pointermove", move, true);
        addEventListener("pointerup", up, true);
        addEventListener("pointercancel", cancel, true);
        addEventListener("scroll", cancel, true);
        addEventListener("contextmenu", menu, true);
        return () => {
            cancel();
            removeEventListener("pointerdown", down, true);
            removeEventListener("pointermove", move, true);
            removeEventListener("pointerup", up, true);
            removeEventListener("pointercancel", cancel, true);
            removeEventListener("scroll", cancel, true);
            removeEventListener("contextmenu", menu, true);
        };
    }, []);

    if (!shown) return null;
    return <CardCloseUp card={shown.card} from={() => (shown.from.isConnected ? shown.from : null)} onClose={() => setShown(null)} />;
}
