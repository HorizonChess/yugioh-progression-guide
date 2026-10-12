"use client";

import { useState, useEffect } from "react";
import { asset } from '@/lib/utils';
import { useProgression } from "@/context/ProgressionContext";

const SPRITES = [
    {
        url: asset("/sprites/yugi_neutral_v2_transparent.png?v=4"),
        alt: "Yugi Muto (Neutral)",
        quote: "Believe in the heart of the cards!",
        style: {}
    },
    {
        url: asset("/sprites/yugi_happy_v2_transparent.png?v=4"),
        alt: "Yugi Muto (Happy)",
        quote: "We did it! The puzzle is complete!",
        style: {}
    },
    {
        url: asset("/sprites/yugi_sad_v2_transparent.png?v=4"),
        alt: "Yugi Muto (Sad)",
        quote: "I... I can't lose now...",
        style: {}
    },
    {
        url: asset("/sprites/yugi_happy_v2_transparent.png?v=4"), // Placeholder until Action sprite is regenerated
        alt: "Yugi Muto (Action)",
        quote: "My grandpa's deck has no pathetic cards!",
        style: {}
    }
] as const;

export default function GuideSprite() {
    const { isGuideVisible } = useProgression();
    const [spriteIndex, setSpriteIndex] = useState(0);
    const [visible, setVisible] = useState(false);
    const [isTalking, setIsTalking] = useState(false);

    useEffect(() => {
        // Show after a small delay
        const timer = setTimeout(() => {
            setVisible(true);
            setIsTalking(true);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    const handleSpriteClick = () => {
        setSpriteIndex((prev) => (prev + 1) % SPRITES.length);
        setIsTalking(true);
    };

    if (!visible || !isGuideVisible) return null;

    const currentSprite = SPRITES[spriteIndex] ?? SPRITES[0];

    return (
        <div className="fixed bottom-0 left-0 z-50 animate-in slide-in-from-bottom-10 duration-500 pointer-events-none flex items-end">
            {/* Sprite Container */}
            <div className="relative group">
                {/* Speech Bubble - Positioned to the right of the head */}
                {isTalking && (
                    <div className="absolute left-[70%] bottom-[60%] w-64 bg-white text-black p-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-300 border-4 border-black z-20 text-center pointer-events-auto">
                        <p className="font-bold font-comic leading-tight text-sm">{currentSprite.quote}</p>
                        {/* Speech bubble tail pointing to Yugi */}
                        <div className="absolute bottom-4 -left-3 w-0 h-0 border-t-[10px] border-t-transparent border-r-[12px] border-r-black border-b-[10px] border-b-transparent"></div>
                        <div className="absolute bottom-4 -left-[9px] w-0 h-0 border-t-[8px] border-t-transparent border-r-[10px] border-r-white border-b-[8px] border-b-transparent"></div>
                    </div>
                )}

                {/* Sprite Image */}
                <div
                    onClick={handleSpriteClick}
                    className="cursor-pointer pointer-events-auto hover:scale-105 transition-transform duration-200 w-fit origin-bottom-left"
                >
                    <img
                        src={currentSprite.url}
                        alt={currentSprite.alt}
                        className="h-[300px] w-auto object-contain drop-shadow-2xl"
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
