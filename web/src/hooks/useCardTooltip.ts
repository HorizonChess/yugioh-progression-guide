import { useState, useRef, useEffect } from 'react';
import { Card } from '@/lib/api';

export interface CardTooltipState {
    hoveredCard: Card | null;
    tooltipPosition: { x: number; y: number };
}

export interface CardTooltipHandlers {
    onHover: (card: Card, e: React.MouseEvent) => void;
    onLeave: () => void;
}

export function useCardTooltip(): CardTooltipState & CardTooltipHandlers {
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const onHover = (card: Card, e: React.MouseEvent) => {
        // Clear any existing timeout (e.g. if moving quickly between cards)
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        const isRightSide = rect.left > centerX;

        const x = isRightSide ? rect.left : rect.right;
        const y = rect.top;

        // Preload image immediately
        if (card.card_images?.[0]?.image_url_small) {
            const img = new Image();
            img.src = card.card_images[0].image_url_small;
        }

        // Set 200ms delay before showing tooltip
        timeoutRef.current = setTimeout(() => {
            setTooltipPosition({ x, y });
            setHoveredCard(card);
        }, 200);
    };

    const onLeave = () => {
        // Cancel the pending tooltip show if we leave before 200ms
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setHoveredCard(null);
    };

    return {
        hoveredCard,
        tooltipPosition,
        onHover,
        onLeave,
    };
}
