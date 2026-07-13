"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import GuideSprite from "@/components/GuideSprite";
import TopBar from "@/components/TopBar";
import ChainConnector from "@/components/ChainConnector";
import GoldButton from "@/components/GoldButton";

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
            <div className="min-h-screen w-full flex items-center justify-center bg-black text-white">
                <div className="text-2xl font-bold animate-pulse text-primary">LOADING TIMELINE...</div>
            </div>
        );
    }

    return (
        <main className="h-screen w-full overflow-hidden text-white font-sans selection:bg-primary selection:text-black grid grid-rows-[auto_1fr_auto] grid-cols-[minmax(0,1fr)]">
            {/* Row 1: Top Bar (sticky within the grid) */}
            <TopBar />

            {/* Row 2: Timeline region — fills the 1fr row height. Element sizes are
                driven by viewport height (vh/clamp) so the whole page fits any screen
                (laptop → desktop) without a page scrollbar. Only the carousel scrolls
                horizontally. min-w-0 stops the wide child from expanding the grid. */}
            <section className="relative flex flex-col items-center justify-center gap-[clamp(0.75rem,3vh,2rem)] py-[clamp(0.5rem,2vh,1.5rem)] min-h-0 min-w-0">
                {/* Prepare Your Deck — top center of the timeline region */}
                <div className="animate-in slide-in-from-top-10 duration-700">
                    <GoldButton href="/deck-builder" width="w-[clamp(14rem,20vw,18rem)]" height="h-[clamp(2.75rem,6vh,4rem)]" textSize="text-sm">
                        Prepare Your Deck
                    </GoldButton>
                </div>

                {/* Timeline with scroll controls */}
                <div className="w-full min-w-0 relative">
                    {/* Scroll Controls */}
                    <button
                        onClick={() => scroll('left')}
                        aria-label="Scroll timeline left"
                        className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-black/50 border-2 border-primary text-primary flex items-center justify-center hover:bg-primary hover:text-black transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                    >
                        <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        aria-label="Scroll timeline right"
                        className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-black/50 border-2 border-primary text-primary flex items-center justify-center hover:bg-primary hover:text-black transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                    >
                        <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Horizontal Scroll Area — px-[50vw] lets any tile center */}
                    <div
                        ref={scrollContainerRef}
                        className="w-full overflow-x-auto hide-scrollbar flex items-center px-[50vw] py-[clamp(1rem,3vh,2.5rem)] relative z-10"
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
                                        className={`relative flex-shrink-0 flex flex-col items-center gap-[clamp(0.5rem,1.5vh,1.5rem)] transition-all duration-500 z-10 ${isCurrent ? 'scale-125 z-20' : 'scale-90 opacity-60 hover:opacity-100 hover:scale-95 grayscale hover:grayscale-0'}`}
                                    >
                                        {/* Pack Art Container — sized by viewport HEIGHT so the row
                                            shrinks on short screens (laptop) and grows on tall ones.
                                            aspect-[2/3] derives the width from the height. */}
                                        <Link href={`/packs?set=${idx}`} className={`relative block h-[clamp(11rem,26vh,20rem)] aspect-[2/3] rounded-xl overflow-hidden shadow-2xl transition-all duration-300 bg-black ${isCurrent ? 'ring-4 ring-primary shadow-[0_0_50px_rgba(212,175,55,0.5)]' : 'hover:ring-2 hover:ring-gray-500'}`}>
                                            {set.set_image ? (
                                                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                                                    <img
                                                        src={set.set_image}
                                                        alt={set.set_name}
                                                        className="w-full h-full object-contain transform hover:scale-110 transition-transform duration-700"
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
                                        <div className="text-center max-w-[min(12rem,40vw)]">
                                            <h3 className={`font-bold text-sm mb-1 truncate ${isCurrent ? 'text-white text-[clamp(1rem,2.2vh,1.25rem)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-gray-500'}`}>
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
            </section>

            {/* Row 3: Bottom HUD — action buttons, stats panel, bonus button.
                All sizes are vh-driven so the HUD compresses on short screens.

                TODO: fix custom button elements stretch/position — GoldButton and the
                stats panel are raster PNGs scaled to non-native aspect ratios, so the
                ornate borders distort and the %-pinned text drifts when clamp() sizing
                changes their proportions. Replace with SVG frames (Step 3 / FrameButton)
                so vector borders stay crisp and text sits in flow, not on magic offsets. */}
            <footer className="relative flex flex-col items-center gap-[clamp(0.5rem,2vh,1.5rem)] px-6 pb-[clamp(0.5rem,2vh,1.5rem)]">
                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-[clamp(1rem,2vw,1.5rem)]">
                    <GoldButton href={`/packs?set=${currentSetIndex}`} width="w-[clamp(12rem,18vw,16rem)]" height="h-[clamp(2.75rem,6vh,4rem)]" textSize="text-lg">
                        OPEN PACKS
                    </GoldButton>
                    <GoldButton href="/timeline" width="w-[clamp(12rem,18vw,16rem)]" height="h-[clamp(2.75rem,6vh,4rem)]" textSize="text-lg">
                        RECORD MATCH
                    </GoldButton>
                </div>

                {/* Stats + Bonus row: stats centered, bonus button trailing on wide screens.
                    Stats panel keeps its 300:120 (2.5) aspect; text pins are % so they
                    track the panel at any size. */}
                <div className="w-full flex flex-col lg:flex-row items-center lg:justify-center gap-[clamp(0.5rem,2vh,1.5rem)] relative">
                    {/* Centered Stats Box — height-driven, width from 2.5 aspect */}
                    <div className="relative h-[clamp(4.5rem,11vh,7.5rem)] aspect-[300/120] bg-[url('/ui/stats_panel_cropped.png')] bg-[length:100%_100%] bg-center bg-no-repeat animate-in slide-in-from-bottom-10 duration-700 lg:mx-auto">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[18.7%] -translate-x-1/2 flex flex-col items-center gap-0.5">
                            <span className="text-[clamp(8px,1.1vh,10px)] text-win uppercase tracking-[0.2em] font-bold drop-shadow-md" style={{ fontFamily: 'var(--font-techno)' }}>Wins</span>
                            <span className="text-[clamp(1.1rem,2.6vh,1.5rem)] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-techno)' }}>{wins}</span>
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 right-[18.7%] translate-x-1/2 flex flex-col items-center gap-0.5">
                            <span className="text-[clamp(8px,1.1vh,10px)] text-loss uppercase tracking-[0.2em] font-bold drop-shadow-md" style={{ fontFamily: 'var(--font-techno)' }}>Losses</span>
                            <span className="text-[clamp(1.1rem,2.6vh,1.5rem)] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'var(--font-techno)' }}>{losses}</span>
                        </div>
                    </div>

                    {/* Bonus Matches Button — trails on the right at wide widths */}
                    <div className="lg:absolute lg:right-12 lg:top-1/2 lg:-translate-y-1/2 animate-in slide-in-from-right-10 duration-700">
                        <GoldButton width="w-[clamp(11rem,16vw,14rem)]" height="h-[clamp(2.5rem,5vh,3.5rem)]" textSize="text-sm">
                            Bonus Matches
                        </GoldButton>
                    </div>
                </div>
            </footer>

            {/* Character Sprite — floating overlay (not part of layout flow) */}
            <GuideSprite />
        </main>
    );
}
