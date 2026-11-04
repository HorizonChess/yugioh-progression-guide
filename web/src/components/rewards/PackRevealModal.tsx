"use client";

import { useEffect, useState } from "react";
import { Card, CardSet, fetchAllSets, fetchTournamentSets } from "@/lib/api";
import type { Opening } from "@/lib/repo/types";
import { processCardsForRarityGrid } from "@/lib/card-utils";
import { usePackOpening } from "@/hooks/usePackOpening";
import { useCardTooltip } from "@/hooks/useCardTooltip";
import Modal from "@/components/ui/Modal";
import PackOpeningView from "@/components/packs/PackOpeningView";
import RarityCardGrid from "@/components/packs/RarityCardGrid";
import CardDetailModal from "@/components/card/CardDetailModal";
import CardTooltip from "@/components/card/CardTooltip";
import FrameButton from "@/components/ui/FrameButton";

interface PackRevealModalProps {
    /** A pity or tournament reward's packs, as the repository rolled them. */
    opening: Opening;
    onFlip: (flipped: number[]) => void;
    /** Adds the cards to the collection, then the modal closes. */
    onCollect: () => void;
    onClose: () => void;
}

/**
 * The shared "open 3 packs" reward reveal: the /packs reveal machinery
 * (`usePackOpening` + `PackOpeningView`) inside the shared `Modal`, then a
 * rarity-grouped summary with "Add to Collection".
 */
export default function PackRevealModal({ opening, onFlip, onCollect, onClose }: PackRevealModalProps) {
    const [set, setSet] = useState<CardSet | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);

    const pack = usePackOpening(onFlip);
    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const sets = [...(await fetchAllSets()), ...(await fetchTournamentSets())];
            const found = sets.find((s) => s.set_name === opening.setName) ?? null;
            if (cancelled) return;
            if (!found) return setStatus("error");
            setSet(found);
            pack.start(opening.packs, opening.flipped);
            setStatus("ready");
        })().catch(() => !cancelled && setStatus("error"));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
    }, [opening.id]);

    const panelClassName =
        "relative w-full max-w-6xl h-[85vh] max-h-[820px] bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col";

    if (status !== "ready" || !set) {
        return (
            <Modal onClose={onClose} panelClassName={panelClassName} showCloseButton>
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                    {status === "error" ? (
                        <div>
                            <p className="text-xl font-bold text-white mb-2">Couldn&apos;t open your packs.</p>
                            <p className="text-white/60 text-sm">Please close and try again.</p>
                        </div>
                    ) : (
                        <div className="text-xl animate-pulse text-white/80">Preparing your packs…</div>
                    )}
                </div>
            </Modal>
        );
    }

    const overlays = (
        <>
            {selectedCard && <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
            {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}
        </>
    );

    if (pack.showSummary) {
        const { cardsByRarity, sortedRarities } = processCardsForRarityGrid(pack.allOpenedCards, set.set_code);
        return (
            <Modal onClose={onClose} panelClassName={panelClassName}>
                {overlays}
                <div className="shrink-0 flex flex-col md:flex-row items-center justify-between gap-4 p-6 border-b border-white/10">
                    <div className="text-center md:text-left">
                        <h2 className="text-2xl font-black text-white">{set.set_name}</h2>
                        <p className="text-primary text-sm font-bold">Opened {pack.allOpenedCards.length} Cards</p>
                    </div>
                    <FrameButton onClick={onCollect} className="h-12 px-6" textClassName="tracking-[0.1em] text-[0.72rem]">
                        Add to Collection
                    </FrameButton>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6">
                    <RarityCardGrid cardsByRarity={cardsByRarity} sortedRarities={sortedRarities} onCardClick={setSelectedCard} onHover={onHover} onLeave={onLeave} />
                </div>
            </Modal>
        );
    }

    return (
        <Modal onClose={onClose} panelClassName={panelClassName}>
            {overlays}
            <div className="min-h-0 flex-1 p-4">
                <PackOpeningView
                    set={set}
                    pack={pack.currentPack ?? []}
                    packIndex={pack.currentPackIndex}
                    packCount={pack.packsToOpen.length}
                    flippedCards={pack.flippedCards}
                    fullyOpened={pack.isPackFullyOpened}
                    onCardClick={(index, card) => pack.handleCardClick(index, card, setSelectedCard)}
                    onFlipAll={pack.handleFlipAll}
                    onNextPack={pack.handleNextPack}
                    onOpenAll={pack.handleOpenAll}
                    onBack={onClose}
                    onHover={onHover}
                    onLeave={onLeave}
                />
            </div>
        </Modal>
    );
}
