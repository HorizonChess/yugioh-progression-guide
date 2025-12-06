"use client";

import { Card } from "@/lib/api";

interface DeckSlotProps {
    card?: Card;
    index: number;
    onClick?: () => void;
    onDoubleClick?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onHover?: (card: Card | null) => void;
    className?: string;
    onDragStart?: (e: React.DragEvent, card: Card, index: number) => void;
    onDrop?: (e: React.DragEvent, index: number) => void;
    onDragOver?: (e: React.DragEvent) => void;
}

export default function DeckSlot({ card, index, onClick, onDoubleClick, onContextMenu, onHover, className = "", onDragStart, onDrop, onDragOver }: DeckSlotProps) {
    return (
        <div
            className={`
                relative aspect-[59/86] transition-all box-border
                border-[0.5px] border-[#0d1b2a]/30 
                ${card
                    ? "cursor-pointer hover:ring-2 hover:ring-[#ffff00] hover:z-10 group"
                    : "bg-white/5"
                }
                ${className}
            `}
            // Border simulates gap. Using background color for border blends it in.
            // Using box-border means padding/border is included in width, so Aspect Ratio of 59/86 refers to the OUTER box.
            // This is perfect for the grid.

            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover && onHover(card || null)}
            onMouseLeave={() => onHover && onHover(null)}
            draggable={!!card}
            onDragStart={(e) => card && onDragStart && onDragStart(e, card, index)}
            onDrop={(e) => onDrop && onDrop(e, index)}
            onDragOver={onDragOver}
        >
            {card ? (
                /* Use standard img tag to match PackCard.tsx behavior and ensure native rendering without Next.js resizing artifacts */
                <>
                    <img
                        src={card.card_images[0].image_url}
                        alt={card.name}
                        className="w-full h-full object-fill rounded-[1px]"
                    // object-fill ensures no truncation. 
                    // Since container is aspect-[59/86] and image is 59x86, no distortion will occur.
                    />
                    {/* Hover Shine */}
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 pointer-events-none rounded-[1px]" />
                </>
            ) : (
                /* Empty Slot Zone */
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[90%] h-[90%] border border-white/5 rounded-[1px]" />
                </div>
            )}
        </div>
    );
}
