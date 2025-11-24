"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function PacksPage() {
    const { currentSetIndex, addToCollection } = useProgression();
    const router = useRouter();
    const searchParams = useSearchParams();
    const setIndexParam = searchParams.get('set');

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [openedCards, setOpenedCards] = useState<Card[]>([]);
    const [isOpening, setIsOpening] = useState(false);
    const [loading, setLoading] = useState(true);
    const [packCount, setPackCount] = useState(1);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [viewingCardList, setViewingCardList] = useState(false);

    // Determine which set to load: query param or current progress
    const targetSetIndex = setIndexParam ? parseInt(setIndexParam) : currentSetIndex;

    useEffect(() => {
        async function loadData() {
            console.log("Loading data for set index:", targetSetIndex);
            try {
                const sets = await fetchAllSets();
                console.log("Fetched sets:", sets.length);
                const set = sets[targetSetIndex];
                if (set) {
                    console.log("Found set:", set.set_name);
                    setCurrentSet(set);
                    const cards = await fetchCardsInSet(set.set_name);
                    console.log("Fetched cards:", cards.length);
                    setSetCards(cards);
                } else {
                    console.error("Set not found for index:", targetSetIndex);
                }
            } catch (e) {
                console.error("Error loading data:", e);
            }
            setLoading(false);
        }
        loadData();
    }, [targetSetIndex]);

    const handleOpenPacks = () => {
        if (!setCards.length || packCount < 1) return;

        setIsOpening(true);
        // Simulate a small delay for "opening" feel
        setTimeout(() => {
            const newCards: Card[] = [];
            for (let i = 0; i < packCount; i++) {
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

    if (loading) {
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

    // Card List View
    if (viewingCardList) {
        return (
            <div className="min-h-screen p-8 bg-black text-white">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8 sticky top-0 bg-black/90 z-50 p-4 border-b border-gray-800">
                        <h2 className="text-2xl font-bold text-[var(--primary)]">{currentSet.set_name} Card List</h2>
                        <button
                            onClick={() => setViewingCardList(false)}
                            className="px-4 py-2 bg-gray-800 rounded hover:bg-gray-700"
                        >
                            Close List
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {setCards.map((card, idx) => (
                            <div key={`${card.id}-${idx}`} className="aspect-[59/86] relative group">
                                <img
                                    src={card.card_images[0].image_url}
                                    alt={card.name}
                                    className="w-full h-full object-contain"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center text-xs pointer-events-none">
                                    {card.name}
                                    <br />
                                    <span className="text-[var(--primary)]">{card.rarity}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
                                    className="w-full max-w-xs mx-auto rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
                                    style={{ imageRendering: 'auto' }}
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
                            <div className="flex items-center justify-between mb-2">
                                <button
                                    onClick={() => router.push('/map')}
                                    className="text-gray-500 hover:text-white flex items-center gap-2 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                    Back to Map
                                </button>
                                <button
                                    onClick={() => setViewingCardList(true)}
                                    className="text-[var(--primary)] hover:underline text-sm font-bold"
                                >
                                    View Card List
                                </button>
                            </div>
                            <h1 className="text-5xl font-black text-white mb-2 leading-tight">{currentSet.set_name}</h1>
                            <p className="text-xl text-[var(--primary)] font-bold">{setCards.length} Cards in Set</p>
                            <p className="text-gray-400 mt-2">Released: {currentSet.tcg_date}</p>
                        </div>

                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Select Quantity</h3>
                            <div className="flex gap-4">
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={packCount}
                                    onChange={(e) => setPackCount(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-24 bg-black border border-gray-700 rounded-xl px-4 text-center font-bold text-xl focus:border-[var(--primary)] outline-none"
                                />
                                <button
                                    onClick={handleOpenPacks}
                                    className="flex-1 py-4 px-6 bg-[var(--primary)] text-black font-black rounded-xl hover:bg-[#f5c542] shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all hover:scale-105"
                                >
                                    OPEN {packCount} PACK{packCount > 1 ? 'S' : ''}
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
                            onClick={() => {
                                if (confirmDiscard) {
                                    router.push('/map');
                                } else {
                                    setConfirmDiscard(true);
                                    setTimeout(() => setConfirmDiscard(false), 3000); // Reset after 3s
                                }
                            }}
                            className={`px-6 py-3 font-bold rounded-lg transition-all border ${confirmDiscard ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`}
                        >
                            {confirmDiscard ? "Confirm Discard" : "Discard & Exit"}
                        </button>
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
                        <div key={`${card.id}-${idx}`} className="relative group aspect-[59/86] animate-in fade-in zoom-in duration-300" style={{ animationDelay: `${idx * 30}ms` }}>
                            <div className="absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border border-white/10 group-hover:border-[var(--primary)]/50 transition-colors flex items-center justify-center">
                                <img
                                    src={card.card_images[0].image_url}
                                    alt={card.name}
                                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
                                    loading="lazy"
                                    style={{ imageRendering: 'auto' }}
                                />
                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
