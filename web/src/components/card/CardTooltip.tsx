"use client";

import { Card } from "@/lib/api";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import Image from "next/image";
import { asset } from '@/lib/utils';

interface CardTooltipProps {
    card: Card;
    x: number;
    y: number;
}

export default function CardTooltip({ card, x, y }: CardTooltipProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    // Calculate position to keep tooltip on screen
    // Default to right of cursor, but flip to left if near edge
    const isRightSide = x > window.innerWidth / 2;
    const isBottomSide = y > window.innerHeight / 2;

    const style: React.CSSProperties = {
        position: 'fixed',
        top: y,
        left: x,
        transform: `translate(${isRightSide ? '-100%' : '0'}, ${isBottomSide ? '-100%' : '0'})`,
        marginLeft: isRightSide ? '-20px' : '20px',
        marginTop: isBottomSide ? '-20px' : '20px',
        zIndex: 9999,
        pointerEvents: 'none' // Important so it doesn't interfere with hovering
    };

    // Helper to get icon path
    const getAttributeIcon = (attr: string) => asset(`/ui/icons/${attr}.svg`);
    const getSpellTrapIcon = (race: string) => {
        const raceMap: Record<string, string> = {
            'Continuous': 'Continuous',
            'Equip': 'Equip',
            'Quick-Play': 'Quick-Play',
            'Counter': 'Counter',
            'Field': 'Field',
            'Ritual': 'Ritual'
        };
        return raceMap[race] ? asset(`/ui/icons/${raceMap[race]}.svg`) : null;
    };

    return createPortal(
        <div style={style} className="w-[600px] stone-panel p-4 text-white animate-in fade-in duration-75 z-[9999] flex gap-4">
            {/* Left Side: Card Image */}
            <div className="w-[180px] shrink-0">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-lg border border-white/20">
                    <Image
                        src={card.card_images[0].image_url_small}
                        alt={card.name}
                        fill
                        className="object-cover"
                        sizes="200px"
                        quality={100}
                        priority
                    />
                </div>
            </div>

            {/* Right Side: Details */}
            <div className="flex-1 min-w-0">
                {/* Header: Name */}
                <div className="mb-3 border-b border-white/20 pb-2">
                    <h3 className="text-xl font-bold text-white leading-tight drop-shadow-md">{card.name}</h3>
                </div>

                {/* Card Details Grid */}
                <div className="flex flex-col gap-1.5 mb-3">
                    {/* Row 1: Level/Rank/Link & Attribute/Type */}
                    <div className="flex items-center gap-6">
                        {/* Level / Rank / Link Rating */}
                        {card.level && (
                            <div className="flex items-center gap-2">
                                <div className="relative w-5 h-5">
                                    <Image
                                        src={asset("/ui/icons/Star.svg")}
                                        alt="Level"
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                                <span className="text-base font-bold text-white drop-shadow-md">
                                    Level {card.level}
                                </span>
                            </div>
                        )}

                        {/* Attribute (Monster) or Type (Spell/Trap) */}
                        {card.attribute ? (
                            <div className="flex items-center gap-2">
                                <div className="relative w-5 h-5 shrink-0 rounded-full overflow-hidden border border-white/20 shadow-sm">
                                    <Image
                                        src={getAttributeIcon(card.attribute)}
                                        alt={card.attribute}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                                <span className="text-base font-bold text-white drop-shadow-md">
                                    {card.attribute}
                                </span>
                            </div>
                        ) : (
                            // Spell/Trap Property Icon
                            getSpellTrapIcon(card.race) && (
                                <div className="flex items-center gap-2">
                                    <div className="relative w-5 h-5">
                                        <Image
                                            src={getSpellTrapIcon(card.race)!}
                                            alt={card.race}
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    <span className="text-base font-bold text-white drop-shadow-md">
                                        {card.race}
                                    </span>
                                </div>
                            )
                        )}
                    </div>

                    {/* Row 2: Type / Race */}
                    <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-primary drop-shadow-sm">
                            {[card.race, card.type].filter(Boolean).join(" / ")}
                        </span>
                    </div>

                    {/* Row 3: Stats (ATK/DEF) or Link Rating */}
                    <div className="flex items-center gap-6 mt-0.5">
                        {card.atk !== undefined && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">ATK</span>
                                <span className="text-base font-mono font-bold text-white drop-shadow-md">{card.atk}</span>
                            </div>
                        )}
                        {card.def !== undefined && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">DEF</span>
                                <span className="text-base font-mono font-bold text-white drop-shadow-md">{card.def}</span>
                            </div>
                        )}
                        {card.linkval !== undefined && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">LINK</span>
                                <span className="text-base font-mono font-bold text-white drop-shadow-md">{card.linkval}</span>
                            </div>
                        )}
                        {card.scale !== undefined && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Scale</span>
                                <span className="text-base font-mono font-bold text-white drop-shadow-md">{card.scale}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Description */}
                <div className="text-sm text-gray-100 font-serif leading-relaxed opacity-100 line-clamp-[12] whitespace-pre-wrap border-t border-white/10 pt-2">
                    {card.desc}
                </div>

                {card.archetype && (
                    <div className="mt-1.5 text-xs text-gray-400 italic text-right">
                        {card.archetype}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
