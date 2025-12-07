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

    const renderSlots = (cards: Card[], zone: 'extra' | 'side', totalSlots: number) => {
        const slots = [];
        for (let i = 0; i < totalSlots; i++) {
            const card = cards[i];
            slots.push(
                <DeckSlot
                    key={`${zone}-${i}`}
                    index={i}
                    card={card}
                    onHover={onHover}
                    onDragStart={(e) => onDragStart(e, card!, zone, i)}
                    onDrop={(e) => onDrop(e, zone, i)}
                    onDragOver={handleDragOver}
                    onContextMenu={(e) => card && onRightClick(e, card, zone, i)}
                    className={`w-full h-full ${!card ? "opacity-30" : ""}`}
                />
            );
        }
        return slots;
    };

    return (
        <div className="flex h-full gap-1">
            {/* Labels */}
            <div className="w-5 shrink-0 flex flex-col gap-1 h-full">
                <div className="flex-1 bg-teal-800/80 rounded border border-teal-600 flex items-center justify-center overflow-hidden">
                    <span className="text-teal-100 font-bold text-[8px] tracking-widest rotate-180" style={{ writingMode: 'vertical-rl' }}>SIDE</span>
                </div>
                <div className="flex-1 bg-purple-900/80 rounded border border-purple-700 flex items-center justify-center overflow-hidden">
                    <span className="text-purple-100 font-bold text-[8px] tracking-widest rotate-180" style={{ writingMode: 'vertical-rl' }}>EXTRA</span>
                </div>
            </div>

            {/* Grids stacked */}
            <div className="flex-1 flex flex-col gap-1 h-full">
                {/* Side Deck 5x3 */}
                <div
                    className="flex-1 bg-slate-900/50 border border-teal-900/50 rounded overflow-hidden"
                    onDragOver={handleDragOver}
                    onDrop={(e) => onDrop(e, 'side', sideDeck.length)}
                >
                    <div className="grid grid-cols-5 grid-rows-3 gap-0 w-full h-full">
                        {renderSlots(sideDeck, 'side', 15)}
                    </div>
                </div>

                {/* Extra Deck 5x3 */}
                <div
                    className="flex-1 bg-slate-900/50 border border-purple-900/50 rounded overflow-hidden"
                    onDragOver={handleDragOver}
                    onDrop={(e) => onDrop(e, 'extra', extraDeck.length)}
                >
                    <div className="grid grid-cols-5 grid-rows-3 gap-0 w-full h-full">
                        {renderSlots(extraDeck, 'extra', 15)}
                    </div>
                </div>
            </div>
        </div>
    );
}
