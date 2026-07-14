"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet, PulledCard } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuideSprite from "@/components/shell/GuideSprite.view";
import CardDetailModal from "@/components/card/CardDetailModal.view";
import StonePanel from "@/components/ui/StonePanel.view";
import ParchmentButton from "@/components/ui/ParchmentButton.view";
import CardTooltip from "@/components/card/CardTooltip.view";
import RarityCardGrid from "@/components/PackOpener/RarityCardGrid.view";
import StoreView from "@/components/PackOpener/StoreView.view";
import PackOpeningView from "@/components/PackOpener/PackOpeningView.view";
import { processCardsForRarityGrid } from "@/lib/card-utils";
import { useCardTooltip } from "@/hooks/useCardTooltip";
import TopBar from "@/components/shell/TopBar.view";

/**
 * The PACKS screen (route: /packs). Controller for four states:
 *  - store      (default): pack art + quantity selector — fits viewport, no scroll
 *  - opening    : the 5-4 card reveal — fits viewport, no scroll
 *  - summary    : all opened cards by rarity — scrolls normally (can be 100+ cards)
 *  - details    : the whole set's card list — scrolls normally
 *
 * The store + opening states render inside a fixed h-screen shell (below the
 * TopBar) so they never scroll; summary + details use a scrollable shell.
 */
function PacksPageContent() {
    const { currentSetIndex, addToCollection } = useProgression();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [isOpening, setIsOpening] = useState(false);
    const [loading, setLoading] = useState(true);

    const [packsToOpen, setPacksToOpen] = useState<PulledCard[][]>([]);
    const [currentPackIndex, setCurrentPackIndex] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    const [allOpenedCards, setAllOpenedCards] = useState<PulledCard[]>([]);
    const [showSummary, setShowSummary] = useState(false);

    const [customQuantity, setCustomQuantity] = useState<number>(1);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [viewDetails, setViewDetails] = useState(false);

    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();

    const setParam = searchParams.get("set");
    const targetSetIndex = setParam ? parseInt(setParam) : currentSetIndex;
    const isLocked = targetSetIndex > currentSetIndex;

    useEffect(() => {
        async function loadData() {
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

        const newPacks: PulledCard[][] = [];
        for (let i = 0; i < count; i++) {
            newPacks.push(generateBoosterPack(setCards, currentSet));
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
            setSelectedCard(card); // already flipped → open details
            return;
        }
        setFlippedCards(new Set(flippedCards).add(index));
    };

    const handleFlipAll = () => {
        const currentPack = packsToOpen[currentPackIndex];
        if (!currentPack) return;
        setFlippedCards(new Set(currentPack.map((_, idx) => idx)));
    };

    const handleOpenAll = () => {
        const newCards = packsToOpen.slice(currentPackIndex).flat();
        setAllOpenedCards((prev) => [...prev, ...newCards]);
        setShowSummary(true);
    };

    const handleNextPack = () => {
        setAllOpenedCards((prev) => [...prev, ...packsToOpen[currentPackIndex]]);
        if (currentPackIndex < packsToOpen.length - 1) {
            setCurrentPackIndex((prev) => prev + 1);
            setFlippedCards(new Set());
        } else {
            setShowSummary(true);
        }
    };

    const handleSaveAndContinue = () => {
        addToCollection(allOpenedCards);
        router.push("/collection");
    };

    const handleDiscardAndExit = () => {
        if (confirm("Are you sure? All opened cards will be lost.")) {
            router.push("/map");
        }
    };

    const isPackFullyOpened =
        packsToOpen[currentPackIndex] && flippedCards.size === packsToOpen[currentPackIndex].length;

    const getProcessedCards = (cards: Card[]) => {
        if (!currentSet) return { cardsByRarity: {}, sortedRarities: [] };
        return processCardsForRarityGrid(cards, currentSet.set_code);
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
                <button onClick={() => router.push("/")} className="text-primary hover:underline">
                    Return Home
                </button>
            </div>
        );
    }

    // --- The 5-4 reveal + the store both fit the viewport (fixed shell, no scroll).
    if (isOpening && !showSummary) {
        return (
            <PacksShell fixed>
                {(hoveredCard || selectedCard) && renderOverlays()}
                <PackOpeningView
                    set={currentSet}
                    pack={packsToOpen[currentPackIndex]}
                    packIndex={currentPackIndex}
                    packCount={packsToOpen.length}
                    flippedCards={flippedCards}
                    fullyOpened={!!isPackFullyOpened}
                    onCardClick={handleCardClick}
                    onFlipAll={handleFlipAll}
                    onNextPack={handleNextPack}
                    onOpenAll={handleOpenAll}
                    onBack={handleDiscardAndExit}
                    onHover={onHover}
                    onLeave={onLeave}
                />
            </PacksShell>
        );
    }

    if (!isOpening && !viewDetails) {
        return (
            <PacksShell fixed withSprite>
                {renderOverlays()}
                <StoreView
                    set={currentSet}
                    cardCount={setCards.length}
                    isLocked={isLocked}
                    quantity={customQuantity}
                    setQuantity={setCustomQuantity}
                    onOpen={() => handleOpenPacks(customQuantity)}
                    onViewDetails={() => setViewDetails(true)}
                    onBack={() => router.push("/map")}
                />
            </PacksShell>
        );
    }

    // --- Summary + Details show the full card list; they scroll normally.
    return (
        <PacksShell withSprite={!isOpening}>
            {renderOverlays()}
            {viewDetails ? renderDetails() : renderSummary()}
        </PacksShell>
    );

    // ---- render helpers -------------------------------------------------

    function renderOverlays() {
        return (
            <>
                {selectedCard && <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
                {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}
            </>
        );
    }

    function renderDetails() {
        const { cardsByRarity, sortedRarities } = getProcessedCards(setCards);
        return (
            <div className="max-w-7xl mx-auto">
                <StonePanel className="flex items-center justify-between mb-8 sticky top-4 z-50">
                    <div>
                        <h1 className="text-3xl font-black text-white mb-1">{currentSet!.set_name}</h1>
                        <p className="text-primary text-sm font-bold">{setCards.length} Cards in Set</p>
                    </div>
                    <ParchmentButton onClick={() => setViewDetails(false)} className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back
                    </ParchmentButton>
                </StonePanel>
                <RarityCardGrid cardsByRarity={cardsByRarity} sortedRarities={sortedRarities} onCardClick={setSelectedCard} onHover={onHover} onLeave={onLeave} />
            </div>
        );
    }

    function renderSummary() {
        const { cardsByRarity, sortedRarities } = getProcessedCards(allOpenedCards);
        return (
            <div className="max-w-7xl mx-auto">
                <StonePanel className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 sticky top-4 z-50">
                    <div className="text-center md:text-left">
                        <h1 className="text-2xl md:text-3xl font-black text-white mb-1">{currentSet!.set_name}</h1>
                        <p className="text-primary text-sm font-bold">Opened {allOpenedCards.length} Cards</p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={handleDiscardAndExit} className="pack-exit-btn">Back to Campaign</button>
                        <ParchmentButton onClick={() => { setIsOpening(false); setShowSummary(false); setAllOpenedCards([]); }}>
                            Open More
                        </ParchmentButton>
                        <ParchmentButton onClick={handleSaveAndContinue} className="text-green-900 border-green-800 hover:bg-green-50">
                            Done &amp; Save
                        </ParchmentButton>
                    </div>
                </StonePanel>
                <RarityCardGrid cardsByRarity={cardsByRarity} sortedRarities={sortedRarities} onCardClick={setSelectedCard} onHover={onHover} onLeave={onLeave} />
            </div>
        );
    }
}

/**
 * Page shell: TopBar pinned at top, content below.
 *  - fixed   → content area is exactly the remaining viewport height and clips
 *              overflow (store + opening states never scroll)
 *  - default → content area grows and the page scrolls (summary + details)
 */
function PacksShell({
    children,
    fixed = false,
    withSprite = false,
}: {
    children: React.ReactNode;
    fixed?: boolean;
    withSprite?: boolean;
}) {
    const router = useRouter();
    // Shell is ALWAYS a grid-rows-[auto_1fr] with a bare TopBar as the first
    // (auto) row — same idiom as every other page, so the nav sits identically.
    // `fixed` only changes the CONTENT row: a viewport-locked centered board
    // for pack-opening, vs a scrollable padded page for summary/details.
    return (
        <div className="h-screen overflow-hidden grid grid-rows-[auto_1fr]">
            <TopBar showBack onBack={() => router.push("/map")} />
            {withSprite && <GuideSprite />}
            {fixed ? (
                // Pack-opening board: viewport-locked, centered, never scrolls.
                <div className="min-h-0 min-w-0 flex items-center justify-center p-4">{children}</div>
            ) : (
                // Summary / details: a potentially long card list — scroll INSIDE
                // this row (retro scrollbar under the nav), not the document.
                <div className="min-h-0 overflow-y-auto custom-scrollbar p-8 pb-16">{children}</div>
            )}
        </div>
    );
}

export default function Packs() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-xl animate-pulse">Loading...</div>
                </div>
            }
        >
            <PacksPageContent />
        </Suspense>
    );
}
