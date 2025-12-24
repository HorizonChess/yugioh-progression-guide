"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import GuideSprite from "@/components/GuideSprite";
import TopBar from "@/components/TopBar";
import ChainConnector from "@/components/ChainConnector";
import GoldButton from "@/components/GoldButton";
import ScaleWrapper from "@/components/ScaleWrapper";

import { useLayoutDesigner } from "@/hooks/useLayoutDesigner";

export default function MapPage() {
    const { currentSetIndex, matchHistory, hasLoaded } = useProgression();
    const { DesignerOverlay, containerRef } = useLayoutDesigner();
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
            <ScaleWrapper backgroundColor="transparent">
                <div className="h-full w-full flex items-center justify-center bg-black text-white">
                    <div className="text-2xl font-bold animate-pulse text-[var(--primary)]">LOADING TIMELINE...</div>
                </div>
            </ScaleWrapper>
        );
    }

    return (
        <ScaleWrapper backgroundColor="transparent">
            <main ref={containerRef} className="h-full w-full text-white relative overflow-hidden font-sans selection:bg-[var(--primary)] selection:text-black">
                <DesignerOverlay />

                {/* Top Bar */}
                <div className="relative z-40">
                    <TopBar />
                </div>

                {/* Prepare Your Deck Button - Top Center (Floating) */}
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-top-10 duration-700">
                    <GoldButton href="/deck-builder" width="w-72" height="h-16" textSize="text-sm">
                        Prepare Your Deck
                    </GoldButton>
                </div>

                {/* Main Content Area - Vertically Centered */}
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none pb-20">
                    <div className="w-full flex flex-col items-center gap-10 pointer-events-auto">

                        {/* Timeline Section */}
                        <div className="w-full relative">
                            {/* Scroll Controls */}
                            <button
                                onClick={() => scroll('left')}
                                className="absolute left-8 top-1/2 -translate-y-1/2 z-20 w-16 h-16 rounded-full bg-black/50 border-2 border-[var(--primary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-black transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                            >
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button
                                onClick={() => scroll('right')}
                                className="absolute right-8 top-1/2 -translate-y-1/2 z-20 w-16 h-16 rounded-full bg-black/50 border-2 border-[var(--primary)] text-[var(--primary)] flex items-center justify-center hover:bg-[var(--primary)] hover:text-black transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                            >
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
                                                className={`relative flex-shrink-0 w-36 flex flex-col items-center gap-6 transition-all duration-500 z-10 ${isCurrent ? 'scale-125 z-20' : 'scale-90 opacity-60 hover:opacity-100 hover:scale-95 grayscale hover:grayscale-0'}`}
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
                                                    <h3 className={`font-bold text-sm mb-1 truncate w-48 ${isCurrent ? 'text-white text-xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-gray-500'}`}>
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
                    </div>
                </div>

                {/* Action Buttons - Above Stats */}
                <div className="absolute bottom-40 left-0 right-0 z-30 flex justify-center gap-6 pointer-events-auto">
                    <GoldButton href={`/packs?set=${currentSetIndex}`} width="w-64" height="h-16" textSize="text-lg">
                        OPEN PACKS
                    </GoldButton>
                    <GoldButton href="/timeline" width="w-64" height="h-16" textSize="text-lg">
                        RECORD MATCH
                    </GoldButton>
                </div>

                {/* Bottom HUD - Stats & Bonus Button */}
                <div className="absolute bottom-4 left-0 right-0 z-30 pointer-events-none">
                    {/* Centered Stats Box */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex justify-center pointer-events-auto animate-in slide-in-from-bottom-10 duration-700">
                        <div className="relative w-[300px] h-[120px] bg-[url('/ui/stats_panel_cropped.png')] bg-[length:100%_100%] bg-center bg-no-repeat">
                            <div className="absolute top-1/2 -translate-y-1/2 left-[56px] w-20 flex flex-col items-center gap-1">
                                <span className="text-[10px] text-[#aaffaa] uppercase tracking-[0.2em] font-bold drop-shadow-md" style={{ fontFamily: 'var(--font-techno)' }}>Wins</span>
                                <span className="text-2xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-techno)' }}>{wins}</span>
                            </div>
                            <div className="absolute top-1/2 -translate-y-1/2 right-[56px] w-20 flex flex-col items-center gap-1">
                                <span className="text-[10px] text-[#ffaaaa] uppercase tracking-[0.2em] font-bold drop-shadow-md" style={{ fontFamily: 'var(--font-techno)' }}>Losses</span>
                                <span className="text-2xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-techno)' }}>{losses}</span>
                            </div>
                        </div>
                    </div>

                    {/* Bonus Matches Button - Right Aligned */}
                    <div className="absolute bottom-6 right-12 pointer-events-auto animate-in slide-in-from-right-10 duration-700">
                        <GoldButton width="w-56" height="h-14" textSize="text-sm">
                            Bonus Matches
                        </GoldButton>
                    </div>
                </div>

                {/* Character Sprite - Bottom Left */}
                <GuideSprite />
            </main>
        </ScaleWrapper>
    );
}
