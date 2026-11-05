import { useRef, useState } from "react";
import { Card, PulledCard } from "@/lib/api";
import { flatIndex } from "@/lib/repo/types";

/**
 * The pack reveal lifecycle (flip cards → advance packs → summary) and the
 * accumulated `allOpenedCards`, for packs rolled by the repository. `onFlip`
 * hears each newly face-up card (as flat indexes) so the opening can resume.
 * Shared by /packs and the reward pack reveal.
 */
export function usePackOpening(onFlip?: (flipped: number[]) => void) {
    const [packsToOpen, setPacksToOpen] = useState<PulledCard[][]>([]);
    const [currentPackIndex, setCurrentPackIndex] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    // Mirrors flippedCards synchronously, so several flips in one tick (Flip All) all count.
    const flippedNow = useRef<Set<number>>(new Set());
    const setFlipped = (next: Set<number>) => {
        flippedNow.current = next;
        setFlippedCards(next);
    };
    const [allOpenedCards, setAllOpenedCards] = useState<PulledCard[]>([]);
    const [isOpening, setIsOpening] = useState(false);
    const [showSummary, setShowSummary] = useState(false);

    /** Enter the reveal for `packs`, resuming at the last pack with a face-up card. */
    const start = (packs: PulledCard[][], flipped: readonly number[] = []) => {
        if (!packs.length) return;
        const resumeAt = flipped.length ? Math.min(Math.max(...flipped.map((i) => Math.floor(i / 100))), packs.length - 1) : 0;
        setPacksToOpen(packs);
        setCurrentPackIndex(resumeAt);
        setFlipped(new Set(flipped.filter((i) => Math.floor(i / 100) === resumeAt).map((i) => i % 100)));
        setAllOpenedCards(packs.slice(0, resumeAt).flat());
        setShowSummary(false);
        setIsOpening(true);
    };

    const flip = (indexes: number[]) => {
        const fresh = indexes.filter((i) => !flippedNow.current.has(i));
        if (!fresh.length) return;
        setFlipped(new Set([...flippedNow.current, ...fresh]));
        onFlip?.(fresh.map((i) => flatIndex(currentPackIndex, i)));
    };

    /** Flip a card; if it's already flipped, hand it back for a detail view. */
    const handleCardClick = (index: number, card: Card, onAlreadyFlipped?: (card: Card) => void) => {
        if (flippedCards.has(index)) {
            onAlreadyFlipped?.(card);
            return;
        }
        flip([index]);
    };

    const handleFlipAll = () => {
        const currentPack = packsToOpen[currentPackIndex];
        if (currentPack) flip(currentPack.map((_, idx) => idx));
    };

    const handleOpenAll = () => {
        setAllOpenedCards((prev) => [...prev, ...packsToOpen.slice(currentPackIndex).flat()]);
        setShowSummary(true);
    };

    const handleNextPack = () => {
        const currentPack = packsToOpen[currentPackIndex];
        if (!currentPack) return;
        setAllOpenedCards((prev) => [...prev, ...currentPack]);
        if (currentPackIndex < packsToOpen.length - 1) {
            setCurrentPackIndex((prev) => prev + 1);
            setFlipped(new Set());
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
        setFlipped(new Set());
    };

    const currentPack = packsToOpen[currentPackIndex];
    const isPackFullyOpened = !!currentPack && flippedCards.size === currentPack.length;

    return {
        packsToOpen,
        currentPackIndex,
        flippedCards,
        allOpenedCards,
        isOpening,
        showSummary,
        currentPack,
        isPackFullyOpened,
        start,
        flip,
        handleCardClick,
        handleFlipAll,
        handleOpenAll,
        handleNextPack,
        reset,
    };
}
