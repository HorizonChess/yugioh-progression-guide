"use client";

import { useState, useEffect, useRef } from "react";
import { asset } from '@/lib/utils';
import { useProgression } from "@/context/ProgressionContext";

type Mood = "neutral" | "happy" | "sad";

/* Each mood is cropped to the same 338x700 frame with his feet on the bottom edge, so he
   stands in the same spot whatever his mood (the old sprites were 640 px squares with him
   in a narrow strip, each mood off-centre by a different amount). */
const SPRITE: Record<Mood, string> = {
    neutral: asset("/sprites/yugi_neutral_guide.webp"),
    happy: asset("/sprites/yugi_happy_guide.webp"),
    sad: asset("/sprites/yugi_sad_guide.webp"),
};

const STONE = asset("/ui/stone_texture.webp");

/** Placeholder lines until the guide speaks for the game (pack tips, pulls, results). */
const LINES: [{ mood: Mood; text: string }, ...{ mood: Mood; text: string }[]] = [
    { mood: "neutral", text: "Believe in the heart of the cards!" },
    { mood: "happy", text: "We did it! The puzzle is complete!" },
    { mood: "sad", text: "I... I can't lose now..." },
    { mood: "happy", text: "My grandpa's deck has no pathetic cards!" },
];

const TYPE_MS = 22;
/** How long he stays once the words are out: time to read them, then a beat. */
const readMs = (text: string) => 2600 + text.length * 30;

/**
 * Yugi, the guide. Like characters in old games, he slides in from the left edge when
 * the game has something to say, his words carved into a stone tablet, then slides back
 * out. He overlays the page and nothing moves for him. Tap him for another line, tap
 * the tablet to send him off. The nav's Yugi button turns him off, and turning him back
 * on calls him in again. On phones he and the tablet sit along the bottom, above the
 * tab bar.
 *
 * `at` (a viewport length, e.g. "17vw") stands him further in from the left edge on
 * desktop, clear of a page's own controls there.
 */
export default function GuideSprite({ at }: { at?: string }) {
    const { isGuideVisible } = useProgression();
    const [index, setIndex] = useState(0);
    const [speaking, setSpeaking] = useState(false);
    const [typed, setTyped] = useState(0);
    const leave = useRef<ReturnType<typeof setTimeout>>(undefined);

    const line = LINES[index] ?? LINES[0];
    const onStage = speaking && isGuideVisible;
    const done = typed >= line.text.length;

    const speak = () => {
        setTyped(0);
        setSpeaking(true);
    };

    // Call him in a moment after the page opens, and again whenever he's turned back on.
    useEffect(() => {
        if (!isGuideVisible) return;
        const enter = setTimeout(speak, 1000);
        return () => clearTimeout(enter);
    }, [isGuideVisible]);

    // Type the words out once he's arrived (all at once for reduced motion), then let him leave.
    useEffect(() => {
        if (!onStage) return;
        if (done) {
            leave.current = setTimeout(() => setSpeaking(false), readMs(line.text));
            return () => clearTimeout(leave.current);
        }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t = setTimeout(() => setTyped(reduced ? line.text.length : (n) => n + 1), typed === 0 ? 500 : TYPE_MS);
        return () => clearTimeout(t);
    }, [onStage, typed, done, line.text]);

    const next = () => {
        setIndex((i) => (i + 1) % LINES.length);
        speak();
    };

    return (
        <div
            aria-hidden={!onStage}
            className={`guide ${onStage ? "guide--on" : ""}`}
            style={{ "--guide-stone": `url('${STONE}')`, ...(at && { "--guide-at": at }) } as React.CSSProperties}
        >
            <button type="button" className="guide__yugi" onClick={next} tabIndex={onStage ? 0 : -1} aria-label="Yugi: another line">
                <img src={SPRITE[line.mood]} alt="" />
            </button>
            <button type="button" className={`guide__tablet ${done ? "guide__tablet--done" : ""}`} onClick={() => setSpeaking(false)} tabIndex={onStage ? 0 : -1}>
                <span className="guide__plate">Yugi</span>
                {/* The whole line is laid out from the start (the untyped part invisible), so the tablet doesn't grow as he speaks. */}
                <span className="sr-only" role="status">{onStage ? line.text : ""}</span>
                <span className="guide__text" aria-hidden="true">
                    {line.text.slice(0, typed)}
                    <span className="guide__rest">{line.text.slice(typed)}</span>
                    <span className="guide__caret">▼</span>
                </span>
            </button>
        </div>
    );
}
