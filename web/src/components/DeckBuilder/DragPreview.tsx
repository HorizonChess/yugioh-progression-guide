import { createPortal } from "react-dom";
import { Card } from "@/lib/api";
import { MutableRefObject } from "react";

interface DragPreviewProps {
    card: Card;
    previewRef: MutableRefObject<{
        element: HTMLDivElement | null;
        position: { x: number; y: number };
        rafId: number | null;
    }>;
}

export default function DragPreview({ card, previewRef }: DragPreviewProps) {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            ref={(el) => {
                previewRef.current.element = el;
            }}
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '105px',
                height: '153px',
                pointerEvents: 'none',
                zIndex: 9999,
                transform: `translate3d(${previewRef.current.position.x - 52.5}px, ${previewRef.current.position.y - 76.5}px, 0)`,
                willChange: 'transform',
            }}
            className="opacity-100 transition-none"
        >
            <img
                src={card.card_images[0].image_url}
                alt={card.name}
                className="w-full h-full object-fill rounded-[4px]"
                style={{
                    filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
                    imageRendering: 'crisp-edges'
                }}
            />
        </div>,
        document.body
    );
}
