
import { Card } from "@/lib/api";
import { useEffect } from "react";

interface CardDetailModalProps {
    card: Card;
    onClose: () => void;
}

export default function CardDetailModal({ card, onClose }: CardDetailModalProps) {
    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Prevent scrolling when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="relative w-full max-w-4xl bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-black/50 rounded-full text-white hover:bg-white/20 transition-colors"
                >
                    ✕
                </button>

                {/* Left: Card Image */}
                <div className="w-full md:w-1/2 bg-black/50 p-8 flex items-center justify-center">
                    <img
                        src={card.card_images[0].image_url}
                        alt={card.name}
                        className="max-w-full max-h-[60vh] object-contain drop-shadow-2xl"
                    />
                </div>

                {/* Right: Details */}
                <div className="w-full md:w-1/2 p-8 flex flex-col overflow-y-auto max-h-[60vh] md:max-h-auto">
                    <div className="mb-6">
                        <h2 className="text-3xl font-bold text-white mb-2">{card.name}</h2>
                        <div className="flex flex-wrap gap-2 text-sm font-bold uppercase tracking-wider">
                            {card.attribute && (
                                <span className="px-3 py-1 bg-purple-900/50 text-purple-200 border border-purple-500/30 rounded">
                                    {card.attribute}
                                </span>
                            )}
                            {card.level && (
                                <span className="px-3 py-1 bg-yellow-900/50 text-yellow-200 border border-yellow-500/30 rounded flex items-center gap-1">
                                    ★ {card.level}
                                </span>
                            )}
                            <span className="px-3 py-1 bg-blue-900/50 text-blue-200 border border-blue-500/30 rounded">
                                {card.race}
                            </span>
                            <span className="px-3 py-1 bg-gray-800 text-gray-300 border border-gray-600 rounded">
                                {card.type}
                            </span>
                        </div>
                    </div>

                    {/* Stats Row */}
                    {(card.atk !== undefined || card.def !== undefined) && (
                        <div className="flex items-center gap-8 mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                            {card.atk !== undefined && (
                                <div className="flex flex-col">
                                    <span className="text-xs text-gray-400 uppercase font-bold">ATK</span>
                                    <span className="text-2xl font-mono font-bold text-red-400">{card.atk}</span>
                                </div>
                            )}
                            {card.def !== undefined && (
                                <div className="flex flex-col">
                                    <span className="text-xs text-gray-400 uppercase font-bold">DEF</span>
                                    <span className="text-2xl font-mono font-bold text-blue-400">{card.def}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Description */}
                    <div className="flex-1">
                        <h3 className="text-sm font-bold text-gray-400 uppercase mb-2">Description</h3>
                        <div className="p-4 bg-[#111] rounded-lg border border-white/10 text-gray-300 leading-relaxed font-serif text-sm md:text-base">
                            {card.desc}
                        </div>
                    </div>

                    {/* Footer Info */}
                    <div className="mt-6 pt-6 border-t border-white/10 text-xs text-gray-500 flex justify-between">
                        <span>ID: {card.id}</span>
                        {card.archetype && <span>Archetype: {card.archetype}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
