"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GuideSprite from "@/components/GuideSprite";
import CardDetailModal from "@/components/CardDetailModal";
import QuantitySelector from "@/components/QuantitySelector";
import StonePanel from "@/components/StonePanel";
import ParchmentButton from "@/components/ParchmentButton";
import PackCard from "@/components/PackCard";
import { useSearchParams } from "next/navigation";
import CardTooltip from "@/components/CardTooltip";
import Image from "next/image";

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

    // Tooltip State
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        setCursorPosition({ x: e.clientX, y: e.clientY });
    };

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
        if (!setCards.length || count <= 0 || !currentSet) return;

        const newPacks: Card[][] = [];
        // Get the set prefix (e.g., "LOB" from "LOB-EN001")
        // We can use the set_code from the set object itself if available, or derive it.
        // The API set object has 'set_code' which is usually the prefix.
        const setPrefix = currentSet.set_code;

        for (let i = 0; i < count; i++) {
            const pack = generateBoosterPack(setCards, setPrefix);
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

    const handleOpenAll = () => {
        const remainingPacks = packsToOpen.slice(currentPackIndex);
        const newCards = remainingPacks.flat();
        setAllOpenedCards(prev => [...prev, ...newCards]);
        setShowSummary(true);
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
    // Rarity Order Definition (Reversed: Common -> Secret Rare)
    const rarityOrder = [
        "Common",
        "Rare",
        "Super Rare",
        "Ultra Rare",
        "Secret Rare"
    ];



    if (viewDetails) {
        // Group cards by rarity
        const cardsByRarity: Record<string, Card[]> = {};

        setCards.forEach(card => {
            // Find rarity for this set
            const setInfo = card.card_sets?.find(s => s.set_code.split('-')[0] === currentSet.set_code.split('-')[0])
                || card.card_sets?.[0];

            let rarity = setInfo?.set_rarity || "Common";

            // Merge Short Prints into Common
            if (rarity === "Short Print" || rarity === "Super Short Print" || rarity === "SP") {
                rarity = "Common";
            }

            if (!cardsByRarity[rarity]) {
                cardsByRarity[rarity] = [];
            }
            cardsByRarity[rarity].push(card);
        });

        // Sort rarities based on defined order
        const sortedRarities = Object.keys(cardsByRarity).sort((a, b) => {
            const indexA = rarityOrder.indexOf(a);
            const indexB = rarityOrder.indexOf(b);
            // If not found in order, put at the end
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });

        return (
            <div className="min-h-screen p-8 pb-32">
                <GuideSprite />
                <div className="max-w-7xl mx-auto">
                    <StonePanel className="flex items-center justify-between mb-8 sticky top-4 z-50">
                        <div>
                            <h1 className="text-3xl font-black text-white mb-1">{currentSet.set_name}</h1>
                            <p className="text-[#d4af37] text-sm font-bold">{setCards.length} Cards in Set</p>
                        </div>
                        <ParchmentButton
                            onClick={() => setViewDetails(false)}
                            className="flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back
                        </ParchmentButton>
                    </StonePanel>

                    <div className="space-y-8">
                        {sortedRarities.map(rarity => (
                            <StonePanel key={rarity} title={rarity}>
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
                                    {cardsByRarity[rarity].map((card, idx) => (
                                        <div
                                            key={`${card.id}-${idx}`}
                                            className="flex flex-col group cursor-pointer"
                                            onClick={() => setSelectedCard(card)}
                                            onMouseEnter={() => setHoveredCard(card)}
                                            onMouseLeave={() => setHoveredCard(null)}
                                            onMouseMove={handleMouseMove}
                                        >
                                            <div className="relative aspect-[2/3] mb-2 hover:scale-105 transition-transform duration-200">
                                                <div className="absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border border-white/10 group-hover:border-[var(--primary)]/50 transition-colors">
                                                    <Image
                                                        src={card.card_images[0].image_url}
                                                        alt={card.name}
                                                        fill
                                                        sizes="(max-width: 640px) 25vw, (max-width: 768px) 20vw, (max-width: 1024px) 16vw, (max-width: 1280px) 12vw, 11vw"
                                                        className="object-cover"
                                                        loading="lazy"
                                                        quality={90}
                                                    />
                                                </div>
                                            </div>
                                            {/* Name below card */}
                                            <div className="text-center px-1">
                                                <div className="text-[10px] md:text-xs font-bold text-white leading-tight line-clamp-2 h-8 group-hover:text-[#d4af37] transition-colors">
                                                    {card.name}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </StonePanel>
                        ))}
                    </div>
                </div>

                {selectedCard && (
                    <CardDetailModal
                        card={selectedCard}
                        onClose={() => setSelectedCard(null)}
                    />
                )}

                {/* Tooltip Portal */}
                {hoveredCard && (
                    <CardTooltip
                        card={hoveredCard}
                        x={cursorPosition.x}
                        y={cursorPosition.y}
                    />
                )}
            </div>
        );
    }

    // Summary View
    if (showSummary) {
        return (
            <div className="min-h-screen p-8 pb-32">
                <GuideSprite />
                <div className="max-w-7xl mx-auto">
                    <StonePanel className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 sticky top-4 z-50">
                        <div className="text-center md:text-left">
                            <h1 className="text-2xl md:text-3xl font-black text-white mb-1">{currentSet.set_name}</h1>
                            <p className="text-[#d4af37] text-sm font-bold">Opened {allOpenedCards.length} Cards</p>
                        </div>
                        <div className="flex gap-4">
                            <ParchmentButton
                                onClick={handleDiscardAndExit}
                                className="text-red-600 border-red-800 hover:bg-red-50"
                            >
                                Discard & Exit
                            </ParchmentButton>
                            <ParchmentButton
                                onClick={() => {
                                    setIsOpening(false);
                                    setShowSummary(false);
                                    setAllOpenedCards([]);
                                }}
                            >
                                Open More
                            </ParchmentButton>
                            <ParchmentButton
                                onClick={handleSaveAndContinue}
                                className="text-green-900 border-green-800 hover:bg-green-50"
                            >
                                Done & Save
                            </ParchmentButton>
                        </div>
                    </StonePanel>

                    <StonePanel title="Opened Cards Summary">
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
                            {allOpenedCards.map((card, idx) => (
                                <div
                                    key={`${card.id}-${idx}`}
                                    className="relative group aspect-[2/3] animate-in fade-in zoom-in duration-300 cursor-pointer"
                                    style={{ animationDelay: `${Math.min(idx * 30, 1000)}ms` }}
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
                    </StonePanel>
                </div>
                {
                    selectedCard && (
                        <CardDetailModal
                            card={selectedCard}
                            onClose={() => setSelectedCard(null)}
                        />
                    )
                }
            </div >
        );
    }

    // Pack Opening View
    if (isOpening) {
        const currentPack = packsToOpen[currentPackIndex];

        return (
            <div className="h-screen w-full p-4 flex flex-col items-center justify-center overflow-hidden">
                <GuideSprite />

                {/* Main Container - Fits Screen */}
                <div className="w-full max-w-[95vw] h-full max-h-[95vh] flex flex-col">

                    {/* Header Info */}
                    <div className="mb-2 text-center">
                        <h2 className="text-3xl font-black text-white drop-shadow-md">{currentSet.set_name}</h2>
                        <p className="text-[#d4af37] font-bold text-lg">Pack {currentPackIndex + 1} of {packsToOpen.length}</p>
                    </div>

                    {/* Stone Panel Container - Cards Only */}
                    {/* Constrained width and centered to match "Ideal" layout */}
                    {/* Stone Panel Container & Controls */}
                    {/* Centered (mx-auto), constrained width (max-w-5xl) */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto min-h-0 mb-4">
                        <StonePanel className="w-full flex-1 flex flex-col relative px-6 py-2 shadow-2xl">
                            {/* Cards Container - Flex for better fitting */}
                            {/* content-evenly distributes space equally between rows and borders */}
                            <div className="flex flex-wrap items-center justify-center content-evenly w-full h-full gap-2">
                                {currentPack.map((card, idx) => {
                                    const isFlipped = flippedCards.has(idx);
                                    // Find rarity for this set
                                    const setInfo = card.card_sets?.find(s => s.set_code.split('-')[0] === currentSet.set_code.split('-')[0])
                                        || card.card_sets?.[0];

                                    // Get full rarity name
                                    let rarity = setInfo?.set_rarity || "Common";

                                    // Map "Short Print" if needed, though API usually gives full name "Short Print"
                                    // If it gives "SP", map it.
                                    if (rarity === "SP") rarity = "Short Print";

                                    return (
                                        <PackCard
                                            key={`${card.id}-${idx}`}
                                            card={card}
                                            isFlipped={isFlipped}
                                            onClick={() => handleCardClick(idx, card)}
                                            rarity={rarity}
                                        />
                                    );
                                })}
                            </div>
                        </StonePanel>

                        {/* Controls - Below Stone Panel */}
                        <div className="flex justify-center items-center gap-4 pt-4">
                            <button
                                onClick={handleDiscardAndExit}
                                className="px-4 py-2 text-sm text-red-400 hover:text-red-300 font-bold transition-colors"
                            >
                                Discard
                            </button>

                            {!isPackFullyOpened && (
                                <ParchmentButton onClick={handleFlipAll}>
                                    Flip All
                                </ParchmentButton>
                            )}

                            <ParchmentButton onClick={handleOpenAll}>
                                Open All
                            </ParchmentButton>

                            <button
                                onClick={handleNextPack}
                                disabled={!isPackFullyOpened}
                                className={`px-8 py-3 font-black rounded-xl transition-all uppercase tracking-wider ${isPackFullyOpened
                                    ? 'bg-[var(--primary)] text-black hover:bg-[#f5c542] shadow-[0_4px_0_#b8860b] active:shadow-none active:translate-y-[4px] border border-[#b8860b]'
                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                                    }`}
                            >
                                {currentPackIndex < packsToOpen.length - 1 ? 'Next Pack' : 'Finish'}
                            </button>
                        </div>
                    </div>

                    {selectedCard && (
                        <CardDetailModal
                            card={selectedCard}
                            onClose={() => setSelectedCard(null)}
                        />
                    )}
                </div>
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
                        <div className="p-6 stone-panel text-center">
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
                        <div className="p-6 stone-panel">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[#d4af37] mb-4 drop-shadow-md">Select Quantity</h3>

                            <QuantitySelector
                                quantity={customQuantity}
                                setQuantity={setCustomQuantity}
                                onOpen={() => handleOpenPacks(customQuantity)}
                            />
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
