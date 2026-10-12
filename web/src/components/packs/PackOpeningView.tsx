"use client";

import { CardSet, PulledCard, Card } from "@/lib/api";
import StonePanel from "@/components/ui/StonePanel";
import ParchmentButton from "@/components/ui/ParchmentButton";
import PackCard from "@/components/packs/PackCard";

/**
 * The pack-OPENING reveal (/packs state 3). The pulled cards flip open in the
 * fixed 5-4 layout (5 per row via 19% flex-basis; 6 for >10-card reprint packs).
 * The whole view fits the viewport with NO scroll — card size is capped by
 * viewport height so 2 rows + labels + controls always fit. Card aspect ratio
 * is preserved (see PackCard's width:auto sizer).
 */
export default function PackOpeningView({
    set,
    pack,
    packIndex,
    packCount,
    flippedCards,
    fullyOpened,
    onCardClick,
    onFlipAll,
    onNextPack,
    onOpenAll,
    onBack,
    onHover,
    onLeave,
}: {
    set: CardSet;
    pack: PulledCard[];
    packIndex: number;
    packCount: number;
    flippedCards: Set<number>;
    fullyOpened: boolean;
    onCardClick: (index: number, card: Card) => void;
    onFlipAll: () => void;
    onNextPack: () => void;
    onOpenAll: () => void;
    onBack: () => void;
    onHover: (card: Card, e: React.MouseEvent) => void;
    onLeave: () => void;
}) {
    // Three shapes:
    //  - single (≤5 cards, e.g. 3-card Tournament packs): one centered row, no
    //    empty second row (which used to leave a tall empty slab).
    //  - wide (>10, reprint packs): aligned auto-flow split evenly across 2 rows.
    //  - standard (6-10): the classic 5-on-top / staggered-below layout.
    const isSingle = pack.length <= 5;
    const isWide = pack.length > 10;
    const topCount = isSingle ? pack.length : isWide ? Math.ceil(pack.length / 2) : 5;

    return (
        <div className="h-full w-full flex flex-col min-h-0">
            {/* Header: left controls / centered title / right spacer */}
            <div className="flex items-end justify-between px-4 mb-2 relative z-20 shrink-0">
                <div className="flex gap-2 w-1/3">
                    <button onClick={onBack} className="pack-exit-btn">Back to Campaign</button>
                    <ParchmentButton onClick={onOpenAll} className="origin-left">Open All</ParchmentButton>
                </div>
                <div className="text-center w-1/3">
                    <h2 className="text-3xl font-black text-white drop-shadow-md leading-none">{set.set_name}</h2>
                    <p className="text-primary font-bold text-lg leading-none mt-1">Pack {packIndex + 1} of {packCount}</p>
                </div>
                <div className="w-1/3" />
            </div>

            {/* Cards panel — normally fills remaining height (grid distributes it
                evenly). For a SINGLE-row small pack the panel shrinks to the cards
                (justify-center) so the slab isn't a tall empty box. */}
            <div className={`flex-1 flex flex-col items-center w-full max-w-7xl mx-auto min-h-0 ${isSingle ? "justify-center" : ""}`}>
                <StonePanel className={`w-full min-h-0 flex flex-col relative px-6 py-3 shadow-2xl ${isSingle ? "flex-none" : "flex-1"}`}>
                    <div
                        className={`pack-grid ${isSingle ? "pack-grid--single" : ""} ${isWide ? "pack-grid--wide" : ""}`}
                        style={isSingle ? ({ "--pack-cols": pack.length } as React.CSSProperties) : undefined}
                    >
                        {pack.map((card, idx) => {
                            const setInfo =
                                card.card_sets?.find((s) => s.set_code.split("-")[0] === set.set_code.split("-")[0]) ||
                                card.card_sets?.[0];
                            let rarity = setInfo?.set_rarity || "Common";
                            if (rarity === "SP") rarity = "Short Print";

                            const isTop = idx < topCount;
                            // First card of the bottom row gets the half-card offset start
                            const cell = isTop
                                ? "pack-grid__cell--top"
                                : `pack-grid__cell--bottom${idx === topCount ? " pack-grid__cell--bottom-start" : ""}`;

                            return (
                                <div key={`${card.id}-${idx}`} className={cell}>
                                    <PackCard
                                        card={card}
                                        isFlipped={flippedCards.has(idx)}
                                        onClick={() => onCardClick(idx, card)}
                                        rarity={rarity}
                                        onMouseEnter={(e) => { if (flippedCards.has(idx)) onHover(card, e); }}
                                        onMouseLeave={onLeave}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </StonePanel>

                {/* Controls below the panel. Single-row packs shrink-wrap the slab
                    and center the block, so a larger gap here just uses existing
                    slack — it does NOT grow the modal (unlike the flex-1 standard
                    layout, where the panel already reaches the controls). */}
                <div className={`flex justify-center items-center gap-4 shrink-0 ${isSingle ? "pt-8" : "pt-3"}`}>
                    {!fullyOpened && <ParchmentButton onClick={onFlipAll}>Flip All</ParchmentButton>}
                    <button onClick={onNextPack} disabled={!fullyOpened} className={fullyOpened ? "pack-next-btn" : "pack-next-btn--disabled"}>
                        {packIndex < packCount - 1 ? "Next Pack" : "Finish"}
                    </button>
                </div>
            </div>
        </div>
    );
}
