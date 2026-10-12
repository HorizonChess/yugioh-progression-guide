import { useState } from "react";
import { Card, CardSet, PulledCard } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";

/**
 * Pack-opener orchestration extracted from the /packs page: the reveal
 * lifecycle (generate N packs → flip cards → advance packs → summary) and the
 * accumulated `allOpenedCards`. UI concerns stay in the caller — the card-detail
 * modal (opened via `onAlreadyFlipped`) and which shell to render (`isOpening` /
 * `showSummary`). Shared by /packs and the tournament-packs reward modal.
 */
export function usePackOpening() {
    const [packsToOpen, setPacksToOpen] = useState<PulledCard[][]>([]);
    const [currentPackIndex, setCurrentPackIndex] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    const [allOpenedCards, setAllOpenedCards] = useState<PulledCard[]>([]);
    const [isOpening, setIsOpening] = useState(false);
    const [showSummary, setShowSummary] = useState(false);

    /** Generate `count` booster packs from `setCards`/`set` and enter the reveal. */
    const openPacks = (setCards: Card[], set: CardSet | null, count: number) => {
        if (!setCards.length || count <= 0 || !set) return;

        const newPacks: PulledCard[][] = [];
        for (let i = 0; i < count; i++) {
            newPacks.push(generateBoosterPack(setCards, set));
        }

        setPacksToOpen(newPacks);
        setCurrentPackIndex(0);
        setFlippedCards(new Set());
        setAllOpenedCards([]);
        setShowSummary(false);
        setIsOpening(true);
    };

    /** Flip a card; if it's already flipped, hand it back for a detail view. */
    const handleCardClick = (
        index: number,
        card: Card,
        onAlreadyFlipped?: (card: Card) => void
    ) => {
        if (flippedCards.has(index)) {
            onAlreadyFlipped?.(card);
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

    /** Leave the reveal entirely (e.g. "Open More" back to the store). */
    const reset = () => {
        setIsOpening(false);
        setShowSummary(false);
        setAllOpenedCards([]);
        setPacksToOpen([]);
        setCurrentPackIndex(0);
        setFlippedCards(new Set());
    };

    const currentPack = packsToOpen[currentPackIndex];
    const isPackFullyOpened = !!currentPack && flippedCards.size === currentPack.length;

    return {
        // state
        packsToOpen,
        currentPackIndex,
        flippedCards,
        allOpenedCards,
        isOpening,
        showSummary,
        currentPack,
        isPackFullyOpened,
        // actions
        openPacks,
        handleCardClick,
        handleFlipAll,
        handleOpenAll,
        handleNextPack,
        reset,
    };
}
