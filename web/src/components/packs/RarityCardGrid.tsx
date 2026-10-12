import React from 'react';
import Image from 'next/image';
import StonePanel from '@/components/ui/StonePanel';
import { Card } from '@/lib/api';

interface RarityCardGridProps {
    cardsByRarity: Record<string, { card: Card; count?: number }[]>;
    sortedRarities: string[];
    onCardClick: (card: Card) => void;
    onHover: (card: Card, e: React.MouseEvent) => void;
    onLeave: () => void;
    /** When set, the card with this id gets a selected highlight (wildcard pick). */
    selectedCardId?: number;
}

export default function RarityCardGrid({
    cardsByRarity,
    sortedRarities,
    onCardClick,
    onHover,
    onLeave,
    selectedCardId,
}: RarityCardGridProps) {
    return (
        <div className="space-y-8">
            {sortedRarities.map(rarity => (
                <StonePanel key={rarity} title={rarity}>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
                        {cardsByRarity[rarity].map((item, idx) => {
                            const { card, count } = item;
                            const isSelected = selectedCardId === card.id;
                            return (
                                <div
                                    key={`${card.id}-${idx}`}
                                    className="flex flex-col group cursor-pointer"
                                    onClick={() => onCardClick(card)}
                                    onMouseEnter={(e) => onHover(card, e)}
                                    onMouseLeave={onLeave}
                                >
                                    <div className={`relative aspect-[2/3] mb-2 transition-transform duration-200 ${isSelected ? "scale-105" : "hover:scale-105"}`}>
                                        <div className={`absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border transition-colors ${isSelected ? "border-[var(--primary)] ring-2 ring-[var(--primary)] shadow-[0_0_18px_var(--primary)]" : "border-white/10 group-hover:border-[var(--primary)]/50"}`}>
                                            <Image
                                                src={card.card_images[0].image_url_small}
                                                alt={card.name}
                                                fill
                                                sizes="(max-width: 640px) 25vw, (max-width: 768px) 20vw, (max-width: 1024px) 16vw, (max-width: 1280px) 12vw, 11vw"
                                                className="object-cover"
                                                style={{ transform: 'translateZ(0)' }}
                                                loading="lazy"
                                            />
                                            {/* Quantity Badge */}
                                            {count !== undefined && count > 1 && (
                                                <div className="absolute top-1 right-1 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center border border-primary shadow-md z-10">
                                                    <span className="text-xs font-bold text-primary">
                                                        {count}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Name below card */}
                                    <div className="text-center px-1">
                                        <div className="text-[10px] md:text-xs font-bold text-white leading-tight line-clamp-2 h-8 group-hover:text-primary transition-colors">
                                            {card.name}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </StonePanel>
            ))}
        </div>
    );
}
