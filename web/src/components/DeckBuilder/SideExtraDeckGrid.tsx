"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";

interface SideExtraDeckGridProps {
    sideDeck: Card[];
    extraDeck: Card[];
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'extra' | 'side', index: number) => void;
    onDrop: (e: React.DragEvent, to: 'extra' | 'side', index: number) => void;
    onRightClick: (e: React.MouseEvent, card: Card, from: 'extra' | 'side', index: number) => void;
}

export default function SideExtraDeckGrid({
    sideDeck = [],
    extraDeck = [],
    onHover,
    onDragStart,
    onDrop,
    onRightClick
}: SideExtraDeckGridProps) {

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderCards = (cards: Card[], zone: 'extra' | 'side') => {
        return cards.map((card, i) => (
            <div
                key={`${zone}-${i}`}
                className="aspect-[59/86] w-[calc(25%-1.5px)]"
            >
                <DeckSlot
                    index={i}
                    card={card}
                    dragContext="deck"
                    onHover={onHover}
                    onDragStart={(e) => onDragStart(e, card!, zone, i)}
                    onDrop={(e) => onDrop(e, zone, i)}
                    onDragOver={handleDragOver}
                    onContextMenu={(e) => card && onRightClick(e, card, zone, i)}
                    className="w-full h-full"
                />
            </div>
        ));
    };

    return (
        <div className="flex flex-col h-full gap-1 overflow-hidden">
            {/* Side Deck Section */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-teal-800/80 rounded-t border border-teal-600 px-2 py-0.5 shrink-0">
                    <span className="text-teal-100 font-bold text-[10px] tracking-widest">SIDE DECK ({sideDeck.length}/15)</span>
                </div>
                <div
                    className="flex-1 bg-slate-900/50 border border-t-0 border-teal-900/50 rounded-b overflow-y-auto p-1"
                    onDragOver={handleDragOver}
                >
                    <div className="flex flex-wrap gap-0.5 content-start">
                        {renderCards(sideDeck, 'side')}
                    </div>
                </div>
            </div>

            {/* Extra Deck Section */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-purple-900/80 rounded-t border border-purple-700 px-2 py-0.5 shrink-0">
                    <span className="text-purple-100 font-bold text-[10px] tracking-widest">EXTRA DECK ({extraDeck.length}/15)</span>
                </div>
                <div
                    className="flex-1 bg-slate-900/50 border border-t-0 border-purple-900/50 rounded-b overflow-y-auto p-1"
                    onDragOver={handleDragOver}
                >
                    <div className="flex flex-wrap gap-0.5 content-start">
                        {renderCards(extraDeck, 'extra')}
                    </div>
                </div>
            </div>
        </div>
    );
}
