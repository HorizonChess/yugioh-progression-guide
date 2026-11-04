"use client";

import { useAuth } from "@/context/AuthContext";
import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import type { Opening } from "@/lib/repo/types";
import { useState, useEffect, useRef, Suspense } from "react";
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
    const { currentSetIndex, series, rewards, repo, hasLoaded, openPacks, activeOpening, flip, saveOpening, reroll } = useProgression();
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);

    const [customQuantity, setCustomQuantity] = useState<number>(1);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [viewDetails, setViewDetails] = useState(false);

    // Flips are sent in small batches so a reload resumes the reveal.
    const openingId = useRef<string | null>(null);
    const pendingFlips = useRef<number[]>([]);
    const flipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const flushFlips = () => {
        clearTimeout(flipTimer.current);
        const batch = pendingFlips.current;
        pendingFlips.current = [];
        if (openingId.current && batch.length) return flip(openingId.current, batch).catch(() => undefined);
    };
    const pack = usePackOpening((flipped) => {
        pendingFlips.current.push(...flipped);
        clearTimeout(flipTimer.current);
        flipTimer.current = setTimeout(flushFlips, 600);
    });
    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();

    const startReveal = (opening: Opening) => {
        openingId.current = opening.id;
        pack.start(opening.packs, opening.flipped);
    };

    // Any set can be viewed. Guests may open up to the current set; a server
    // series opens only its current set, except for admins.
    const setParam = Number.parseInt(searchParams.get("set") ?? "", 10);
    const targetSetIndex = Number.isNaN(setParam) ? currentSetIndex : setParam;
    const isAdmin = user?.role === "admin";
    const canOpen = repo.freePacks ? targetSetIndex <= currentSetIndex : targetSetIndex === currentSetIndex || isAdmin;
    const lockedMessage =
        targetSetIndex < currentSetIndex
            ? "Earlier sets come back only as reward packs (pity and tournament)."
            : "You must complete previous sets to unlock pack opening for this set.";
    const hasTicket = rewards.some((r) => r.prizeId === "redoer-ticket" && r.status === "available");

    useEffect(() => {
        if (!hasLoaded) return;
        async function loadData() {
            try {
                const sets = await fetchAllSets();
                const set = sets[targetSetIndex];
                if (set) {
                    setCurrentSet(set);
                    setSetCards(await fetchCardsInSet(set.set_name));
                }
                const unsaved = await activeOpening("set");
                if (unsaved && unsaved.setName === set?.set_name) startReveal(unsaved);
            } catch (e) {
                console.error("Error loading data:", e);
            }
            setLoading(false);
        }
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per set
    }, [targetSetIndex, hasLoaded]);

    const handleOpen = async () => {
        try {
            startReveal(await openPacks({ setIndex: targetSetIndex, ...(repo.freePacks ? { quantity: customQuantity } : {}) }));
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleSaveAndContinue = async () => {
        if (!openingId.current) return;
        try {
            await flushFlips();
            await saveOpening(openingId.current);
            openingId.current = null;
            router.push("/collection");
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleReroll = async () => {
        if (!openingId.current || !confirm("Spend a Redoer Ticket to reroll all of these packs? The cards you opened will be lost.")) return;
        try {
            startReveal(await reroll(openingId.current));
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleDiscardAndExit = () => {
        if (!repo.freePacks) {
            void flushFlips();
            router.push("/timeline");
        } else if (confirm("Are you sure? All opened cards will be lost.")) {
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
                    isLocked={!canOpen}
                    lockedMessage={lockedMessage}
                    quantity={repo.freePacks ? customQuantity : series?.rules.packsPerSet ?? 0}
                    setQuantity={repo.freePacks ? setCustomQuantity : undefined}
                    onOpen={handleOpen}
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
                        {repo.freePacks && (
                            <ParchmentButton onClick={pack.reset}>
                                Open More
                            </ParchmentButton>
                        )}
                        {hasTicket && <ParchmentButton onClick={handleReroll}>Reroll (Redoer Ticket)</ParchmentButton>}
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
