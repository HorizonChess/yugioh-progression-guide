"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuideSprite from "@/components/layout/GuideSprite";
import CardDetailModal from "@/components/card/CardDetailModal";
import StonePanel from "@/components/ui/StonePanel";
import ParchmentButton from "@/components/ui/ParchmentButton";
import CardTooltip from "@/components/card/CardTooltip";
import RarityCardGrid from "@/components/packs/RarityCardGrid";
import StoreView from "@/components/packs/StoreView";
import PackOpeningView from "@/components/packs/PackOpeningView";
import PackDetails from "@/components/packs/PackDetails";
import { processCardsForRarityGrid } from "@/lib/card-utils";
import { useCardTooltip } from "@/hooks/useCardTooltip";
import { usePackOpening } from "@/hooks/usePackOpening";

/**
 * The PACKS screen (route: /packs). Four states:
 *  - store      (default): pack art + quantity selector — fits viewport, no scroll
 *  - opening    : the 5-4 card reveal — fits viewport, no scroll
 *  - summary    : all opened cards by rarity — scrolls normally (can be 100+ cards)
 *  - details    : the whole set's card list — scrolls normally
 *
 * The store + opening states render inside a fixed shell (filling the content
 * row below the persistent nav) so they never scroll; summary + details use a
 * scrollable shell. The reveal lifecycle lives in `usePackOpening`.
 */
function PacksPageContent() {
    const { currentSetIndex, addToCollection } = useProgression();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);

    const [customQuantity, setCustomQuantity] = useState<number>(1);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [viewDetails, setViewDetails] = useState(false);

    const pack = usePackOpening();
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

    const handleSaveAndContinue = () => {
        addToCollection(pack.allOpenedCards);
        router.push("/collection");
    };

    const handleDiscardAndExit = () => {
        if (confirm("Are you sure? All opened cards will be lost.")) {
            router.push("/timeline");
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading Set Data...</div>
            </div>
        );
    }

    if (!currentSet) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <h1 className="text-2xl font-bold mb-4">No Active Set</h1>
                <button onClick={() => router.push("/")} className="text-primary hover:underline">
                    Return Home
                </button>
            </div>
        );
    }

    // --- The 5-4 reveal + the store both fit the viewport (fixed shell, no scroll).
    if (pack.isOpening && !pack.showSummary) {
        return (
            <PacksShell fixed>
                {(hoveredCard || selectedCard) && renderOverlays()}
                <PackOpeningView
                    set={currentSet}
                    pack={pack.currentPack ?? []}
                    packIndex={pack.currentPackIndex}
                    packCount={pack.packsToOpen.length}
                    flippedCards={pack.flippedCards}
                    fullyOpened={pack.isPackFullyOpened}
                    onCardClick={(index, card) => pack.handleCardClick(index, card, setSelectedCard)}
                    onFlipAll={pack.handleFlipAll}
                    onNextPack={pack.handleNextPack}
                    onOpenAll={pack.handleOpenAll}
                    onBack={handleDiscardAndExit}
                    onHover={onHover}
                    onLeave={onLeave}
                />
            </PacksShell>
        );
    }

    if (!pack.isOpening && !viewDetails) {
        return (
            <PacksShell fixed withSprite>
                {renderOverlays()}
                <StoreView
                    set={currentSet}
                    cardCount={setCards.length}
                    isLocked={isLocked}
                    quantity={customQuantity}
                    setQuantity={setCustomQuantity}
                    onOpen={() => pack.openPacks(setCards, currentSet, customQuantity)}
                    onViewDetails={() => setViewDetails(true)}
                    onBack={() => router.push("/timeline")}
                />
            </PacksShell>
        );
    }

    // --- Summary + Details show the full card list; they scroll normally.
    return (
        <PacksShell withSprite={!pack.isOpening}>
            {renderOverlays()}
            {viewDetails ? (
                <PackDetails
                    set={currentSet}
                    cards={setCards}
                    onCardClick={setSelectedCard}
                    onHover={onHover}
                    onLeave={onLeave}
                    onBack={() => setViewDetails(false)}
                />
            ) : (
                renderSummary(currentSet)
            )}
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

    function renderSummary(set: CardSet) {
        const { cardsByRarity, sortedRarities } = processCardsForRarityGrid(pack.allOpenedCards, set.set_code);
        return (
            <div className="max-w-7xl mx-auto">
                <StonePanel className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6 sticky top-4 z-50">
                    <div className="text-center md:text-left">
                        <h1 className="text-2xl md:text-3xl font-black text-white mb-1">{set.set_name}</h1>
                        <p className="text-primary text-sm font-bold">Opened {pack.allOpenedCards.length} Cards</p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={handleDiscardAndExit} className="pack-exit-btn">Back to Campaign</button>
                        <ParchmentButton onClick={pack.reset}>
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
 * Page shell: fills the content row below the persistent nav (which is hoisted
 * into the root layout — this page renders no bar of its own).
 *  - fixed   → content area is exactly the row height and clips overflow (store
 *              + opening states never scroll)
 *  - default → content area grows and scrolls inside the row (summary + details)
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
    // Fills the layout's content row. `fixed` chooses the content behavior: a
    // row-locked centered board for pack-opening, vs a scrollable padded page
    // for summary/details.
    return (
        <div className="h-full overflow-hidden grid grid-rows-[1fr]">
            {withSprite && <GuideSprite />}
            {fixed ? (
                // Pack-opening board: row-locked, centered, never scrolls.
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
                <div className="h-full flex items-center justify-center">
                    <div className="text-xl animate-pulse">Loading...</div>
                </div>
            }
        >
            <PacksPageContent />
        </Suspense>
    );
}
