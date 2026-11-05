"use client";

import { useState, type ReactNode } from "react";
import type { Tier } from "@/components/packs/stage/fx";
import { TIER_LABEL, type StageCard } from "@/components/packs/stage/plate";
import { CardCloseUp, useCardPeek } from "@/components/card/CardPlate";

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
export default function CardGallery({ items, empty, countCopies = true }: { items: GalleryItem[]; empty?: ReactNode; /** Bands count copies (a haul) rather than cards (a list). */ countCopies?: boolean }) {
    const { bind, peek, hide } = useCardPeek();
    const [open, setOpen] = useState<StageCard | null>(null);
    const sections = byTier(items);
    if (!sections.length) return <>{empty}</>;
    return (
        <div className="gallery">
            {sections.map(({ tier, items: list }) => (
                <section key={tier} className="gallery__section" data-tier={tier}>
                    <h2 className="gallery__band">
                        <span>{TIER_LABEL[tier]}</span>
                        <small>{countCopies ? list.reduce((n, i) => n + i.count, 0) : list.length}</small>
                    </h2>
                    <div className="gallery__grid">
                        {list.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className={`gallery__tile ${item.dim ? "gallery__tile--dim" : ""}`}
                                data-tier={tier}
                                onClick={() => {
                                    hide();
                                    setOpen(item.card);
                                }}
                                {...bind(item.card)}
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
            {open && <CardCloseUp card={open} onClose={() => setOpen(null)} />}
        </div>
    );
}
