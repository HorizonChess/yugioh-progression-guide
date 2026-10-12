"use client";

import { Card } from "@/lib/api";
import { DeckZone } from "@/lib/deck-utils";
import DeckSlot from "./DeckSlot";

type SideZone = Exclude<DeckZone, "main">;

interface SideExtraDeckGridProps {
    sideDeck: Card[];
    extraDeck: Card[];
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: SideZone, index: number) => void;
    onDrag: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, to: SideZone, index: number) => void;
    onRightClick: (e: React.MouseEvent, card: Card, from: SideZone, index: number) => void;
}

export default function SideExtraDeckGrid({
    sideDeck = [],
    extraDeck = [],
    onHover,
    onDragStart,
    onDrag,
    onDragEnd,
    onDrop,
    onRightClick
}: SideExtraDeckGridProps) {

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderSlots = (cards: Card[], zone: SideZone, totalSlots: number) => {
        const slots = [];
        for (let i = 0; i < totalSlots; i++) {
            const card = cards[i];
            slots.push(
                <div
                    key={`${zone}-${i}`}
                    className="aspect-[59/86] w-[calc(25%-1.5px)]"
                >
                    <DeckSlot
                        index={i}
                        card={card}
                        dragContext="deck"
                        onHover={onHover}
                        onDragStart={(e, slotCard) => onDragStart(e, slotCard, zone, i)}
                        onDrag={onDrag}
                        onDragEnd={onDragEnd}
                        onDrop={(e) => onDrop(e, zone, i)}
                        onDragOver={handleDragOver}
                        onContextMenu={(e) => card && onRightClick(e, card, zone, i)}
                        className={`w-full h-full ${!card ? "opacity-30" : ""}`}
                    />
                </div>
            );
        }
        return slots;
    };

    return (
        <div className="flex flex-col h-full gap-1 overflow-hidden">
            {/* Side Deck Section */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-teal-800/80 rounded-t border border-teal-600 px-2 py-0.5 shrink-0">
                    <span className="text-teal-100 font-bold text-[10px] tracking-widest">SIDE DECK ({sideDeck.length}/15)</span>
                </div>
                <div className="flex-1 bg-slate-900/50 border border-t-0 border-teal-900/50 rounded-b overflow-y-auto p-1">
                    <div className="flex flex-wrap gap-0.5 content-start">
                        {renderSlots(sideDeck, 'side', 15)}
                    </div>
                </div>
            </div>

            {/* Extra Deck Section */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-purple-900/80 rounded-t border border-purple-700 px-2 py-0.5 shrink-0">
                    <span className="text-purple-100 font-bold text-[10px] tracking-widest">EXTRA DECK ({extraDeck.length}/15)</span>
                </div>
                <div className="flex-1 bg-slate-900/50 border border-t-0 border-purple-900/50 rounded-b overflow-y-auto p-1">
                    <div className="flex flex-wrap gap-0.5 content-start">
                        {renderSlots(extraDeck, 'extra', 15)}
                    </div>
                </div>
            </div>
        </div>
    );
}
