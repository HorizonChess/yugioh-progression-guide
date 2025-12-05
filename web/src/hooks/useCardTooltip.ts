import { useState } from 'react';
import { Card } from '@/lib/api';

export interface CardTooltipState {
    hoveredCard: Card | null;
    cursorPosition: { x: number; y: number };
}

export interface CardTooltipHandlers {
    handleMouseMove: (e: React.MouseEvent) => void;
    setHoveredCard: (card: Card | null) => void;
}

export function useCardTooltip(): CardTooltipState & CardTooltipHandlers {
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        setCursorPosition({ x: e.clientX, y: e.clientY });
    };

    return {
        hoveredCard,
        cursorPosition,
        handleMouseMove,
        setHoveredCard,
    };
}
