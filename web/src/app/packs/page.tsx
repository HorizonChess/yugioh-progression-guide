"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PacksPage() {
    const { currentSetIndex, addToCollection } = useProgression();
    const router = useRouter();

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [openedCards, setOpenedCards] = useState<Card[]>([]);
    const [isOpening, setIsOpening] = useState(false);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        async function loadData() {
            console.log("Loading data for set index:", currentSetIndex);
            try {
                const sets = await fetchAllSets();
                console.log("Fetched sets:", sets.length);
                const set = sets[currentSetIndex];
                if (set) {
                    console.log("Found set:", set.set_name);
                    setCurrentSet(set);
                    const cards = await fetchCardsInSet(set.set_name);
                    console.log("Fetched cards:", cards.length);
                    setSetCards(cards);
                } else {
                    console.error("Set not found for index:", currentSetIndex);
                }
            } catch (e) {
                console.error("Error loading data:", e);
            }
            setLoading(false);
        }
        loadData();
    }, [currentSetIndex]);

    const handleOpenPacks = (count: number) => {
        if (!setCards.length) return;

        setIsOpening(true);
        // Simulate a small delay for "opening" feel
        setTimeout(() => {
            const newCards: Card[] = [];
            for (let i = 0; i < count; i++) {
                const pack = generateBoosterPack(setCards);
                newCards.push(...pack);
            }
            setOpenedCards(prev => [...prev, ...newCards]);
            setIsOpening(false);
        }, 800);
    };

    const handleSaveAndContinue = () => {
        addToCollection(openedCards);
        router.push('/collection');
    };

    console.log("Render State:", { loading, currentSet: currentSet?.set_name, isOpening, openedCards: openedCards.length });

    if (loading) {
        console.log("Rendering: Loading");
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading Set Data...</div>
            </div>
        );
    }

    if (!currentSet) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <h1 className="text-2xl font-bold mb-4">No Active Set</h1>
                <button onClick={() => router.push('/')} className="text-[var(--primary)] hover:underline">
                    Return Home
                </button>
            </div>
        );
    }

    if (!isOpening && openedCards.length === 0) {
        return (

            <div className="min-h-screen p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-[#050505] to-black flex items-center justify-center">
                <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

                    {/* Pack Art Display */}
                    <div className="relative group perspective-1000">
                        <div className="absolute inset-0 bg-[var(--primary)] opacity-20 blur-[60px] animate-pulse"></div>
                        <div className="relative transform transition-transform duration-500 hover:rotate-y-12 hover:rotate-x-12 preserve-3d">
                            {currentSet.set_image ? (
                                <img
                                    src={currentSet.set_image}
                                    alt={currentSet.set_name}
                                    className="w-full max-w-md mx-auto rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
                                />
                            ) : (
                                <div className="w-full max-w-md mx-auto aspect-[2/3] bg-gray-800 rounded-xl flex items-center justify-center border border-white/10">
                                    <span className="text-gray-500">No Pack Art</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Store Controls */}
                    <div className="space-y-8">
                        <div>
                            <h1 className="text-5xl font-black text-white mb-2 leading-tight">{currentSet.set_name}</h1>
                            <p className="text-xl text-[var(--primary)] font-bold">{setCards.length} Cards in Set</p>
                            <p className="text-gray-400 mt-2">Released: {currentSet.tcg_date}</p>
                        </div>

                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Select Quantity</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => handleOpenPacks(1)}
                                    className="py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold transition-all hover:scale-105"
                                >
                                    Open 1 Pack
                                </button>
                                <button
                                    onClick={() => handleOpenPacks(5)}
                                    className="py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold transition-all hover:scale-105"
                                >
                                    Open 5 Packs
                                </button>
                                <button
                                    onClick={() => handleOpenPacks(10)}
                                    className="py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold transition-all hover:scale-105"
                                >
                                    Open 10 Packs
                                </button>
                                <button
                                    onClick={() => handleOpenPacks(24)}
                                    className="py-4 px-6 bg-[var(--primary)] text-black font-black rounded-xl hover:bg-[#f5c542] shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all hover:scale-105"
                                >
                                    Open Box (24)
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p>Cards are automatically added to your collection.</p>
                        </div>
                    </div>
                </div>
            </div>
        );

    }

    return (
        <div className="min-h-screen p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-[#050505] to-black">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 sticky top-0 z-50 bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                    <div className="text-center md:text-left">
                        <h1 className="text-2xl md:text-3xl font-black text-white mb-1">{currentSet.set_name}</h1>
                        <p className="text-gray-400 text-sm">Opened {openedCards.length} Cards</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setOpenedCards([])} // Reset to store view
                            className="px-6 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-all"
                        >
                            Open More
                        </button>
                        <button
                            onClick={handleSaveAndContinue}
                            className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:scale-105"
                        >
                            Done & Save
                        </button>
                    </div>
                </div>

                {/* Card Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 pb-20">
                    {openedCards.map((card, idx) => (
                        <div key={`${card.id}-${idx}`} className="relative group aspect-[2/3] animate-in fade-in zoom-in duration-300" style={{ animationDelay: `${idx * 30}ms` }}>
                            <div className="absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border border-white/10 group-hover:border-[var(--primary)]/50 transition-colors">
                                <img
                                    src={card.card_images[0].image_url}
                                    alt={card.name}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                    loading="lazy"
                                />
                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
