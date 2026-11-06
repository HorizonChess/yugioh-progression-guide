"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { asset } from '@/lib/utils';
import { useProgression } from "@/context/ProgressionContext";
import { Sfx } from "@/components/packs/stage/fx";
import { guide, type Spoken } from "@/lib/guide/store";
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

/** The words on the tablet, typed out with a key every third letter, then held long enough to read. */
function Words({ line, onDone }: { line: Spoken; onDone: () => void }) {
    const [typed, setTyped] = useState(0);
    const done = typed >= line.text.length;
    useEffect(() => {
        if (done) {
            const t = setTimeout(onDone, readMs(line.text));
            return () => clearTimeout(t);
        }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t = setTimeout(() => {
            if (reduced) return setTyped(line.text.length);
            // A key sounds about every third letter (a typist's pace, not a buzz), never on a space.
            if (typed % 3 === 0 && line.text[typed] !== " ") Sfx.key();
            setTyped((n) => n + 1);
        }, typed === 0 ? 550 : TYPE_MS);
        return () => clearTimeout(t);
    }, [typed, done, line.text, onDone]);
    return (
        <>
            {/* The whole line is laid out from the start (the untyped part invisible), so the tablet doesn't grow as he speaks. */}
            <span className="sr-only" role="status">{line.text}</span>
            <span className={`guide__text ${done ? "guide__text--done" : ""}`} aria-hidden="true">
                {line.text.slice(0, typed)}
                <span className="guide__rest">{line.text.slice(typed)}</span>
                <span className="guide__caret">▼</span>
            </span>
        </>
    );
}

/**
 * Yugi, the guide. Like characters in old games, he slides in from the left edge when
 * the game has something to say (a screen hands him a line through `guide.say`), his
 * words carved into a stone tablet, then slides back out. He overlays the page and
 * nothing moves for him. Tap him or the tablet to send him off. On phones he and the
 * tablet sit along the bottom, above the tab bar.
 *
 * `at` (a viewport length, e.g. "17vw") stands him further in from the left edge on
 * desktop, clear of a page's own controls there.
 */
export default function GuideSprite({ at: standAt }: { at?: string }) {
    const { isGuideVisible } = useProgression();
    const current = useSyncExternalStore(guide.subscribe, guide.current, () => null);
    // The last line stays on the tablet while he slides away.
    const [shown, setShown] = useState<Spoken | null>(current);
    if (current && current !== shown) setShown(current);
    const onStage = !!current && isGuideVisible;
    const at = current?.at;
    const leave = useCallback(() => guide.done(at), [at]);

    return (
        <div
            aria-hidden={!onStage}
            className={`guide ${onStage ? "guide--on" : ""}`}
            style={{ "--guide-stone": `url('${STONE}')`, ...(standAt && { "--guide-at": standAt }) } as React.CSSProperties}
        >
            <button type="button" className="guide__yugi" onClick={leave} tabIndex={onStage ? 0 : -1} aria-label="Send Yugi off">
                <img src={SPRITE[shown?.mood ?? "neutral"]} alt="" />
            </button>
            <button type="button" className="guide__tablet" onClick={leave} tabIndex={onStage ? 0 : -1}>
                <span className="guide__plate">Yugi</span>
                {shown && (onStage ? <Words key={`${shown.key}:${shown.at}`} line={shown} onDone={leave} /> : <span className="guide__text">{shown.text}</span>)}
            </button>
        </div>
    );
}
