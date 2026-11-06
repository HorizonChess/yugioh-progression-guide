"use client";

import { useState, useEffect, useRef } from "react";
import { asset } from '@/lib/utils';
import { useProgression } from "@/context/ProgressionContext";

const SPRITES = [
    {
        url: asset("/sprites/yugi_neutral_v2_transparent.webp"),
        alt: "Yugi Muto (Neutral)",
        quote: "Believe in the heart of the cards!",
        style: {}
    },
    {
        url: asset("/sprites/yugi_happy_v2_transparent.webp"),
        alt: "Yugi Muto (Happy)",
        quote: "We did it! The puzzle is complete!",
        style: {}
    },
    {
        url: asset("/sprites/yugi_sad_v2_transparent.webp"),
        alt: "Yugi Muto (Sad)",
        quote: "I... I can't lose now...",
        style: {}
    },
    {
        url: asset("/sprites/yugi_happy_v2_transparent.webp"), // Placeholder until Action sprite is regenerated
        alt: "Yugi Muto (Action)",
        quote: "My grandpa's deck has no pathetic cards!",
        style: {}
    }
] as const;

/** How long Yugi stays on screen after he speaks. */
const TALK_MS = 7000;

/**
 * Yugi, the guide. Like characters in old games, he slides in from the left edge
 * when the game has something to say, then slides back out; tap him for another
 * line, tap the bubble to send him off. The nav's Yugi button turns him off, and
 * turning him back on calls him in again.
 */
/**
 * `raised` lifts him above a phone page's action dock; `at` (a viewport length, e.g. "17vw") stands
 * him further in from the left edge, clear of a page's controls there.
 */
export default function GuideSprite({ raised = false, at }: { raised?: boolean; at?: string }) {
    const { isGuideVisible } = useProgression();
    const [spriteIndex, setSpriteIndex] = useState(0);
    const [speaking, setSpeaking] = useState(false);
    const leave = useRef<ReturnType<typeof setTimeout>>(undefined);

    const onStage = speaking && isGuideVisible;

    const speak = () => {
        setSpeaking(true);
        clearTimeout(leave.current);
        leave.current = setTimeout(() => setSpeaking(false), TALK_MS);
    };

    useEffect(() => {
        if (!isGuideVisible) return;
        const enter = setTimeout(speak, 1000);
        return () => {
            clearTimeout(enter);
            clearTimeout(leave.current);
        };
    }, [isGuideVisible]);

    const handleSpriteClick = () => {
        setSpriteIndex((prev) => (prev + 1) % SPRITES.length);
        speak();
    };

    const currentSprite = SPRITES[spriteIndex] ?? SPRITES[0];

    return (
        <div
            aria-hidden={!onStage}
            className={`fixed left-0 ${raised ? "bottom-[calc(230px+env(safe-area-inset-bottom))]" : "bottom-[calc(64px+env(safe-area-inset-bottom))]"} md:bottom-0 z-50 flex items-end pointer-events-none transition-transform duration-500 ease-[cubic-bezier(.2,.9,.3,1.15)] ${at ? "" : onStage ? "translate-x-0" : "-translate-x-[calc(100%+18rem)]"}`}
            // Further in, he walks off by that much more.
            style={at ? { left: at, transform: onStage ? "none" : `translateX(calc(-100% - 18rem - ${at}))` } : undefined}
        >
            <div className="relative">
                {/* Speech bubble, to the right of his head */}
                <button
                    type="button"
                    onClick={() => setSpeaking(false)}
                    tabIndex={onStage ? 0 : -1}
                    className={`absolute left-[70%] bottom-[60%] w-52 md:w-64 bg-white text-black p-3 md:p-4 rounded-2xl shadow-2xl border-4 border-black z-20 text-center ${onStage ? "pointer-events-auto" : ""}`}
                >
                    <span role="status" className="block font-bold font-comic leading-tight text-sm">{currentSprite.quote}</span>
                    {/* Speech bubble tail pointing to Yugi */}
                    <span className="absolute bottom-4 -left-3 w-0 h-0 border-t-[10px] border-t-transparent border-r-[12px] border-r-black border-b-[10px] border-b-transparent"></span>
                    <span className="absolute bottom-4 -left-[9px] w-0 h-0 border-t-[8px] border-t-transparent border-r-[10px] border-r-white border-b-[8px] border-b-transparent"></span>
                </button>

                {/* The whole sprite, never cropped */}
                <div
                    onClick={handleSpriteClick}
                    className={`cursor-pointer hover:scale-105 transition-transform duration-200 w-fit origin-bottom-left ${onStage ? "pointer-events-auto" : ""}`}
                >
                    <img
                        src={currentSprite.url}
                        alt={currentSprite.alt}
                        className="h-[170px] md:h-[300px] w-auto object-contain drop-shadow-2xl"
                        style={{
                            filter: "drop-shadow(0 0 5px rgba(255,255,255,0.2))",
                            ...currentSprite.style
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
