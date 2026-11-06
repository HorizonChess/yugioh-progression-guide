"use client";

import { useMemo, useState } from "react";
import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";
import { CardFilterFields, useCardFilters } from "./useCardFilters";

interface CardSearchPanelProps {
    collectionCards: { card: Card; count: number }[];
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'search') => void;
    onDrag: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onCardDoubleClick?: (card: Card) => void;
    /** Cosmetically-banned card ids (Phase 5): greyed + marked, add is blocked. */
    bannedIds?: Set<number>;
}

/** The desktop search: today's filters in parchment, then your cards a page at a time. */
export default function CardSearchPanel({ collectionCards = [], onHover, onDragStart, onDrag, onDragEnd, onCardDoubleClick, bannedIds }: CardSearchPanelProps) {
    const cards = useMemo(() => collectionCards.map((c) => c.card), [collectionCards]);
    const f = useCardFilters(cards);

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 20;
    const totalPages = Math.ceil(f.filtered.length / pageSize) || 1;
    const safePage = Math.min(Math.max(1, page), totalPages);
    const currentCards = f.filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    return (
        <div className="db-panel h-full">
            <div className="db-band">Search <small>{f.filtered.length} yours</small></div>
            <CardFilterFields f={f} />
            <div className="db-pager">
                <button className="db-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">‹</button>
                <span>{safePage} / {totalPages}</span>
                <button className="db-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">›</button>
            </div>
            <div className="db-results custom-scrollbar">
                {currentCards.map((card, i) => {
                    const count = collectionCards.find((c) => c.card.id === card.id)?.count || 0;
                    const isBanned = bannedIds?.has(card.id) ?? false;
                    return (
                        <div key={card.id + "-" + i} className="relative">
                            <DeckSlot
                                index={i}
                                card={card}
                                isUnavailable={count === 0}
                                banned={isBanned}
                                dragContext="search"
                                onHover={onHover}
                                onDragStart={(e) => onDragStart(e, card, 'search')}
                                onDrag={onDrag}
                                onDragEnd={onDragEnd}
                                onDoubleClick={() => onCardDoubleClick && onCardDoubleClick(card)}
                            />
                            <span className="db-left">×{count}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
