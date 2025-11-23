"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";
import GuideSprite from "@/components/GuideSprite";

export default function MapPage() {
    const { currentSetIndex, matchHistory, hasLoaded } = useProgression();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
    }, []);

    if (!hasLoaded || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="text-2xl font-bold animate-pulse">Loading Map...</div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 p-4">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <h1 className="text-xl font-bold text-[var(--primary)]">DUEL MAP</h1>
                    <div className="flex gap-4 text-sm">
                        <Link href="/collection" className="hover:text-[var(--primary)] transition-colors">Collection</Link>
                        <Link href="/start" className="hover:text-red-500 transition-colors">Exit</Link>
                    </div>
                </div>
            </header>

            {/* Timeline Map */}
            <div className="flex-1 max-w-7xl mx-auto w-full p-8 relative">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {sets.map((set, idx) => {
                        const isCompleted = idx < currentSetIndex;
                        const isCurrent = idx === currentSetIndex;
                        const isLocked = idx > currentSetIndex;

                        const match = matchHistory.find(m => m.packName === set.set_name);

                        return (
                            <div
                                key={`${set.set_code}-${idx}`}
                                className={`relative flex flex-col gap-4 p-6 rounded-3xl border-2 transition-all duration-500 group ${isCurrent
                                    ? 'bg-[var(--primary)]/10 border-[var(--primary)] shadow-[0_0_40px_rgba(212,175,55,0.15)] scale-105 z-10'
                                    : isCompleted
                                        ? 'bg-white/5 border-green-500/30 grayscale hover:grayscale-0'
                                        : 'bg-white/5 border-white/5 opacity-40 grayscale'
                                    }`}
                            >
                                {/* Pack Art */}
                                <div className="relative w-full aspect-[2/3] flex-shrink-0 shadow-2xl transform group-hover:scale-105 transition-transform duration-500 mx-auto">
                                    {set.set_image ? (
                                        <img src={set.set_image} alt={set.set_name} className="w-full h-full object-contain drop-shadow-lg" loading="lazy" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs text-center p-2">No Image</div>
                                    )}

                                    {isCompleted && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded">
                                            <span className={`text-3xl font-black uppercase -rotate-12 border-4 px-2 py-1 rounded ${match?.winner === 'player' ? 'text-green-500 border-green-500' : 'text-red-500 border-red-500'}`}>
                                                {match?.winner === 'player' ? 'CLEARED' : 'FAILED'}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0 flex flex-col items-center text-center">
                                    <div className="flex items-center justify-center gap-4 mb-2">
                                        <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${isCurrent ? 'text-[var(--primary)] border-[var(--primary)]' : 'text-gray-500 border-gray-700'}`}>
                                            {set.tcg_date}
                                        </span>
                                        <span className="text-gray-500 text-xs">{set.num_of_cards} Cards</span>
                                    </div>

                                    <h2 className={`text-2xl font-black mb-4 truncate w-full ${isCurrent ? 'text-white' : 'text-gray-400'}`}>
                                        {set.set_name}
                                    </h2>

                                    <div className="mt-auto w-full">
                                        {isCurrent ? (
                                            <Link
                                                href="/packs"
                                                className="w-full py-3 bg-[var(--primary)] text-black font-black text-lg rounded-xl hover:bg-[#f5c542] transition-all hover:scale-105 shadow-[0_0_20px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2"
                                            >
                                                <span>ENTER DUEL</span>
                                            </Link>
                                        ) : isCompleted ? (
                                            <div className="text-green-500 font-bold flex items-center justify-center gap-2">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                <span>Completed</span>
                                            </div>
                                        ) : (
                                            <div className="text-gray-600 font-bold flex items-center justify-center gap-2">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                <span>Locked</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Background Number */}
                                <div className="absolute right-4 top-4 text-6xl font-black text-white/5 select-none pointer-events-none">
                                    {idx + 1}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <GuideSprite />
        </main>
    );
}
