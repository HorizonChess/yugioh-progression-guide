"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Keeps a question on screen through the gaps between questions, so menus never blink.
 *
 * Between one question and the next there's often a moment with none: the answer is on its way,
 * the server's reply is animating, a chain window passed itself. Taking the sheet down for that
 * moment and putting it back up is the flicker. Instead the last one stays up, inert
 * (`lingering`), for `grace` ms; if the next question comes in time it takes the sheet's place
 * where it stands, and only a real pause lets the sheet go.
 *
 * While `hold` is set (the next question is already known, waiting behind an animation) it
 * stays however long that takes.
 *
 * Only values with `linger` set are kept (sheets): a card's pop-over goes as soon as it's done.
 */
export function useSteady<T extends { linger: boolean }>(value: T | null, grace = 450, hold = false): { value: T | null; lingering: boolean } {
    const last = useRef<T | null>(null);
    const [kept, setKept] = useState<T | null>(null);
    // A layout effect: the kept question goes up before the browser paints the empty frame.
    useLayoutEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- holds the last question across the gap */
        if (value) {
            last.current = value;
            setKept(null);
            return;
        }
        if (last.current?.linger) setKept(last.current);
        last.current = null;
        if (hold) return;
        const t = setTimeout(() => setKept(null), grace);
        /* eslint-enable react-hooks/set-state-in-effect */
        return () => clearTimeout(t);
    }, [value, grace, hold]);
    if (value) return { value, lingering: false };
    return kept ? { value: kept, lingering: true } : { value: null, lingering: false };
}
