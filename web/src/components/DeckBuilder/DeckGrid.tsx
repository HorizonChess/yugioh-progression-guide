"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";
import { useEffect, useRef, useState } from "react";

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

    // We need to fit 60 slots (10 cols x 6 rows) exactly in the main deck area.
    // CSS Grid can handle this with `grid-template-rows: repeat(6, 1fr)`.

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const renderSlots = (cards: Card[], zone: 'main' | 'extra' | 'side', totalSlots: number) => {
        const slots = [];

        for (let i = 0; i < totalSlots; i++) {
            const card = cards[i];
            // Key change: We want the slot inside the grid cell to maintain aspect ratio.
            // Grid cell is w-full h-full. Child should be centered.
            slots.push(
                <div key={`${zone}-${i}`} className="w-full h-full flex items-center justify-center min-w-0 min-h-0">
                    <DeckSlot
                        index={i}
                        card={card}
                        onHover={onHover}
                        onDragStart={(e) => onDragStart(e, card!, zone, i)}
                        onDrop={(e) => onDrop(e, zone, i)}
                        onDragOver={handleDragOver}
                        onContextMenu={(e) => card && onRightClick(e, card, zone, i)}
                        className={`
                            ${!card ? "opacity-30 border-dashed border-gray-600" : ""} 
                            h-full w-auto aspect-[2/3] object-contain
                        `}
                    />
                </div>
            );
        }
        return slots;
    };

    return (
        <div className="flex flex-col h-full gap-1 p-1">

            {/* Top Area: Stats + Main Deck */}
            <div className="flex flex-1 min-h-0 gap-1">

                {/* Stats Sidebar */}
                <div className="w-12 shrink-0 flex flex-col gap-1 justify-center py-2 h-full">
                    {/* Total Main */}
                    <div className="aspect-square w-full bg-gradient-to-b from-gray-200 to-gray-400 rounded border border-gray-500 flex flex-col items-center justify-center shadow-md cursor-help" title="Total Cards">
                        <span className="text-black font-bold text-lg leading-none">{stats.total}</span>
                    </div>
                    {/* Monsters */}
                    <div className="aspect-square w-full bg-gradient-to-b from-yellow-600 to-yellow-800 rounded border border-yellow-900 flex flex-col items-center justify-center shadow-md cursor-help" title="Monsters">
                        <span className="text-white font-bold text-lg leading-none">{stats.monsters}</span>
                    </div>
                    {/* Spells */}
                    <div className="aspect-square w-full bg-gradient-to-b from-cyan-400 to-cyan-600 rounded border border-cyan-800 flex flex-col items-center justify-center shadow-md cursor-help" title="Spells">
                        <span className="text-white font-bold text-lg leading-none">{stats.spells}</span>
                    </div>
                    {/* Traps */}
                    <div className="aspect-square w-full bg-gradient-to-b from-pink-600 to-pink-800 rounded border border-pink-900 flex flex-col items-center justify-center shadow-md cursor-help" title="Traps">
                        <span className="text-white font-bold text-lg leading-none">{stats.traps}</span>
                    </div>
                </div>

                {/* Main Deck Grid - 10x6 Fixed Layout */}
                <div
                    className="flex-1 bg-[url('/bg/fabric_pattern.png')] bg-repeat p-1 border border-[#6b5b45] rounded shadow-inner overflow-hidden"
                    onDragOver={handleDragOver}
                    onDrop={(e) => onDrop(e, 'main', mainDeck.length)}
                >
                    <div className="grid grid-cols-10 grid-rows-6 gap-0.5 w-full h-full">
                        {renderSlots(mainDeck, 'main', 60)}
                    </div>
                </div>

            </div>

            {/* Bottom: Side and Extra Decks */}
            <div className="flex flex-col gap-0.5 shrink-0 bg-[#0d1b2a] border-t border-slate-600 pt-0.5">
                {/* Side */}
                <div className="flex h-16 w-full overflow-hidden">
                    <div className="w-12 bg-teal-700 text-white flex items-center justify-center font-bold text-xs vertical-text border-r border-black shrink-0" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        SIDE
                    </div>
                    <div
                        className="flex-1 p-0.5 flex gap-0.5 bg-slate-900/50 overflow-hidden"
                        onDragOver={handleDragOver}
                        onDrop={(e) => onDrop(e, 'side', sideDeck.length)}
                    >
                        {/* 15 Slots Flex to fit width */}
                        <div className="flex w-full h-full gap-0.5 items-center">
                            {renderSlots(sideDeck, 'side', 15).map((slot: any, i) => (
                                <div key={i} className="flex-1 min-w-0 h-full flex items-center justify-center">
                                    {slot}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Extra */}
                <div className="flex h-16 w-full overflow-hidden">
                    <div className="w-12 bg-orange-700 text-white flex items-center justify-center font-bold text-xs vertical-text border-r border-black shrink-0" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        EXTRA
                    </div>
                    <div
                        className="flex-1 p-0.5 flex gap-0.5 bg-slate-900/50 overflow-hidden"
                        onDragOver={handleDragOver}
                        onDrop={(e) => onDrop(e, 'extra', extraDeck.length)}
                    >
                        <div className="flex w-full h-full gap-0.5 items-center">
                            {renderSlots(extraDeck, 'extra', 15).map((slot: any, i) => (
                                <div key={i} className="flex-1 min-w-0 h-full flex items-center justify-center">
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
