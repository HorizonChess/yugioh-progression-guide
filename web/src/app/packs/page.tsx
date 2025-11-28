"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GuideSprite from "@/components/GuideSprite";
import CardDetailModal from "@/components/CardDetailModal";
import { useSearchParams } from "next/navigation";

export default function PacksPage() {
    const { currentSetIndex, addToCollection } = useProgression();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);

    // Opening State
    const [isOpening, setIsOpening] = useState(false);
    const [loading, setLoading] = useState(true);

    // New Pack Logic State
    const [packsToOpen, setPacksToOpen] = useState<Card[][]>([]);
    const [currentPackIndex, setCurrentPackIndex] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set()); // Set of indices in current pack
    const [allOpenedCards, setAllOpenedCards] = useState<Card[]>([]);
    const [showSummary, setShowSummary] = useState(false);

    // Custom Quantity State
    const [customQuantity, setCustomQuantity] = useState<number>(1);

    // Card Detail State
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [viewDetails, setViewDetails] = useState(false);

    // Determine which set to load
    const setParam = searchParams.get('set');
    const targetSetIndex = setParam ? parseInt(setParam) : currentSetIndex;
    const isLocked = targetSetIndex > currentSetIndex;

    useEffect(() => {
        async function loadData() {
            console.log("Loading data for set index:", targetSetIndex);
            try {
                const sets = await fetchAllSets();
                const set = sets[targetSetIndex];
                if (set) {
                    setCurrentSet(set);
                    const cards = await fetchCardsInSet(set.set_name);
                    setSetCards(cards);
                }
            } catch (e) {
                console.error("Error loading data:", e);
            }
            setLoading(false);
        }
        loadData();
    }, [targetSetIndex]);

    const handleOpenPacks = (count: number) => {
        if (!setCards.length || count <= 0) return;

        const newPacks: Card[][] = [];
        for (let i = 0; i < count; i++) {
            const pack = generateBoosterPack(setCards);
            newPacks.push(pack);
        }

        setPacksToOpen(newPacks);
        setCurrentPackIndex(0);
        setFlippedCards(new Set());
        setAllOpenedCards([]);
        setShowSummary(false);
        setIsOpening(true);
    };

    const handleCardClick = (index: number, card: Card) => {
        if (flippedCards.has(index)) {
            // If already flipped, show details
            setSelectedCard(card);
            return;
        }

        const newFlipped = new Set(flippedCards);
        newFlipped.add(index);
        setFlippedCards(newFlipped);
    };

    const handleFlipAll = () => {
        const currentPack = packsToOpen[currentPackIndex];
        if (!currentPack) return;

        const allIndices = new Set<number>();
        currentPack.forEach((_, idx) => allIndices.add(idx));
        setFlippedCards(allIndices);
    };

    const handleNextPack = () => {
        // Add current pack cards to allOpenedCards
        const currentPack = packsToOpen[currentPackIndex];
        setAllOpenedCards(prev => [...prev, ...currentPack]);

        if (currentPackIndex < packsToOpen.length - 1) {
            setCurrentPackIndex(prev => prev + 1);
            setFlippedCards(new Set());
        } else {
            setShowSummary(true);
        }
    };

    const handleSaveAndContinue = () => {
        addToCollection(allOpenedCards);
        router.push('/collection');
    };

    const handleDiscardAndExit = () => {
        if (confirm("Are you sure? All opened cards will be lost.")) {
            router.push('/map');
        }
    };

    const isPackFullyOpened = packsToOpen[currentPackIndex] && flippedCards.size === packsToOpen[currentPackIndex].length;

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

    // Pack Details View (Read-Only)
    if (viewDetails) {
        return (
            <div className="min-h-screen p-8">
                <GuideSprite />
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8 sticky top-0 z-50 bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                        <div>
                            <h1 className="text-3xl font-black text-white mb-1">{currentSet.set_name}</h1>
                            <p className="text-gray-400 text-sm">{setCards.length} Cards in Set</p>
                        </div>
                        <button
                            onClick={() => setViewDetails(false)}
                            className="px-6 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-all flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back
                        </button>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 pb-20">
                        {setCards.map((card, idx) => (
                            <div
                                key={`${card.id}-${idx}`}
                                className="relative group aspect-[2/3] cursor-pointer hover:scale-105 transition-transform duration-200"
                                onClick={() => setSelectedCard(card)}
                            >
                                <div className="absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border border-white/10 group-hover:border-[var(--primary)]/50 transition-colors">
                                    <img
                                        src={card.card_images[0].image_url}
                                        alt={card.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {selectedCard && (
                    <CardDetailModal
                        card={selectedCard}
                        onClose={() => setSelectedCard(null)}
                    />
                )}
            </div>
        );
    }

    // Summary View
    if (showSummary) {
        return (
            <div className="min-h-screen p-8">
                <GuideSprite />
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 sticky top-0 z-50 bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                        <div className="text-center md:text-left">
                            <h1 className="text-2xl md:text-3xl font-black text-white mb-1">{currentSet.set_name}</h1>
                            <p className="text-gray-400 text-sm">Opened {allOpenedCards.length} Cards</p>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={handleDiscardAndExit}
                                className="px-6 py-3 bg-red-500/10 text-red-500 font-bold rounded-lg hover:bg-red-500/20 transition-all border border-red-500/20"
                            >
                                Discard & Exit
                            </button>
                            <button
                                onClick={() => {
                                    setIsOpening(false);
                                    setShowSummary(false);
                                    setAllOpenedCards([]);
                                }}
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

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 pb-20">
                        {allOpenedCards.map((card, idx) => (
                            <div
                                key={`${card.id}-${idx}`}
                                className="relative group aspect-[2/3] animate-in fade-in zoom-in duration-300 cursor-pointer"
                                style={{ animationDelay: `${idx * 30}ms` }}
                                onClick={() => setSelectedCard(card)}
                            >
                                <div className="absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border border-white/10 group-hover:border-[var(--primary)]/50 transition-colors">
                                    <img
                                        src={card.card_images[0].image_url}
                                        alt={card.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {selectedCard && (
                    <CardDetailModal
                        card={selectedCard}
                        onClose={() => setSelectedCard(null)}
                    />
                )}
            </div>
        );
    }

    // Pack Opening View
    if (isOpening) {
        const currentPack = packsToOpen[currentPackIndex];

        return (
            <div className="min-h-screen p-8 flex flex-col items-center">
                <GuideSprite />
                {/* Header / Controls */}
                <div className="w-full max-w-6xl flex justify-between items-center mb-12">
                    <div className="text-white">
                        <h2 className="text-2xl font-bold">{currentSet.set_name}</h2>
                        <p className="text-gray-400">Pack {currentPackIndex + 1} of {packsToOpen.length}</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={handleDiscardAndExit}
                            className="px-4 py-2 text-sm bg-red-500/10 text-red-500 font-bold rounded-lg hover:bg-red-500/20 transition-all border border-red-500/20"
                        >
                            Discard
                        </button>
                        {!isPackFullyOpened && (
                            <button
                                onClick={handleFlipAll}
                                className="px-6 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-all"
                            >
                                Flip All
                            </button>
                        )}
                        <button
                            onClick={handleNextPack}
                            disabled={!isPackFullyOpened}
                            className={`px-6 py-3 font-bold rounded-lg transition-all ${isPackFullyOpened
                                ? 'bg-[var(--primary)] text-black hover:bg-[#f5c542] shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:scale-105'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {currentPackIndex < packsToOpen.length - 1 ? 'Next Pack' : 'Finish'}
                        </button>
                    </div>
                </div>

                {/* Pack Grid */}
                <div className="grid grid-cols-5 gap-6 max-w-6xl w-full perspective-1000">
                    {currentPack.map((card, idx) => {
                        const isFlipped = flippedCards.has(idx);
                        return (
                            <div
                                key={`${card.id}-${idx}`}
                                onClick={() => handleCardClick(idx, card)}
                                className="relative aspect-[2/3] cursor-pointer group perspective-1000"
                            >
                                <div className={`w-full h-full relative transform-style-3d transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`}>
                                    {/* Card Back (Front of the div before flip) */}
                                    <div className="absolute inset-0 backface-hidden rounded-lg overflow-hidden shadow-xl border border-white/10">
                                        <img
                                            src="https://images.ygoprodeck.com/images/cards/back_high.jpg"
                                            alt="Card Back"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-white/10 transition-colors"></div>
                                    </div>

                                    {/* Card Front (Back of the div before flip) */}
                                    <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-lg overflow-hidden shadow-xl border border-white/10">
                                        <img
                                            src={card.card_images[0].image_url}
                                            alt={card.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {selectedCard && (
                    <CardDetailModal
                        card={selectedCard}
                        onClose={() => setSelectedCard(null)}
                    />
                )}
            </div>
        );
    }

    // Store View (Initial State)
    return (
        <div className="min-h-screen p-8 flex items-center justify-center">
            <GuideSprite />
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

                {/* Pack Art Display */}
                <div
                    className="relative group perspective-1000 cursor-pointer"
                    onClick={() => setViewDetails(true)}
                >
                    <div className="absolute inset-0 bg-[var(--primary)] opacity-20 blur-[60px] animate-pulse"></div>
                    <div className="relative transform transition-transform duration-500 hover:rotate-y-12 hover:rotate-x-12 transform-style-3d">
                        {currentSet.set_image ? (
                            <img
                                src={currentSet.set_image}
                                alt={currentSet.set_name}
                                className="w-full max-w-[280px] mx-auto rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
                                onError={(e) => {
                                    if (currentSet.original_image && e.currentTarget.src !== currentSet.original_image) {
                                        e.currentTarget.src = currentSet.original_image;
                                    }
                                }}
                            />
                        ) : (
                            <div className="w-full max-w-[280px] mx-auto aspect-[2/3] bg-gray-800 rounded-xl flex items-center justify-center border border-white/10">
                                <span className="text-gray-500">No Pack Art</span>
                            </div>
                        )}
                        {/* Hint Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-xl backdrop-blur-[2px]">
                            <span className="text-white font-bold uppercase tracking-widest border-2 border-white px-4 py-2 rounded-lg">View Details</span>
                        </div>
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
                        </div>
                        <h1 className="text-5xl font-black text-white mb-2 leading-tight">{currentSet.set_name}</h1>
                        <p className="text-xl text-[var(--primary)] font-bold">{setCards.length} Cards in Set</p>
                        <p className="text-gray-400 mt-2">Released: {currentSet.tcg_date}</p>
                        {isLocked && (
                            <div className="mt-2 inline-block px-3 py-1 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs font-bold tracking-widest uppercase">
                                Locked Set
                            </div>
                        )}
                    </div>

                    {isLocked ? (
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                            <p className="text-gray-400 mb-6">You must complete previous sets to unlock pack opening for this set.</p>
                            <button
                                onClick={() => setViewDetails(true)}
                                className="w-full px-6 py-4 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                View Card List
                            </button>
                        </div>
                    ) : (
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Select Quantity</h3>

                            {/* Custom Input */}
                            <div className="flex gap-4 mb-4">
                                <input
                                    type="number"
                                    min="1"
                                    value={customQuantity}
                                    onChange={(e) => setCustomQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-[var(--primary)]"
                                />
                                <button
                                    onClick={() => handleOpenPacks(customQuantity)}
                                    className="px-6 py-3 bg-[var(--primary)] text-black font-black rounded-xl hover:bg-[#f5c542] shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all hover:scale-105"
                                >
                                    Open
                                </button>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                <button
                                    onClick={() => setCustomQuantity(1)}
                                    className="py-2 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold transition-all hover:scale-105 text-sm"
                                >
                                    1
                                </button>
                                <button
                                    onClick={() => setCustomQuantity(5)}
                                    className="py-2 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold transition-all hover:scale-105 text-sm"
                                >
                                    5
                                </button>
                                <button
                                    onClick={() => setCustomQuantity(10)}
                                    className="py-2 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold transition-all hover:scale-105 text-sm"
                                >
                                    10
                                </button>
                                <button
                                    onClick={() => setCustomQuantity(24)}
                                    className="py-2 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold transition-all hover:scale-105 text-sm"
                                >
                                    24
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p>Cards are automatically added to your collection.</p>
                    </div>
                </div>
            </div>
        </div >
    );
}
