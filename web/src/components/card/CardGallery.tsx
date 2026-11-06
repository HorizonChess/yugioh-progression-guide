"use client";

import { useRef, useState, type ReactNode } from "react";
import type { Card } from "@/lib/api";
import type { Tier } from "@/components/packs/stage/fx";
import { TIER_LABEL, type StageCard } from "@/components/packs/stage/plate";
import { CardCloseUp, useCardPeek } from "@/components/card/CardPlate";
import { MarkToggle } from "@/components/card/LookLater";

export type GalleryItem = { key: string; card: StageCard; count: number; isNew?: boolean; dim?: boolean };

const TIERS: Tier[] = ["Secret", "Ultra", "Super", "Rare", "Common"];

/** Groups items by reveal tier, best first. */
export function byTier(items: GalleryItem[]) {
    return TIERS.map((tier) => ({ tier, items: items.filter((i) => i.card.tier === tier) })).filter((s) => s.items.length);
}

/**
 * Cards laid out under gold rarity bands, like the opener's world: rares glow in
 * their colour, duplicates carry a count, new ones a ribbon. Hover (mouse) shows a
 * card's plate beside it; a tap opens the close-up.
 */
export default function CardGallery({
    items,
    empty,
    countCopies = true,
    onOpen,
    flat = false,
    onLook,
}: {
    items: GalleryItem[];
    empty?: ReactNode;
    /** Bands count copies (a haul) rather than cards (a list). */
    countCopies?: boolean;
    /** A tap hands the card here (a picker's own close-up) instead of the plain close-up. */
    onOpen?: (item: GalleryItem) => void;
    /** One grid in the given order, without the rarity bands (search results). */
    flat?: boolean;
    /** The player is looking at a card: opened it, or rested the mouse on it a moment. Yugi may have a word on it. */
    onLook?: (card: Card) => void;
}) {
    const { bind, peek, hide } = useCardPeek();
    const [open, setOpen] = useState<StageCard | null>(null);
    // A look on desktop is the mouse resting on a card, not sweeping across the grid.
    const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const look = (card: StageCard) => {
        const peek = bind(card);
        return {
            onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
                peek.onPointerEnter(e);
                clearTimeout(dwell.current);
                if (onLook && e.pointerType === "mouse") dwell.current = setTimeout(() => onLook(card.card), 900);
            },
            onPointerLeave: () => {
                peek.onPointerLeave();
                clearTimeout(dwell.current);
            },
        };
    };
    const sections = flat ? (items.length ? [{ tier: null, items }] : []) : byTier(items);
    if (!sections.length) return <>{empty}</>;
    return (
        <div className="gallery">
            {sections.map(({ tier, items: list }) => (
                <section key={tier ?? "all"} className="gallery__section" data-tier={tier ?? undefined}>
                    {tier && (
                        <h2 className="gallery__band">
                            <span>{TIER_LABEL[tier]}</span>
                            <small>{countCopies ? list.reduce((n, i) => n + i.count, 0) : list.length}</small>
                        </h2>
                    )}
                    <div className="gallery__grid">
                        {list.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className={`gallery__tile ${item.dim ? "gallery__tile--dim" : ""}`}
                                data-tier={item.card.tier}
                                onClick={() => {
                                    hide();
                                    clearTimeout(dwell.current);
                                    onLook?.(item.card.card);
                                    if (onOpen) onOpen(item);
                                    else setOpen(item.card);
                                }}
                                {...look(item.card)}
                            >
                                <span className="gallery__art">
                                    <img src={item.card.card.card_images[0]?.image_url_small ?? item.card.image} alt={item.card.card.name} loading="lazy" decoding="async" />
                                    {item.isNew && <span className="gallery__new">New</span>}
                                    {item.count > 1 && <span className="gallery__count">×{item.count}</span>}
                                </span>
                                <span className="gallery__name">{item.card.card.name}</span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
            {peek}
            {open && <CardCloseUp card={open} action={<MarkToggle cardId={open.card.id} />} onClose={() => setOpen(null)} />}
        </div>
    );
}
