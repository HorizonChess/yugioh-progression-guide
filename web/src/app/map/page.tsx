"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import GuideSprite from "@/components/GuideSprite";
import TopBar from "@/components/TopBar";
import ChainConnector from "@/components/ChainConnector";

export default function MapPage() {
    const { currentSetIndex, matchHistory, hasLoaded } = useProgression();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Calculate Stats
    const wins = matchHistory.filter(m => m.winner === 'player').length;
    const losses = matchHistory.filter(m => m.winner === 'opponent').length;

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
        <main className="min-h-screen bg-black text-white flex flex-col overflow-hidden relative">
            {/* Background Texture */}
            <div className="absolute inset-0 z-0 opacity-50" style={{
                backgroundImage: "url('/bg-stone.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            }}></div>
            <div className="absolute inset-0 bg-black/60 z-0"></div> {/* Overlay for readability */}

            <div className="relative z-10 flex flex-col h-full">
                <TopBar />

                {/* Stats Counter Overlay */}
                <div className="absolute bottom-8 right-8 z-30 flex gap-4 animate-in slide-in-from-right duration-700">
                    <div className="bg-black/80 backdrop-blur-md border border-green-500/30 px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                        <span className="text-xs text-gray-400 uppercase tracking-wider block">Wins</span>
                        <span className="text-2xl font-black text-green-500">{wins}</span>
                    </div>
                    <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                        <span className="text-xs text-gray-400 uppercase tracking-wider block">Losses</span>
                        <span className="text-2xl font-black text-red-500">{losses}</span>
                    </div>
                </div>

                {/* Timeline Container */}
                <div className="flex-1 relative flex items-center w-full">

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
                        className="flex-1 overflow-x-auto hide-scrollbar flex items-center px-[50vw] py-12 relative z-10"
                    >
                        {sets.map((set, idx) => {
                            const isCompleted = idx < currentSetIndex;
                            const isCurrent = idx === currentSetIndex;
                            const isLocked = idx > currentSetIndex;
                            const match = matchHistory.find(m => m.packName === set.set_name);

                            return (
                                <div key={`${set.set_code}-${idx}`} className="flex items-center">
                                    {/* Chain Connector (Before item, except first) */}
                                    {idx > 0 && (
                                        <div className="flex-shrink-0 -mx-4 z-0">
                                            <ChainConnector active={idx <= currentSetIndex} />
                                        </div>
                                    )}

                                    <div
                                        id={`set-${idx}`}
                                        className={`relative flex-shrink-0 w-40 flex flex-col items-center gap-4 transition-all duration-500 z-10 ${isCurrent ? 'scale-110' : 'scale-90 opacity-80 hover:opacity-100 hover:scale-95'}`}
                                    >
                                        {/* Pack Art Container */}
                                        <Link href={`/packs?set=${idx}`} className={`relative block w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isCurrent ? 'ring-4 ring-[var(--primary)] shadow-[0_0_30px_rgba(212,175,55,0.3)]' : 'hover:ring-2 hover:ring-gray-500'}`}>
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
                                                        {match.winner === 'player' ? 'WON' : 'LOST'}
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
                                </div>
                            );
                        })}
                    </div>
                </div>

                <GuideSprite />
            </div>
        </main>
    );
}
