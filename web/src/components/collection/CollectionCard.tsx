"use client";

import Image from "next/image";
import { Card } from "@/lib/api";

/**
 * One owned card in the collection grid: art (2:3), an owned-count badge,
 * the name, and the rarity label. Clicking opens the detail modal; hovering
 * raises the tooltip.
 */
export default function CollectionCard({
    card,
    count,
    rarity,
    onSelect,
    onHover,
    onLeave,
}: {
    card: Card;
    count: number;
    rarity: string;
    onSelect: () => void;
    onHover: (e: React.MouseEvent) => void;
    onLeave: () => void;
}) {
    return (
        <div
            className="flex flex-col group cursor-pointer"
            onClick={onSelect}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
        >
            <div className="relative aspect-[2/3] mb-2 hover:scale-105 transition-transform duration-200">
                <div className="collection-card__frame">
                    <Image
                        src={card.card_images[0].image_url_small}
                        alt={card.name}
                        fill
                        sizes="(max-width: 640px) 25vw, (max-width: 768px) 20vw, (max-width: 1024px) 16vw, (max-width: 1280px) 12vw, 11vw"
                        className="object-cover"
                        loading="lazy"
                    />
                    <div className="collection-card__badge">
                        <span className="text-xs font-bold text-primary">{count}</span>
                    </div>
                </div>
            </div>

            <div className="text-center px-1">
                <div className="collection-card__name">{card.name}</div>
                <div className="collection-card__rarity">{rarity}</div>
            </div>
        </div>
    );
}
