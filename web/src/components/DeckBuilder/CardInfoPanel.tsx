"use client";

import { Card } from "@/lib/api";

interface CardInfoPanelProps {
    card: Card | null;
}

export default function CardInfoPanel({ card }: CardInfoPanelProps) {
    if (!card) {
        return (
            <div className="p-2 flex flex-col items-center justify-center text-center">
                <div className="w-full aspect-[59/86] bg-black/20 rounded border-2 border-dashed border-[#8b7355]/30 flex items-center justify-center">
                    <span className="text-[#8b7355]/50 font-bold text-xs">No Card Selected</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden gap-1 p-1">
            {/*
               Image Container:
               - Uses aspect ratio to size correctly without black bars
               - w-full + aspect-[59/86] gives proper card dimensions
            */}
            <div className="w-full shrink-0">
                <img
                    src={card.card_images[0].image_url}
                    alt={card.name}
                    className="w-full h-auto"
                />
            </div>

            {/* Description - fills remaining space */}
            <div className="flex-1 bg-[#f0e6d2] text-black p-2 overflow-y-auto custom-scrollbar font-serif leading-tight text-base shadow-inner min-h-[0] border-2 border-[#8b7355] rounded">
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
