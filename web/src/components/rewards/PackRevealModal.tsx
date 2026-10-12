"use client";

import { useEffect, useState } from "react";
import { Card, CardSet, PulledCard } from "@/lib/api";
import { RewardEntry } from "@/lib/rewards";
import { processCardsForRarityGrid } from "@/lib/card-utils";
import { usePackOpening } from "@/hooks/usePackOpening";
import { useCardTooltip } from "@/hooks/useCardTooltip";
import Modal from "@/components/ui/Modal";
import PackOpeningView from "@/components/packs/PackOpeningView";
import RarityCardGrid from "@/components/packs/RarityCardGrid";
import CardDetailModal from "@/components/card/CardDetailModal";
import CardTooltip from "@/components/card/CardTooltip";
import FrameButton from "@/components/ui/FrameButton";

/** The set + its cards a reward's 3 packs open from. `null` set → nothing to open. */
export interface RevealSource {
    set: CardSet | null;
    cards: Card[];
}

interface PackRevealModalProps {
    entry: RewardEntry;
    /**
     * Resolves which set the 3 packs open from — the only thing that differs
     * between reward kinds (pity → the just-finished core set; tournament → the
     * latest tournament set before the won pack).
     */
    resolveSource: (entry: RewardEntry) => Promise<RevealSource>;
    /** Grant the opened cards + mark the reward claimed, then the modal closes. */
    onCollect: (cards: PulledCard[]) => void;
    onClose: () => void;
}

const PACK_COUNT = 3;

/**
 * The shared "open 3 packs" reward reveal. Hosts the /packs reveal machinery
 * (`usePackOpening` + `PackOpeningView`) inside the shared `Modal`: flip the
 * cards across 3 packs, then a rarity-grouped summary with "Add to Collection".
 *
 * Both the pity reward and the tournament-packs reward run through this — they
 * differ only in `resolveSource` (which set the packs come from). The pack
 * ratios come for free: `generateBoosterPack` (inside `usePackOpening.openPacks`)
 * routes core vs. tournament sets by name.
 */
export default function PackRevealModal({ entry, resolveSource, onCollect, onClose }: PackRevealModalProps) {
    const [set, setSet] = useState<CardSet | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);

    const pack = usePackOpening();
    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();

    // Resolve the source set + its cards, then generate the 3 packs.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { set: chosen, cards } = await resolveSource(entry);
                if (cancelled) return;
                if (!chosen || !cards.length) {
                    setStatus("error");
                    return;
                }
                setSet(chosen);
                pack.openPacks(cards, chosen, PACK_COUNT);
                setStatus("ready");
            } catch {
                if (!cancelled) setStatus("error");
            }
        })();
        return () => {
            cancelled = true;
        };
        // Run once for this reward entry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry.id]);

    const panelClassName =
        "relative w-full max-w-6xl h-[85vh] max-h-[820px] bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col";

    // --- Loading / error ---
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

    // --- Summary (after the last pack) ---
    if (pack.showSummary) {
        const { cardsByRarity, sortedRarities } = processCardsForRarityGrid(pack.allOpenedCards, set.set_code);
        return (
            <Modal onClose={onClose} panelClassName={panelClassName}>
                {selectedCard && <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
                {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}
                <div className="shrink-0 flex flex-col md:flex-row items-center justify-between gap-4 p-6 border-b border-white/10">
                    <div className="text-center md:text-left">
                        <h2 className="text-2xl font-black text-white">{set.set_name}</h2>
                        <p className="text-primary text-sm font-bold">Opened {pack.allOpenedCards.length} Cards</p>
                    </div>
                    <FrameButton
                        onClick={() => onCollect(pack.allOpenedCards)}
                        className="h-12 px-6"
                        textClassName="tracking-[0.1em] text-[0.72rem]"
                    >
                        Add to Collection
                    </FrameButton>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6">
                    <RarityCardGrid
                        cardsByRarity={cardsByRarity}
                        sortedRarities={sortedRarities}
                        onCardClick={setSelectedCard}
                        onHover={onHover}
                        onLeave={onLeave}
                    />
                </div>
            </Modal>
        );
    }

    // --- The reveal ---
    return (
        <Modal onClose={onClose} panelClassName={panelClassName}>
            {selectedCard && <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
            {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}
            <div className="min-h-0 flex-1 p-4">
                <PackOpeningView
                    set={set}
                    pack={pack.packsToOpen[pack.currentPackIndex]}
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
