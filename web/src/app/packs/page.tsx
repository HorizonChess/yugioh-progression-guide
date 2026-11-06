"use client";

import { useAuth } from "@/context/AuthContext";
import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import type { Opening } from "@/lib/repo/types";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GuideSprite from "@/components/layout/GuideSprite";
import StoreView from "@/components/packs/StoreView";
import PackStageView from "@/components/packs/PackStageView";
import { ownedCountsById } from "@/lib/collection";
import OpeningSummary from "@/components/packs/OpeningSummary";
import SetCardList from "@/components/packs/SetCardList";
import { usePackOpening } from "@/hooks/usePackOpening";

/**
 * The PACKS screen (route: /packs). Four states:
 *  - store      (default): pack art + quantity selector — fits viewport, no scroll
 *  - opening    : the pack stage (tear + ring on phones, the duel table on
 *                 wider screens) — fits viewport, no scroll
 *  - summary    : all opened cards by rarity — scrolls normally (can be 100+ cards)
 *  - details    : the whole set's card list — scrolls normally
 *
 * The store + opening states render inside a fixed shell (filling the content
 * row below the persistent nav) so they never scroll; summary + details use a
 * scrollable shell. The reveal lifecycle lives in `usePackOpening`.
 */
function PacksPageContent() {
    const { currentSetIndex, series, rewards, repo, hasLoaded, openPacks, activeOpening, flip, saveOpening, reroll, collection } = useProgression();
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [currentSet, setCurrentSet] = useState<CardSet | null>(null);
    const [setCards, setSetCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);

    const [customQuantity, setCustomQuantity] = useState<number>(1);
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

    // --- The reveal + the store both fit the viewport (fixed shell, no scroll).
    if (pack.isOpening && !pack.showSummary) {
        const current = pack.currentPack ?? [];
        // How many of each card the player had before it: the collection, the packs
        // already opened this time, and the cards before it in this pack.
        const ownedBefore = (index: number) => {
            const id = current[index]?.id;
            if (id === undefined) return 0;
            const earlier = [...pack.allOpenedCards, ...current.slice(0, index)].filter((c) => c.id === id).length;
            return (ownedCountsById(collection).get(id) ?? 0) + earlier;
        };
        return (
            <div className="h-full overflow-hidden pb-1">
                <PackStageView
                    set={currentSet}
                    pack={current}
                    packIndex={pack.currentPackIndex}
                    packCount={pack.packsToOpen.length}
                    flippedCards={pack.flippedCards}
                    fullyOpened={pack.isPackFullyOpened}
                    ownedBefore={ownedBefore}
                    onFlip={(index) => pack.flip([index])}
                    onNextPack={pack.handleNextPack}
                    onOpenAll={pack.handleOpenAll}
                    onBack={handleDiscardAndExit}
                />
            </div>
        );
    }

    if (!pack.isOpening && !viewDetails) {
        return (
            <PacksShell fixed withSprite>
                <StoreView
                    set={currentSet}
                    setIndex={targetSetIndex}
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

    // --- The haul and the card list can run to 100+ cards; they scroll normally.
    const owned = ownedCountsById(collection);
    const ownedCount = (id: number) => owned.get(id) ?? 0;
    return (
        <PacksShell withSprite={!pack.isOpening || pack.showSummary}>
            {viewDetails ? (
                <SetCardList set={currentSet} cards={setCards} ownedCount={ownedCount} onBack={() => setViewDetails(false)} stage={currentSetIndex} />
            ) : (
                <OpeningSummary
                    set={currentSet}
                    cards={pack.allOpenedCards}
                    packCount={pack.packsToOpen.length}
                    ownedCount={ownedCount}
                    onSave={handleSaveAndContinue}
                    onBack={handleDiscardAndExit}
                    onOpenMore={repo.freePacks ? pack.reset : undefined}
                    onReroll={hasTicket ? handleReroll : undefined}
                    stage={currentSetIndex}
                />
            )}
        </PacksShell>
    );
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
                <div className="min-h-0 overflow-y-auto custom-scrollbar">{children}</div>
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
