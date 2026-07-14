"use client";

import { CardSet } from "@/lib/api";
import QuantitySelector from "@/components/ui/QuantitySelector.view";

/**
 * The pack STORE (default /packs state): pack art on the left (click to view the
 * full card list), set info + a quantity selector on the right. Fits the viewport
 * — no page scroll.
 */
export default function StoreView({
    set,
    cardCount,
    isLocked,
    quantity,
    setQuantity,
    onOpen,
    onViewDetails,
    onBack,
}: {
    set: CardSet;
    cardCount: number;
    isLocked: boolean;
    quantity: number;
    setQuantity: (n: number) => void;
    onOpen: () => void;
    onViewDetails: () => void;
    onBack: () => void;
}) {
    return (
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center mx-auto">
            {/* Pack art — click to view the full set list */}
            <div className="relative group perspective-1000 cursor-pointer" onClick={onViewDetails}>
                <div className="absolute inset-0 bg-primary opacity-20 blur-[60px] animate-pulse" />
                <div className="relative transform transition-transform duration-500 hover:rotate-y-12 hover:rotate-x-12 transform-style-3d">
                    {set.set_image ? (
                        <img
                            src={set.set_image}
                            alt={set.set_name}
                            className="w-full max-w-[280px] mx-auto rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
                            onError={(e) => {
                                if (set.original_image && e.currentTarget.src !== set.original_image) {
                                    e.currentTarget.src = set.original_image;
                                }
                            }}
                        />
                    ) : (
                        <div className="w-full max-w-[280px] mx-auto aspect-[2/3] bg-gray-800 rounded-xl flex items-center justify-center border border-white/10">
                            <span className="text-gray-500">No Pack Art</span>
                        </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white font-bold uppercase tracking-widest border-2 border-white px-4 py-2 rounded-lg bg-black/60 shadow-lg">
                            View Details
                        </span>
                    </div>
                </div>
            </div>

            {/* Set info + open controls */}
            <div className="space-y-8">
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <button onClick={onBack} className="text-gray-500 hover:text-white flex items-center gap-2 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Map
                        </button>
                    </div>
                    <h1 className="text-5xl font-black text-white mb-2 leading-tight">{set.set_name}</h1>
                    <p className="text-xl text-primary font-bold">{cardCount} Cards in Set</p>
                    <p className="text-gray-400 mt-2">Released: {set.tcg_date}</p>
                    {isLocked && (
                        <div className="mt-2 inline-block px-3 py-1 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs font-bold tracking-widest uppercase">
                            Locked Set
                        </div>
                    )}
                </div>

                {isLocked ? (
                    <div className="p-6 stone-panel text-center">
                        <p className="text-gray-400 mb-6">You must complete previous sets to unlock pack opening for this set.</p>
                        <button
                            onClick={onViewDetails}
                            className="w-full px-6 py-4 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View Card List
                        </button>
                    </div>
                ) : (
                    <div className="p-6 stone-panel">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-4 drop-shadow-md">Select Quantity</h3>
                        <QuantitySelector quantity={quantity} setQuantity={setQuantity} onOpen={onOpen} />
                    </div>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p>Cards are automatically added to your collection.</p>
                </div>
            </div>
        </div>
    );
}
