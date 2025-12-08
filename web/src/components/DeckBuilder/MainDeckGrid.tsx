"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";

interface MainDeckGridProps {
    mainDeck: Card[];
    stats: { monsters: number; spells: number; traps: number; total: number };
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'main', index: number) => void;
    onDrop: (e: React.DragEvent, to: 'main', index: number) => void;
    onRightClick: (e: React.MouseEvent, card: Card, from: 'main', index: number) => void;
}

export default function MainDeckGrid({
    mainDeck = [],
    stats,
    onHover,
    onDragStart,
    onDrop,
    onRightClick
}: MainDeckGridProps) {

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderSlots = (cards: Card[], totalSlots: number) => {
        const slots = [];
        for (let i = 0; i < totalSlots; i++) {
            const card = cards[i];
            slots.push(
                <DeckSlot
                    key={`main-${i}`}
                    index={i}
                    card={card}
                    onHover={onHover}
                    onDragStart={(e) => onDragStart(e, card!, 'main', i)}
                    onDrop={(e) => onDrop(e, 'main', i)}
                    onDragOver={handleDragOver}
                    onContextMenu={(e) => card && onRightClick(e, card, 'main', i)}
                    className={`w-full h-full ${!card ? "opacity-30" : ""}`}
                />
            );
        }
        return slots;
    };

    return (
        <div className="flex h-full gap-1">
            {/* Stats Sidebar */}
            <div className="w-9 shrink-0 flex flex-col gap-1 justify-center py-2 h-full">
                <div className="aspect-square w-full bg-gradient-to-b from-gray-200 to-gray-400 rounded border border-gray-500 flex flex-col items-center justify-center shadow-md cursor-help" title="Total Cards">
                    <span className="text-black font-bold text-xs sm:text-sm md:text-base leading-none">{stats.total}</span>
                </div>
                <div className="aspect-square w-full bg-gradient-to-b from-yellow-600 to-yellow-800 rounded border border-yellow-900 flex flex-col items-center justify-center shadow-md cursor-help" title="Monsters">
                    <span className="text-white font-bold text-xs sm:text-sm md:text-base leading-none">{stats.monsters}</span>
                </div>
                <div className="aspect-square w-full bg-gradient-to-b from-cyan-400 to-cyan-600 rounded border border-cyan-800 flex flex-col items-center justify-center shadow-md cursor-help" title="Spells">
                    <span className="text-white font-bold text-xs sm:text-sm md:text-base leading-none">{stats.spells}</span>
                </div>
                <div className="aspect-square w-full bg-gradient-to-b from-pink-600 to-pink-800 rounded border border-pink-900 flex flex-col items-center justify-center shadow-md cursor-help" title="Traps">
                    <span className="text-white font-bold text-xs sm:text-sm md:text-base leading-none">{stats.traps}</span>
                </div>
            </div>

            {/* Main Deck 10x6 Grid */}
            <div
                className="flex-1 aspect-[590/516] bg-[url('/bg/fabric_pattern.png')] bg-repeat shadow-inner border border-[#6b5b45] rounded overflow-hidden"
                onDragOver={handleDragOver}
            >
                <div className="grid grid-cols-10 grid-rows-6 gap-0 w-full h-full">
                    {renderSlots(mainDeck, 60)}
                </div>
            </div>
        </div>
    );
}
