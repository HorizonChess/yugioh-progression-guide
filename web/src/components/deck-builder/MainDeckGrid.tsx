"use client";

import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";

interface MainDeckGridProps {
    mainDeck: Card[];
    stats: { monsters: number; spells: number; traps: number; total: number };
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'main', index: number) => void;
    onDrag: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, to: 'main', index: number) => void;
    onRightClick: (e: React.MouseEvent, card: Card, from: 'main', index: number) => void;
}

export default function MainDeckGrid({
    mainDeck = [],
    stats,
    onHover,
    onDragStart,
    onDrag,
    onDragEnd,
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
                    dragContext="deck"
                    onHover={onHover}
                    onDragStart={(e, slotCard) => onDragStart(e, slotCard, 'main', i)}
                    onDrag={onDrag}
                    onDragEnd={onDragEnd}
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
        <div className="db-panel h-full">
            {/* The gold band: the deck's size against the rules, and its make-up */}
            <div className="db-band">
                Main Deck
                <span className="db-gems">
                    <span className="db-gem db-gem--mon" title="Monsters"><i />{stats.monsters}</span>
                    <span className="db-gem db-gem--spell" title="Spells"><i />{stats.spells}</span>
                    <span className="db-gem db-gem--trap" title="Traps"><i />{stats.traps}</span>
                </span>
                <small className={stats.total < 40 ? "db-short" : ""}>{stats.total} / 40–60</small>
            </div>
            {/* Main Deck 10x6 Grid, on the mat */}
            <div className="db-mat" onDragOver={handleDragOver}>
                <div className="grid grid-cols-10 grid-rows-6 gap-0 w-full h-full">
                    {renderSlots(mainDeck, 60)}
                </div>
            </div>
        </div>
    );
}
