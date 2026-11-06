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
        <div className="flex flex-col h-full gap-2 overflow-hidden">
            {/* Side Deck Section */}
            <div className="db-panel flex-1">
                <div className="db-band db-band--side">Side Deck <small>{sideDeck.length} / 15</small></div>
                <div className="db-zone custom-scrollbar">
                    <div className="flex flex-wrap gap-0.5 content-start">
                        {renderSlots(sideDeck, 'side', 15)}
                    </div>
                </div>
            </div>

            {/* Extra Deck Section */}
            <div className="db-panel flex-1">
                <div className="db-band db-band--extra">Extra Deck <small>{extraDeck.length} / 15</small></div>
                <div className="db-zone custom-scrollbar">
                    <div className="flex flex-wrap gap-0.5 content-start">
                        {renderSlots(extraDeck, 'extra', 15)}
                    </div>
                </div>
            </div>
        </div>
    );
}
