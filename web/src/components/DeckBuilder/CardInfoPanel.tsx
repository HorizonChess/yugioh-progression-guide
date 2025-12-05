"use client";

import { Card } from "@/lib/api";
import Image from "next/image";

interface CardInfoPanelProps {
    card: Card | null;
}

export default function CardInfoPanel({ card }: CardInfoPanelProps) {
    if (!card) {
        return (
            <div className="h-full bg-[#1a120b] border-r-2 border-[#8b7355] p-2 flex flex-col items-center justify-center text-center">
                <div className="w-full aspect-[2/3] bg-black/20 rounded border-2 border-dashed border-[#8b7355]/30 mb-4 flex items-center justify-center">
                    <span className="text-[#8b7355]/50 font-bold text-xs">No Card</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-[#1a120b] border-r-2 border-[#8b7355] p-2 flex flex-col gap-2 overflow-hidden">
            {/* Card Image - Maximized */}
            <div className="relative w-full aspect-[2/3] shrink-0 border border-black shadow-lg">
                <Image
                    src={card.card_images[0].image_url}
                    alt={card.name}
                    fill
                    className="object-contain" // Use contain to show full art
                    priority
                />
            </div>

            {/* Description Only - Scrollable */}
            <div className="flex-1 bg-[#f0e6d2] text-black border-2 border-[#8b7355] rounded p-2 overflow-y-auto custom-scrollbar font-serif leading-tight text-sm">
                <p className="whitespace-pre-wrap">{card.desc}</p>
            </div>
        </div>
    );
}
