"use client";

import { Card, CardSet } from "@/lib/api";
import StonePanel from "@/components/ui/StonePanel";
import ParchmentButton from "@/components/ui/ParchmentButton";
import RarityCardGrid from "@/components/packs/RarityCardGrid";
import { processCardsForRarityGrid } from "@/lib/card-utils";

interface PackDetailsProps {
    set: CardSet;
    cards: Card[];
    onCardClick?: (card: Card) => void;
    onHover?: (card: Card, e: React.MouseEvent) => void;
    onLeave?: () => void;
    /** When provided, renders a "Back" affordance in the sticky header. */
    onBack?: () => void;
    /**
     * When set, only cards in these rarities are treated as pickable — used by
     * the wildcard claim (Phase 4) to gate selection to the reward's rarity and
     * below. Omitted for the plain /packs details listing (all cards clickable).
     */
    selectableRarities?: Set<string>;
    /** When set, the card with this id is highlighted (wildcard's pending pick). */
    selectedCardId?: number;
}

const noop = () => {};

/**
 * The whole set's card list, grouped by rarity. Extracted from
 * the /packs page so both the /packs details view and the
 * wildcard reward modal render the same header + `RarityCardGrid`.
 */
export default function PackDetails({
    set,
    cards,
    onCardClick,
    onHover,
    onLeave,
    onBack,
    selectableRarities,
    selectedCardId,
}: PackDetailsProps) {
    const { cardsByRarity, sortedRarities } = processCardsForRarityGrid(cards, set.set_code);

    const rarities = selectableRarities
        ? sortedRarities.filter((r) => selectableRarities.has(r))
        : sortedRarities;

    return (
        <div className="max-w-7xl mx-auto">
            <StonePanel className="flex items-center justify-between mb-8 sticky top-4 z-50">
                <div>
                    <h1 className="text-3xl font-black text-white mb-1">{set.set_name}</h1>
                    <p className="text-primary text-sm font-bold">{cards.length} Cards in Set</p>
                </div>
                {onBack && (
                    <ParchmentButton onClick={onBack} className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back
                    </ParchmentButton>
                )}
            </StonePanel>
            <RarityCardGrid
                cardsByRarity={cardsByRarity}
                sortedRarities={rarities}
                onCardClick={onCardClick ?? noop}
                onHover={onHover ?? noop}
                onLeave={onLeave ?? noop}
                selectedCardId={selectedCardId}
            />
        </div>
    );
}
