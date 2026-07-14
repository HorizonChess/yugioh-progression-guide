"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot.view";


interface DeckGridProps {
    mainDeck: Card[];
    extraDeck: Card[];
    sideDeck: Card[];
    stats: { monsters: number, spells: number, traps: number, total: number };
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'main' | 'extra' | 'side', index: number) => void;
    onDrop: (e: React.DragEvent, to: 'main' | 'extra' | 'side', index: number) => void;
    onRightClick: (e: React.MouseEvent, card: Card, from: 'main' | 'extra' | 'side', index: number) => void;
}

export default function DeckGrid({
    mainDeck = [],
    extraDeck = [],
    sideDeck = [],
    stats,
    onHover,
    onDragStart,
    onDrop,
    onRightClick
}: DeckGridProps) {

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderSlots = (cards: Card[], zone: 'main' | 'extra' | 'side', totalSlots: number) => {
        const slots = [];
        for (let i = 0; i < totalSlots; i++) {
            const card = cards[i];
            slots.push(
                // h-full w-full ensures the Slot fills the Grid Cell perfectly.
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
        <div className="flex flex-row h-full gap-1 p-1 items-center justify-center">

            {/* Left Box: Stats + Main Deck */}
            {/* 
                Main Deck Ratio: 590 / 516
                Using gap-0 inside the grid means this ratio is EXACT.
            */}
            <div className="flex h-full gap-1 items-stretch aspect-[590/516] min-w-0">

                {/* Stats Sidebar */}
                <div className="w-10 shrink-0 flex flex-col gap-1 justify-center py-2 h-full">
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

                {/* Main Deck 10x6 with GAP-0 */}
                <div
                    className="flex-1 bg-[url('/bg/fabric_pattern.png')] bg-repeat shadow-inner border border-wood-mid rounded overflow-hidden"
                    onDragOver={handleDragOver}
                    onDrop={(e) => onDrop(e, 'main', mainDeck.length)}
                >
                    <div className="grid grid-cols-10 grid-rows-6 gap-0 w-full h-full">
                        {renderSlots(mainDeck, 'main', 60)}
                    </div>
                </div>
            </div>

            {/* Right Box: Side + Extra (Stacked) */}
            {/* Aspect Ratio 295/516 */}
            <div className="flex h-full gap-1 items-stretch aspect-[295/516] min-w-0">

                {/* Labels */}
                <div className="w-6 shrink-0 flex flex-col gap-1 h-full">
                    <div className="flex-1 bg-teal-800/80 rounded border border-teal-600 flex items-center justify-center overflow-hidden">
                        <span className="text-teal-100 font-bold text-[10px] tracking-widest rotate-180" style={{ writingMode: 'vertical-rl' }}>SIDE</span>
                    </div>
                    <div className="flex-1 bg-purple-900/80 rounded border border-purple-700 flex items-center justify-center overflow-hidden">
                        <span className="text-purple-100 font-bold text-[10px] tracking-widest rotate-180" style={{ writingMode: 'vertical-rl' }}>EXTRA</span>
                    </div>
                </div>

                {/* Grids with GAP-0 */}
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

        </div>
    );
}
