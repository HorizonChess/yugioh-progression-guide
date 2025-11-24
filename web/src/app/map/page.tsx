"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import GuideSprite from "@/components/GuideSprite";
import TopBar from "@/components/TopBar";

export default function MapPage() {
    const { currentSetIndex, matchHistory, hasLoaded } = useProgression();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
    }, []);

    // Auto-scroll to current set
    useEffect(() => {
        if (!loading && scrollContainerRef.current) {
            const currentElement = document.getElementById(`set-${currentSetIndex}`);
            if (currentElement) {
                currentElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' });
            }
        }
    }, [loading, currentSetIndex]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 400;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    if (!hasLoaded || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="text-2xl font-bold animate-pulse text-[var(--primary)]">LOADING TIMELINE...</div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white flex flex-col overflow-hidden">
            <TopBar />

            {/* Timeline Container */}
            <div className="flex-1 relative flex items-center w-full">

                {/* Background Path Line */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-800 -translate-y-1/2 z-0"></div>
                <div className="absolute top-1/2 left-0 h-1 bg-[var(--primary)] -translate-y-1/2 z-0 transition-all duration-1000"
                    style={{ width: `${(currentSetIndex / Math.max(sets.length - 1, 1)) * 100}%` }}></div>

                {/* Scroll Controls */}
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-4 z-20 w-12 h-12 rounded-full bg-black/50 border border-[var(--primary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-black transition-all"
                >
                    ←
                </button>
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-4 z-20 w-12 h-12 rounded-full bg-black/50 border border-[var(--primary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-black transition-all"
                >
                    →
                </button>

                {/* Horizontal Scroll Area */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-x-auto hide-scrollbar flex items-center gap-16 px-[50vw] py-12 relative z-10"
                >
                    {sets.map((set, idx) => {
                        const isCompleted = idx < currentSetIndex;
                        const isCurrent = idx === currentSetIndex;
                        const isLocked = idx > currentSetIndex;
                        const match = matchHistory.find(m => m.packName === set.set_name);

                        return (
                            <div
                                key={`${set.set_code}-${idx}`}
                                id={`set-${idx}`}
                                className={`relative flex-shrink-0 w-40 flex flex-col items-center gap-4 transition-all duration-500 ${isCurrent ? 'scale-110' : 'scale-90 opacity-80 hover:opacity-100 hover:scale-95'}`}
                            >
                                {/* Node Connector Dot */}
                                <div className={`w-4 h-4 rounded-full mb-2 ${isCompleted || isCurrent ? 'bg-[var(--primary)] shadow-[0_0_10px_var(--primary)]' : 'bg-gray-800'}`}></div>

                                {/* Pack Art Container */}
                                <Link href={isLocked ? '#' : `/packs?set=${idx}`} className={`relative block w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isCurrent ? 'ring-4 ring-[var(--primary)] shadow-[0_0_30px_rgba(212,175,55,0.3)]' : 'hover:ring-2 hover:ring-gray-500'}`}>
                                    {set.set_image ? (
                                        <div className="w-full h-full flex items-center justify-center overflow-hidden bg-black/30">
                                            <img
                                                src={set.set_image}
                                                alt={set.set_name}
                                                className="w-full h-full object-fill"
                                                loading="lazy"
                                                style={{ imageRendering: 'auto' }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs">No Image</div>
                                    )}

                                    {/* Status Overlay - Only if match recorded */}
                                    {match && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                                            <span className={`text-xl font-black uppercase -rotate-12 border-2 px-2 py-1 rounded ${match.winner === 'player' ? 'text-green-500 border-green-500' : 'text-red-500 border-red-500'}`}>
                                                {match.winner === 'player' ? 'CLEARED' : 'FAILED'}
                                            </span>
                                        </div>
                                    )}
                                </Link>

                                {/* Info */}
                                <div className="text-center">
                                    <h3 className={`font-bold text-sm mb-1 truncate w-64 ${isCurrent ? 'text-white' : 'text-gray-500'}`}>
                                        {set.set_name}
                                    </h3>

                                    {isCurrent ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <Link
                                                href={`/packs?set=${idx}`}
                                                className="inline-flex items-center gap-2 px-6 py-2 bg-[var(--primary)] text-black font-black rounded-full hover:bg-[#f5c542] transition-transform hover:scale-105 shadow-lg mt-2"
                                            >
                                                OPEN PACKS
                                            </Link>
                                            <Link
                                                href="/timeline"
                                                className="inline-flex items-center gap-2 px-6 py-2 bg-gray-800 text-white font-bold rounded-full hover:bg-gray-700 transition-transform hover:scale-105 shadow-lg border border-gray-600"
                                            >
                                                RECORD MATCH
                                            </Link>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-600 font-mono">{set.tcg_date}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div >
            </div >

            <GuideSprite />
        </main >
    );
}
