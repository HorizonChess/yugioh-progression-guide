"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";

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

    const renderSlots = (cards: Card[], zone: 'main' | 'extra' | 'side', minSlots: number = 40, cols: number = 10) => {
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
                    className={!card ? "opacity-30" : ""}
                />
            );
        }
        return slots;
    };

    return (
        <div className="flex flex-col h-full gap-1">

            {/* Split View: Stats Sidebar + Main Deck Grid */}
            <div className="flex flex-1 overflow-hidden gap-1">

                {/* Stats Sidebar (Left of Main Deck) */}
                <div className="w-12 shrink-0 flex flex-col gap-1 py-1">
                    {/* Total Main */}
                    <div className="aspect-square bg-gradient-to-b from-gray-200 to-gray-400 rounded-md border border-gray-500 flex flex-col items-center justify-center shadow-md">
                        <span className="text-black font-bold text-lg leading-none">{stats.total}</span>
                    </div>
                    {/* Monsters */}
                    <div className="aspect-square bg-gradient-to-b from-yellow-600 to-yellow-800 rounded-md border border-yellow-900 flex flex-col items-center justify-center shadow-md">
                        <span className="text-white font-bold text-lg leading-none">{stats.monsters}</span>
                    </div>
                    {/* Spells */}
                    <div className="aspect-square bg-gradient-to-b from-green-600 to-green-800 rounded-md border border-green-900 flex flex-col items-center justify-center shadow-md relative">
                        {/* Spell Icon SVG placeholder or just color */}
                        <span className="text-white font-bold text-lg leading-none">{stats.spells}</span>
                    </div>
                    {/* Traps */}
                    <div className="aspect-square bg-gradient-to-b from-pink-600 to-pink-800 rounded-md border border-pink-900 flex flex-col items-center justify-center shadow-md">
                        <span className="text-white font-bold text-lg leading-none">{stats.traps}</span>
                    </div>

                    {/* Extra Buttons can go below */}
                    <div className="mt-auto flex flex-col gap-1">
                        {/* Shuffle/Sort Icons could go here */}
                    </div>
                </div>

                {/* Main Deck Grid */}
                <div
                    className="flex-1 overflow-y-auto bg-[url('/bg/fabric_pattern.png')] bg-repeat p-1 border border-[#6b5b45] rounded shadow-inner custom-scrollbar"
                    onDragOver={handleDragOver}
                    onDrop={(e) => onDrop(e, 'main', mainDeck.length)}
                >
                    <div className="grid grid-cols-10 gap-0.5 min-h-[400px] content-start">
                        {renderSlots(mainDeck, 'main', 60, 10)}
                    </div>
                </div>

            </div>

            {/* Bottom: Side and Extra Decks */}
            <div className="flex flex-col gap-0.5 shrink-0 bg-[#0d1b2a] border-t border-slate-600 pt-1">
                {/* Side */}
                <div className="flex h-16"> {/* Fixed height rows */}
                    <div className="w-12 bg-teal-700 text-white flex items-center justify-center font-bold text-sm vertical-text border-r border-black" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        SIDE
                    </div>
                    <div
                        className="flex-1 p-1 flex gap-0.5 overflow-x-auto overflow-y-hidden custom-scrollbar bg-slate-900/50"
                        onDragOver={handleDragOver}
                        onDrop={(e) => onDrop(e, 'side', sideDeck.length)}
                    >
                        <div className="flex gap-0.5 min-w-full h-full">
                            {/* Force slots to be aspect ration 2/3 but fit height */}
                            {renderSlots(sideDeck, 'side', 15, 15).map((slot: any, i) => (
                                <div key={i} className="h-full w-auto aspect-[2/3] shrink-0">
                                    {slot}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Extra */}
                <div className="flex h-16">
                    <div className="w-12 bg-orange-700 text-white flex items-center justify-center font-bold text-sm vertical-text border-r border-black" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        EXTRA
                    </div>
                    <div
                        className="flex-1 p-1 flex gap-0.5 overflow-x-auto overflow-y-hidden custom-scrollbar bg-slate-900/50"
                        onDragOver={handleDragOver}
                        onDrop={(e) => onDrop(e, 'extra', extraDeck.length)}
                    >
                        <div className="flex gap-0.5 min-w-full h-full">
                            {renderSlots(extraDeck, 'extra', 15, 15).map((slot: any, i) => (
                                <div key={i} className="h-full w-auto aspect-[2/3] shrink-0">
                                    {slot}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
