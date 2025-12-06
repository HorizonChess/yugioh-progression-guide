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
                <div className="w-full h-[60%] bg-black/20 rounded border-2 border-dashed border-[#8b7355]/30 mb-4 flex items-center justify-center">
                    <span className="text-[#8b7355]/50 font-bold text-xs">No Card Selected</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-[#1a120b] border-r-2 border-[#8b7355] flex flex-col overflow-hidden gap-1 p-1">
            {/* 
               Image Container:
               - flex-[2]: 2/3 of available height (approx 66%).
               - relative/w-full: Container scaling.
               - object-contain: Fit within container.
            */}
            <div className="flex-[2] relative min-h-0 w-full">
                <Image
                    src={card.card_images[0].image_url}
                    alt={card.name}
                    fill
                    className="object-contain"
                    priority
                />
            </div>

            {/* Description - flex-[1] (approx 33%) */}
            <div className="flex-1 bg-[#f0e6d2] text-black p-2 overflow-y-auto custom-scrollbar font-serif leading-tight text-sm shadow-inner min-h-[0] border-2 border-[#8b7355] rounded">
                <p className="font-bold border-b border-[#8b7355]/50 mb-1 pb-1">{card.name}</p>
                {card.type.includes("Monster") && (
                    <div className="text-xs text-gray-700 mb-1 font-bold">
                        [{card.race} / {card.type.split(" ").pop()}]
                        {card.atk !== undefined && ` ATK/${card.atk}`}
                        {card.def !== undefined && ` DEF/${card.def}`}
                    </div>
                )}
                <p className="whitespace-pre-wrap">{card.desc}</p>
            </div>
        </div>
    );
}
