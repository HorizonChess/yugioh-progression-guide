"use client";

import { useState, useEffect } from "react";
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
    onDrag?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    isUnavailable?: boolean;
    dragContext?: 'search' | 'deck';
}

export default function DeckSlot({ card, index, onClick, onDoubleClick, onContextMenu, onHover, className = "", onDragStart, onDrop, onDragOver, onDrag, onDragEnd, isUnavailable, dragContext }: DeckSlotProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Defensive cleanup: reset drag states when card changes or component unmounts
    useEffect(() => {
        return () => {
            setIsDragging(false);
            setIsDragOver(false);
        };
    }, [card?.id]); // Reset when card changes (using optional chaining for undefined)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent container from handling
        setIsDragOver(true);
        if (onDragOver) onDragOver(e);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        try {
            if (onDrop) onDrop(e, index);
        } catch (err) {
            console.error("DeckSlot drop error:", err);
        }
    };

    // Outer container fills the grid cell and centers the card
    // Inner container maintains aspect ratio based on height
    return (
        <div
            className={`${className} flex items-center justify-center`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            <div
                className={`
                    relative aspect-[59/86] h-[96%] max-w-[96%] transition-all box-border
                    border-[0.5px] border-[#0d1b2a]/30
                    ${isDragging && dragContext === 'deck' ? 'opacity-0' : ''}
                    ${isDragOver ? "ring-4 ring-blue-400 bg-blue-100/20 scale-105 z-20" : ""}
                    ${isUnavailable
                        ? "grayscale opacity-50 cursor-not-allowed"
                        : card
                            ? "cursor-pointer hover:ring-2 hover:ring-[#ffff00] hover:z-10 group"
                            : "bg-white/5"
                    }
                `}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
                onMouseEnter={() => onHover && onHover(card || null)}
                onMouseLeave={() => onHover && onHover(null)}
                draggable={!!card && !isUnavailable}
                onDragStart={(e) => {
                    if (card && onDragStart) {
                        setIsDragging(true);
                        onDragStart(e, card, index);
                    }
                }}
                onDrag={(e) => onDrag && onDrag(e)}
                onDragEnd={(e) => {
                    setIsDragging(false);
                    onDragEnd && onDragEnd(e);
                }}
            >
                {card ? (
                    <>
                        <img
                            src={card.card_images[0].image_url}
                            alt={card.name}
                            className="w-full h-full object-fill rounded-[1px]"
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
        </div>
    );
}
