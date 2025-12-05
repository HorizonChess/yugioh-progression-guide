"use client";

import { Card } from "@/lib/api";
import Image from "next/image";

interface CardInfoPanelProps {
    card: Card | null;
}

export default function CardInfoPanel({ card }: CardInfoPanelProps) {
    if (!card) {
        return (
            <div className="h-full bg-[#1a120b] border-r-2 border-[#8b7355] p-4 flex flex-col items-center justify-center text-center">
                <div className="w-full aspect-[2/3] bg-black/20 rounded-lg border-2 border-dashed border-[#8b7355]/30 mb-4 flex items-center justify-center">
                    <span className="text-[#8b7355]/50 font-bold">No Card Selected</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-[#1a120b] border-r-2 border-[#8b7355] p-3 flex flex-col overflow-y-auto custom-scrollbar">
            {/* Card Image */}
            <div className="relative w-full aspect-[2/3] mb-4 shadow-xl shrink-0">
                <Image
                    src={card.card_images[0].image_url}
                    alt={card.name}
                    fill
                    className="object-contain"
                    priority
                />
            </div>

            {/* Card Details */}
            <div className="space-y-3 text-white">
                <div className="border border-[#8b7355]/50 bg-black/40 p-2 rounded">
                    <p className="font-bold text-lg leading-tight text-[#d4af37]">{card.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-black/40 p-1.5 rounded border border-gray-800">
                        <span className="block text-gray-500 text-[10px]">Type</span>
                        <span className="font-bold">{card.type}</span>
                    </div>
                    {card.attribute && (
                        <div className="bg-black/40 p-1.5 rounded border border-gray-800">
                            <span className="block text-gray-500 text-[10px]">Attribute</span>
                            <span className="font-bold">{card.attribute}</span>
                        </div>
                    )}
                    {(card.level || (card as any).rank) && (
                        <div className="bg-black/40 p-1.5 rounded border border-gray-800">
                            <span className="block text-gray-500 text-[10px]">Level/Rank</span>
                            <span className="font-bold">{card.level || (card as any).rank}</span>
                        </div>
                    )}
                    {card.race && (
                        <div className="bg-black/40 p-1.5 rounded border border-gray-800">
                            <span className="block text-gray-500 text-[10px]">Race</span>
                            <span className="font-bold">{card.race}</span>
                        </div>
                    )}
                </div>

                {card.atk !== undefined && (
                    <div className="flex gap-2 text-xs">
                        <div className="flex-1 bg-black/40 p-1.5 rounded border border-gray-800">
                            <span className="block text-gray-500 text-[10px]">ATK</span>
                            <span className="font-bold">{card.atk}</span>
                        </div>
                        {card.def !== undefined && (
                            <div className="flex-1 bg-black/40 p-1.5 rounded border border-gray-800">
                                <span className="block text-gray-500 text-[10px]">DEF</span>
                                <span className="font-bold">{card.def}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Description */}
                <div className="bg-black/40 p-2 rounded border border-gray-800 min-h-[100px]">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-gray-300">
                        {card.desc}
                    </p>
                </div>
            </div>
        </div>
    );
}
