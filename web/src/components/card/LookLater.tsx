"use client";

import { useEffect } from "react";
import { useProgression } from "@/context/ProgressionContext";

/**
 * Marks to look at later. A card is marked in the pack opener (or any card's close-up)
 * and carries a bookmark in the binder and the deck builder until its details are opened
 * there; it can be switched on or off by hand wherever its details show.
 */

/** "Look at later": the bookmark toggle in a card's details. */
export function MarkToggle({ cardId, className = "" }: { cardId: number; className?: string }) {
    const { marks, setMark } = useProgression();
    const on = marks.has(cardId);
    return (
        <button
            type="button"
            className={`mark-toggle ${on ? "mark-toggle--on" : ""} ${className}`}
            aria-pressed={on}
            onClick={(e) => {
                e.stopPropagation();
                setMark(cardId, !on);
            }}
        >
            <span className="mark-toggle__icon" aria-hidden="true" />
            {on ? "Marked to look at later" : "Look at later"}
        </button>
    );
}

/** The bookmark on a marked card's thumbnail. */
export function MarkBadge() {
    return <span className="mark-badge" title="Marked to look at later" aria-label="Marked to look at later" />;
}

/**
 * Opening a marked card's details here counts as looking at it: the mark clears once
 * they've been up for `after` ms (a moment, so sweeping a mouse across cards doesn't).
 * Switching it back on while still looking keeps it: this runs once per card shown.
 */
export function useLookedAt(cardId: number | null | undefined, after = 0) {
    const { marks, setMark } = useProgression();
    const marked = cardId != null && marks.has(cardId);
    useEffect(() => {
        if (cardId == null || !marked) return;
        const t = setTimeout(() => setMark(cardId, false), after);
        return () => clearTimeout(t);
        // Once per card: re-marking it by hand while it's open shouldn't clear it again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardId]);
}

/** `useLookedAt` as an element, for screens that show details after an early return. */
export function LookedAt({ cardId, after = 0 }: { cardId: number; after?: number }) {
    useLookedAt(cardId, after);
    return null;
}
