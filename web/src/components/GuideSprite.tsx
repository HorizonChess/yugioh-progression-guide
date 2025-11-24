"use client";

import { useState, useEffect } from "react";

const QUOTES = {
    yugi: [
        "Believe in the heart of the cards!",
        "It's time to duel!",
        "My grandpa's deck has no pathetic cards!",
        "I draw!",
        "Ready for the next challenge?"
    ],
    kaiba: [
        "Screw the rules, I have money!",
        "You're a third-rate duelist with a fourth-rate deck!",
        "I will crush you!",
        "Draw your last pathetic card!",
        "This is a waste of my time."
    ]
};

export default function GuideSprite() {
    const [character, setCharacter] = useState<'yugi' | 'kaiba'>('yugi');
    const [quote, setQuote] = useState("");
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Default to Yugi for now to match reference, or random
        // const char = Math.random() > 0.5 ? 'yugi' : 'kaiba';
        const char = 'yugi';
        const quotes = QUOTES[char];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

        setCharacter(char);
        setQuote(randomQuote);

        // Show after a small delay
        const timer = setTimeout(() => setVisible(true), 1000);
        return () => clearTimeout(timer);
    }, []);

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center animate-in slide-in-from-bottom-10 duration-500 z-50 pointer-events-none">
            <div className="bg-white text-black p-6 rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] mb-4 max-w-xs relative animate-in fade-in zoom-in duration-300 delay-300 border-4 border-black z-10 text-center">
                <p className="font-black text-lg font-comic leading-tight">{quote}</p>
                {/* Speech bubble tail */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[100%] w-0 h-0 border-l-[20px] border-l-transparent border-t-[20px] border-t-black border-r-[20px] border-r-transparent"></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[80%] w-0 h-0 border-l-[14px] border-l-transparent border-t-[14px] border-t-white border-r-[14px] border-r-transparent"></div>
            </div>
            <img
                src={`/${character}_v2.png`}
                alt={character}
                className="w-96 h-96 object-contain drop-shadow-2xl mix-blend-screen"
            />
        </div>
    );
}
