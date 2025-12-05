"use client";

import { Card } from "@/lib/api";
import Image from "next/image";

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
                relative aspect-[2/3] bg-black/40 border border-gray-700/50 rounded 
                hover:border-[var(--primary)] transition-colors cursor-pointer group
                ${className}
            `}
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
                <>
                    <Image
                        src={card.card_images[0].image_url}
                        alt={card.name}
                        fill
                        className="object-cover rounded"
                        sizes="100px"
                    />
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                    <span className="text-[10px] sm:text-xs font-mono text-gray-500">{index + 1}</span>
                </div>
            )}
        </div>
    );
}
