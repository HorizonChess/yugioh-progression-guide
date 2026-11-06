"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { asset } from '@/lib/utils';
import { useProgression } from "@/context/ProgressionContext";
import { Sfx } from "@/components/packs/stage/fx";
import { guide, serverState, type Spoken } from "@/lib/guide/store";
import type { Mood } from "@/lib/guide/lines";

/* Each mood is cropped to the same 338x700 frame with his feet on the bottom edge, so he
   stands in the same spot whatever his mood (the old sprites were 640 px squares with him
   in a narrow strip, each mood off-centre by a different amount). */
const SPRITE: Record<Mood, string> = {
    neutral: asset("/sprites/yugi_neutral_guide.webp"),
    happy: asset("/sprites/yugi_happy_guide.webp"),
    sad: asset("/sprites/yugi_sad_guide.webp"),
};

const STONE = asset("/ui/stone_texture.webp");

const TYPE_MS = 22;
/** How long he stays once the words are out: time to read them, then a beat. */
const readMs = (text: string) => 2600 + text.length * 30;

/**
 * Yugi, the guide. Like characters in old games, he slides in from the left edge when
 * the game has something to say (a screen hands him lines through `guide.say`), his
 * words typed into a stone tablet. When there's more to say (▼) he waits: tap the tablet
 * to finish the line, tap again for the next. After the last line he leaves by himself.
 * Tapping Yugi sends him off. He overlays the page and nothing moves for him. On phones
 * he and the tablet sit along the bottom, above the tab bar.
 *
 * `at` (a viewport length, e.g. "17vw") stands him further in from the left edge on
 * desktop, clear of a page's own controls there.
 */
export default function GuideSprite({ at: standAt }: { at?: string }) {
    const { isGuideVisible } = useProgression();
    const { line: current, more } = useSyncExternalStore(guide.subscribe, guide.state, serverState);
    // The last line stays on the tablet while he slides away.
    const [shown, setShown] = useState<Spoken | null>(current);
    if (current && current !== shown) setShown(current);
    const onStage = !!current && isGuideVisible;

    // Typing: starts over for each new line.
    const [typed, setTyped] = useState(0);
    const [typing, setTyping] = useState<Spoken | null>(current);
    if (current !== typing) {
        setTyping(current);
        setTyped(0);
    }
    const text = current?.text ?? "";
    const typedOut = typed >= text.length;
    const at = current?.at;
    const next = useCallback(() => guide.done(at), [at]);

    useEffect(() => {
        if (!onStage) return;
        // Words out: with more to say he waits for a tap; after the last line, time to read, then away.
        if (typedOut) {
            if (more) return;
            const t = setTimeout(next, readMs(text));
            return () => clearTimeout(t);
        }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t = setTimeout(() => {
            if (reduced) return setTyped(text.length);
            // A key sounds about every third letter (a typist's pace, not a buzz), never on a space.
            if (typed % 3 === 0 && text[typed] !== " ") Sfx.key();
            setTyped((n) => n + 1);
        }, typed === 0 ? 550 : TYPE_MS);
        return () => clearTimeout(t);
    }, [onStage, typed, typedOut, more, text, next]);

    // A tap finishes the line, then moves on.
    const tap = () => (typedOut ? next() : setTyped(text.length));

    return (
        <div
            aria-hidden={!onStage}
            className={`guide ${onStage ? "guide--on" : ""}`}
            style={{ "--guide-stone": `url('${STONE}')`, ...(standAt && { "--guide-at": standAt }) } as React.CSSProperties}
        >
            <button type="button" className="guide__yugi" onClick={() => guide.silence()} tabIndex={onStage ? 0 : -1} aria-label="Send Yugi off">
                <img src={SPRITE[shown?.mood ?? "neutral"]} alt="" />
            </button>
            <button type="button" className="guide__tablet" onClick={tap} tabIndex={onStage ? 0 : -1} aria-label={more ? "Next" : undefined}>
                <span className="guide__plate">Yugi</span>
                {onStage && current ? (
                    <>
                        <span className="sr-only" role="status">{current.text}</span>
                        {/* The whole line is laid out from the start (the untyped part invisible), so the tablet doesn't grow as he speaks. */}
                        <span className={`guide__text ${typedOut && more ? "guide__text--more" : ""}`} aria-hidden="true">
                            {text.slice(0, typed)}
                            <span className="guide__rest">{text.slice(typed)}</span>
                            <span className="guide__caret">▼</span>
                        </span>
                    </>
                ) : (
                    shown && <span className="guide__text">{shown.text}</span>
                )}
            </button>
        </div>
    );
}
