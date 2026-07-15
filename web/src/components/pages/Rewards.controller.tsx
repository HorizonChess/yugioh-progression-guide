"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet, PulledCard } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WHEEL_PRIZES } from "@/lib/rewards";

export default function RewardsPage() {
    const { pendingReward, claimReward, addToCollection, currentSetIndex } = useProgression();
    const router = useRouter();
    const [spinning, setSpinning] = useState(false);
    const [prize, setPrize] = useState<string | null>(null);
    const [pityCards, setPityCards] = useState<PulledCard[]>([]);
    const [openingPity, setOpeningPity] = useState(false);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);

    useEffect(() => {
        if (!pendingReward || pendingReward.claimed) {
            router.push('/');
            return;
        }

        async function loadSet() {
            const sets = await fetchAllSets();
            // Pity packs use the set that just finished (currentSetIndex - 1),
            // or the current set if we're still at index 0.
            const targetIndex = currentSetIndex > 0 ? currentSetIndex - 1 : 0;
            const set = sets[targetIndex];
            if (set) {
                const cards = await fetchCardsInSet(set.set_name);
                setSetCards(cards);
                setCurrentSet(set);
            }
        }
        loadSet();
    }, [pendingReward, currentSetIndex, router]);

    const handleSpin = () => {
        setSpinning(true);
        setTimeout(() => {
            const randomPrize = WHEEL_PRIZES[Math.floor(Math.random() * WHEEL_PRIZES.length)];
            setPrize(randomPrize.label);
            setSpinning(false);
        }, 2000);
    };

    const handleOpenPity = () => {
        if (!setCards.length || !currentSet) return;
        setOpeningPity(true);
        setTimeout(() => {
            const newCards: PulledCard[] = [];
            for (let i = 0; i < 3; i++) {
                const pack = generateBoosterPack(setCards, currentSet);
                newCards.push(...pack);
            }
            setPityCards(newCards);
            setOpeningPity(false);
        }, 1000);
    };


    const handleClaim = () => {
        if (pityCards.length > 0) {
            addToCollection(pityCards);
        }
        // If prize is a pack, we could add cards, but for text prizes we just acknowledge.
        claimReward();
        router.push('/');
    };

    if (!pendingReward) return null;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)]">
                {pendingReward.type === 'wheel' ? "Winner's Wheel" : "Pity Packs"}
            </h1>

            {pendingReward.type === 'wheel' && (
                <div className="glass-panel p-12 text-center max-w-md w-full">
                    {!prize ? (
                        <>
                            <div className={`text-6xl mb-8 ${spinning ? 'animate-spin' : ''}`}>🎡</div>
                            <button
                                onClick={handleSpin}
                                disabled={spinning}
                                className="px-8 py-4 bg-[var(--primary)] text-black font-bold rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50"
                            >
                                {spinning ? "Spinning..." : "SPIN THE WHEEL"}
                            </button>
                        </>
                    ) : (
                        <div className="animate-in zoom-in duration-300">
                            <div className="text-sm text-gray-400 mb-2">You Won:</div>
                            <div className="text-3xl font-bold text-[var(--primary)] mb-8">{prize}</div>
                            <button
                                onClick={handleClaim}
                                className="px-8 py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500"
                            >
                                Claim Prize
                            </button>
                        </div>
                    )}
                </div>
            )}

            {pendingReward.type === 'pity' && (
                <div className="w-full max-w-4xl">
                    {pityCards.length === 0 ? (
                        <div className="glass-panel p-12 text-center">
                            <div className="text-6xl mb-6">🩹</div>
                            <p className="text-xl mb-8">Take these 3 packs to strengthen your deck.</p>
                            <button
                                onClick={handleOpenPity}
                                disabled={openingPity}
                                className="px-8 py-4 bg-[var(--primary)] text-black font-bold rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50"
                            >
                                {openingPity ? "Opening..." : "Open 3 Pity Packs"}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                                {pityCards.map((card, idx) => (
                                    <div key={`${card.id}-${idx}`} className="relative group aspect-[2/3] animate-in fade-in zoom-in" style={{ animationDelay: `${idx * 50}ms` }}>
                                        <img
                                            src={card.card_images[0].image_url}
                                            alt={card.name}
                                            className="w-full h-full object-cover rounded-lg shadow-lg"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="text-center">
                                <button
                                    onClick={handleClaim}
                                    className="px-8 py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500"
                                >
                                    Add to Collection & Continue
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
