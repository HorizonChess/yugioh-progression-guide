"use client";

import { useState, useEffect } from "react";

const SPRITES = [
    {
        url: "/sprites/yugi_neutral_v2_transparent.png?v=4",
        alt: "Yugi Muto (Neutral)",
        quote: "Believe in the heart of the cards!",
        style: {}
    },
    {
        url: "/sprites/yugi_happy_v2_transparent.png?v=4",
        alt: "Yugi Muto (Happy)",
        quote: "We did it! The puzzle is complete!",
        style: {}
    },
    {
        url: "/sprites/yugi_sad_v2_transparent.png?v=4",
        alt: "Yugi Muto (Sad)",
        quote: "I... I can't lose now...",
        style: {}
    },
    {
        url: "/sprites/yugi_happy_v2_transparent.png?v=4", // Placeholder until Action sprite is regenerated
        alt: "Yugi Muto (Action)",
        quote: "My grandpa's deck has no pathetic cards!",
        style: {}
    }
];

export default function GuideSprite() {
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

    if (!visible) return null;

    const currentSprite = SPRITES[spriteIndex];

    return (
        <div className="fixed bottom-0 left-4 md:left-12 flex flex-col items-start z-50 animate-in slide-in-from-bottom-10 duration-500 pointer-events-none">
            {/* Speech Bubble */}
            {isTalking && (
                <div className="bg-white text-black p-4 rounded-2xl shadow-2xl mb-4 max-w-xs relative animate-in fade-in zoom-in duration-300 border-4 border-black z-10 text-center ml-8">
                    <p className="font-bold font-comic leading-tight">{currentSprite.quote}</p>
                    {/* Speech bubble tail */}
                    <div className="absolute bottom-0 left-12 translate-y-[100%] w-0 h-0 border-l-[12px] border-l-transparent border-t-[12px] border-t-black border-r-[12px] border-r-transparent"></div>
                    <div className="absolute bottom-0 left-12 translate-y-[80%] w-0 h-0 border-l-[8px] border-l-transparent border-t-[8px] border-t-white border-r-[8px] border-r-transparent"></div>
                </div>
            )}

            {/* Sprite */}
            <div
                onClick={handleSpriteClick}
                className="cursor-pointer pointer-events-auto hover:scale-105 transition-transform duration-200"
            >
                <img
                    src={currentSprite.url}
                    alt={currentSprite.alt}
                    className="h-[500px] w-auto object-contain drop-shadow-2xl"
                    style={{
                        filter: "drop-shadow(0 0 10px rgba(255,255,255,0.2))",
                        ...currentSprite.style
                    }}
                />
            </div>
        </div>
    );
}
