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
        <main className="min-h-screen bg-black text-white relative overflow-hidden font-sans selection:bg-[var(--primary)] selection:text-black">
            {/* Background Texture - Full Screen */}
            <div className="fixed inset-0 z-0 opacity-50" style={{
                backgroundImage: "url('/bg-stone.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            }}></div>
            <div className="fixed inset-0 bg-black/60 z-0"></div> {/* Overlay for readability */}

            {/* Top Bar */}
            <div className="relative z-40">
                <TopBar />
            </div>

            {/* Prepare Your Deck Button - Top Center (Floating) */}
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-top-10 duration-700">
                <button className="px-8 py-3 bg-blue-600/20 border border-blue-500/50 text-blue-300 font-bold rounded-full hover:bg-blue-600/40 transition-all uppercase tracking-wider text-sm backdrop-blur-md shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:scale-105">
                    Prepare Your Deck
                </button>
            </div>

            {/* Main Content Area - Vertically Centered */}
            <div className="fixed inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                <div className="w-full flex flex-col items-center gap-10 pointer-events-auto">

                    {/* Timeline Section */}
                    <div className="w-full relative">
                        {/* Scroll Controls */}
                        <button
                            onClick={() => scroll('left')}
                            className="absolute left-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-black/50 border-2 border-[var(--primary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-black transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            className="absolute right-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-black/50 border-2 border-[var(--primary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-black transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>

                        {/* Horizontal Scroll Area */}
                        <div
                            ref={scrollContainerRef}
                            className="w-full overflow-x-auto hide-scrollbar flex items-center px-[50vw] py-12 relative z-10"
                        >
                            {sets.map((set, idx) => {
                                const isCurrent = idx === currentSetIndex;
                                const match = matchHistory.find(m => m.packName === set.set_name);

                                return (
                                    <div key={`${set.set_code}-${idx}`} className="flex items-center">
                                        {/* Chain Connector */}
                                        {idx > 0 && (
                                            <div className="flex-shrink-0 -mx-4 z-0">
                                                <ChainConnector active={idx <= currentSetIndex} />
                                            </div>
                                        )}

                                        <div
                                            id={`set-${idx}`}
                                            className={`relative flex-shrink-0 w-48 flex flex-col items-center gap-6 transition-all duration-500 z-10 ${isCurrent ? 'scale-125 z-20' : 'scale-90 opacity-60 hover:opacity-100 hover:scale-95 grayscale hover:grayscale-0'}`}
                                        >
                                            {/* Pack Art Container */}
                                            <Link href={`/packs?set=${idx}`} className={`relative block w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl transition-all duration-300 bg-black ${isCurrent ? 'ring-4 ring-[var(--primary)] shadow-[0_0_50px_rgba(212,175,55,0.5)]' : 'hover:ring-2 hover:ring-gray-500'}`}>
                                                {set.set_image ? (
                                                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                                        <img
                                                            src={set.set_image}
                                                            alt={set.set_name}
                                                            className="w-full h-full object-fill transform hover:scale-110 transition-transform duration-700"
                                                            loading="lazy"
                                                            style={{ imageRendering: 'auto' }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs text-gray-500">No Image</div>
                                                )}

                                                {/* Status Overlay */}
                                                {match && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                                                        <span className={`text-2xl font-black uppercase -rotate-12 border-4 px-4 py-2 rounded-xl shadow-xl ${match.winner === 'player' ? 'text-green-400 border-green-500 bg-green-900/50' : 'text-red-500 border-red-500 bg-red-900/50'}`}>
                                                            {match.winner === 'player' ? 'WON' : 'LOST'}
                                                        </span>
                                                    </div>
                                                )}
                                            </Link>

                                            {/* Info */}
                                            <div className="text-center">
                                                <h3 className={`font-bold text-sm mb-1 truncate w-64 ${isCurrent ? 'text-white text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-gray-500'}`}>
                                                    {set.set_name}
                                                </h3>
                                                {!isCurrent && (
                                                    <span className="text-xs text-gray-600 font-mono tracking-widest">{set.tcg_date}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-8 z-40">
                        <Link
                            href={`/packs?set=${currentSetIndex}`}
                            className="group relative px-10 py-4 bg-[var(--primary)] text-black font-black rounded-full overflow-hidden shadow-[0_0_30px_rgba(212,175,55,0.4)] hover:shadow-[0_0_50px_rgba(212,175,55,0.6)] transition-all hover:scale-105"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <span className="relative text-xl tracking-wider">OPEN PACKS</span>
                        </Link>
                        <Link
                            href="/timeline"
                            className="group relative px-10 py-4 bg-gray-900 text-white font-bold rounded-full overflow-hidden border border-gray-600 hover:border-white/50 shadow-lg transition-all hover:scale-105"
                        >
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <span className="relative text-xl tracking-wider">RECORD MATCH</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Bottom HUD - Floating Stats & Bonus Button */}
            <div className="fixed bottom-8 left-0 right-0 z-30 flex justify-center items-end pointer-events-none">
                <div className="flex items-center gap-6 pointer-events-auto animate-in slide-in-from-bottom-10 duration-700">

                    {/* Stats Box */}
                    <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-8 py-4 flex gap-12 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-green-400 uppercase tracking-[0.2em] font-bold mb-1">Wins</span>
                            <span className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(34,197,94,0.6)]">{wins}</span>
                        </div>
                        <div className="w-px bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-red-500 uppercase tracking-[0.2em] font-bold mb-1">Losses</span>
                            <span className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]">{losses}</span>
                        </div>
                    </div>

                    {/* Bonus Matches Button */}
                    <button className="h-14 px-6 bg-purple-900/40 border border-purple-500/50 text-purple-300 font-bold rounded-xl hover:bg-purple-600/40 transition-all uppercase tracking-wider text-xs backdrop-blur-md shadow-[0_0_20px_rgba(147,51,234,0.2)] hover:shadow-[0_0_30px_rgba(147,51,234,0.4)] hover:-translate-y-1">
                        Bonus Matches
                    </button>
                </div>
            </div>

            {/* Character Sprite - Fixed Bottom Left */}
            <GuideSprite />
        </main>
    );
}
