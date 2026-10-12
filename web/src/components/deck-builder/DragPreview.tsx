import { createPortal } from "react-dom";
import { Card } from "@/lib/api";
import { RefObject } from "react";

/** Mutable handle the deck builder uses to move the preview without re-rendering. */
export interface DragPreviewHandle {
    element: HTMLDivElement | null;
    rafId: number | null;
}

const WIDTH = 105;
const HEIGHT = 153;

/** CSS transform that centres the preview on the pointer. */
export const dragPreviewTransform = (x: number, y: number) =>
    `translate3d(${x - WIDTH / 2}px, ${y - HEIGHT / 2}px, 0)`;

interface DragPreviewProps {
    card: Card;
    /** Pointer position when the drag started; later moves are applied imperatively. */
    x: number;
    y: number;
    previewRef: RefObject<DragPreviewHandle>;
}

export default function DragPreview({ card, x, y, previewRef }: DragPreviewProps) {
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
                width: `${WIDTH}px`,
                height: `${HEIGHT}px`,
                pointerEvents: 'none',
                zIndex: 9999,
                transform: dragPreviewTransform(x, y),
                willChange: 'transform',
            }}
            className="opacity-100 transition-none"
        >
            <img
                src={card.card_images[0]?.image_url}
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
