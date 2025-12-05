"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";

interface DeckGridProps {
    mainDeck: Card[];
    extraDeck: Card[];
    sideDeck: Card[];
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'main' | 'extra' | 'side', index: number) => void;
    onDrop: (e: React.DragEvent, to: 'main' | 'extra' | 'side', index: number) => void;
    onRightClick: (e: React.MouseEvent, card: Card, from: 'main' | 'extra' | 'side', index: number) => void;
}

export default function DeckGrid({ mainDeck = [], extraDeck = [], sideDeck = [], onHover, onDragStart, onDrop, onRightClick }: DeckGridProps) {
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderSlots = (cards: Card[], zone: 'main' | 'extra' | 'side', minSlots: number = 40) => {
        const slots = [];
        const totalSlots = Math.max(cards.length, minSlots);

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
                    className={!card ? "opacity-50" : ""} // Valid drop target even if empty
                />
            );
        }

        // Always add a few empty slots at the end to make dropping easier? 
        // Actually the loop above covers it if we set minSlots appropriately.
        // But for Main Deck, if > 40 cards, we just show cards.length. 
        // If we want to allow appending, we need drop targets beyond the last card.
        // Or we treat the entire container as a drop target too?
        // For simplicity, dropping ON an empty slot works. Dropping ON a card works (insert).
        // Let's ensure there's at least one empty slot if < 60?
        if (cards.length < 60 && zone === 'main' && cards.length >= minSlots) {
            slots.push(
                <DeckSlot
                    key={`${zone}-append`}
                    index={cards.length}
                    onHover={onHover}
                    onDrop={(e) => onDrop(e, zone, cards.length)}
                    onDragOver={handleDragOver}
                    className="opacity-30"
                />
            );
        }

        return slots;
    };

    return (
        <div className="flex-1 bg-[url('/bg/fabric_pattern.png')] bg-repeat flex flex-col gap-2 p-2 overflow-y-auto custom-scrollbar">
            {/* Main Deck */}
            <div className="flex-1 min-h-[400px]">
                <div className="flex justify-between items-center mb-1 px-2">
                    <h3 className="text-[#d4af37] font-bold text-shadow">Main Deck</h3>
                    <span className="text-white font-mono text-sm">{mainDeck.length} Cards</span>
                </div>
                <div className="grid grid-cols-10 gap-1 p-2 bg-black/20 rounded border border-[#8b7355]/30">
                    {renderSlots(mainDeck, 'main', 40)}
                </div>
            </div>

            {/* Extra & Side */}
            <div className="flex gap-2 min-h-[150px]">
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-1 px-2">
                        <h3 className="text-[#a086b7] font-bold text-shadow">Extra Deck</h3>
                        <span className="text-white font-mono text-sm">{extraDeck.length}</span>
                    </div>
                    <div className="grid grid-cols-10 gap-1 p-2 bg-black/20 rounded border border-[#8b7355]/30 h-full content-start">
                        {renderSlots(extraDeck, 'extra', 10)}
                    </div>
                </div>
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-1 px-2">
                        <h3 className="text-[#d4af37] font-bold text-shadow">Side Deck</h3>
                        <span className="text-white font-mono text-sm">{sideDeck.length}</span>
                    </div>
                    <div className="grid grid-cols-10 gap-1 p-2 bg-black/20 rounded border border-[#8b7355]/30 h-full content-start">
                        {renderSlots(sideDeck, 'side', 10)}
                    </div>
                </div>
            </div>
        </div>
    );
}
