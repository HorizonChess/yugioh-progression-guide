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
        // Randomly pick character and quote on mount
        const char = Math.random() > 0.5 ? 'yugi' : 'kaiba';
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
        <div className="fixed bottom-4 right-4 flex items-end animate-in slide-in-from-bottom-10 duration-500 z-50 pointer-events-none">
            <div className="bg-white text-black p-4 rounded-2xl rounded-br-none shadow-xl mb-8 mr-2 max-w-xs relative animate-in fade-in zoom-in duration-300 delay-300">
                <p className="font-bold text-sm">{quote}</p>
                {/* Speech bubble tail */}
                <div className="absolute bottom-0 right-0 translate-y-1/2 translate-x-[-10px] w-4 h-4 bg-white rotate-45"></div>
            </div>
            <img
                src={`/${character}_v2.png`}
                alt={character}
                className="w-48 h-48 object-cover mask-image-gradient mix-blend-screen drop-shadow-2xl"
                style={{ maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)' }}
            />
        </div>
    );
}
