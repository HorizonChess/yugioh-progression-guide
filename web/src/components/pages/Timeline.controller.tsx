"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import GuideSprite from "@/components/shell/GuideSprite.view";
import TopBar from "@/components/shell/TopBar.view";
import FrameButton from "@/components/ui/FrameButton.view";
import TimelineControls from "@/components/Timeline/TimelineControls.view";
import TimelineNode from "@/components/Timeline/TimelineNode.view";
import StatsPanel from "@/components/Timeline/StatsPanel.view";

/**
 * The progression TIMELINE (route: /map). A horizontal carousel of booster
 * packs as milestones, a top "Prepare Your Deck" CTA, and a bottom HUD of
 * actions + the wins/losses scoreboard.
 *
 * Layout is a full-height CSS grid (TopBar / timeline / HUD). Element sizes
 * are vh/clamp-driven so the whole page fits any screen height without a page
 * scrollbar; only the carousel scrolls horizontally.
 */
export default function Timeline() {
    const { currentSetIndex, matchHistory, hasLoaded } = useProgression();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const wins = matchHistory.filter((m) => m.winner === "player").length;
    const losses = matchHistory.filter((m) => m.winner === "opponent").length;

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
    }, []);

    // Auto-scroll to the current set on load
    useEffect(() => {
        if (!loading && scrollContainerRef.current) {
            const currentElement = document.getElementById(`set-${currentSetIndex}`);
            if (currentElement) {
                currentElement.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" });
            }
        }
    }, [loading, currentSetIndex]);

    const scroll = (direction: "left" | "right") => {
        if (scrollContainerRef.current) {
            const scrollAmount = 400;
            scrollContainerRef.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
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
            {/* Row 1: Top Bar */}
            <TopBar />

            {/* Row 2: Timeline region — fills the 1fr row. min-w-0 stops the wide
                carousel from expanding the grid. */}
            <section className="relative flex flex-col items-center justify-center gap-[clamp(0.75rem,3vh,2rem)] py-[clamp(0.5rem,2vh,1.5rem)] min-h-0 min-w-0">
                <div className="animate-in slide-in-from-top-10 duration-700">
                    <FrameButton href="/deck-builder" className="w-[clamp(14rem,20vw,18rem)] h-[clamp(2.75rem,6vh,4rem)]">
                        Prepare Your Deck
                    </FrameButton>
                </div>

                <div className="w-full min-w-0 relative">
                    <TimelineControls onScroll={scroll} />

                    {/* Horizontal scroll area — px-[50vw] lets any tile center */}
                    <div
                        ref={scrollContainerRef}
                        className="w-full overflow-x-auto hide-scrollbar flex items-center px-[50vw] py-[clamp(1rem,3vh,2.5rem)] relative z-10"
                    >
                        {sets.map((set, idx) => (
                            <TimelineNode
                                key={`${set.set_code}-${idx}`}
                                set={set}
                                index={idx}
                                current={idx === currentSetIndex}
                                reached={idx <= currentSetIndex}
                                match={matchHistory.find((m) => m.packName === set.set_name)}
                                showConnector={idx > 0}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* Row 3: Bottom HUD — actions, scoreboard, bonus. All vh-driven so it
                compresses on short screens. */}
            <footer className="relative flex flex-col items-center gap-[clamp(0.5rem,2vh,1.5rem)] px-6 pb-[clamp(0.5rem,2vh,1.5rem)]">
                <div className="flex flex-wrap justify-center gap-[clamp(1rem,2vw,1.5rem)]">
                    <FrameButton href={`/packs?set=${currentSetIndex}`} className="w-[clamp(12rem,18vw,16rem)] h-[clamp(2.75rem,6vh,4rem)]">
                        OPEN PACKS
                    </FrameButton>
                    <FrameButton href="/timeline" className="w-[clamp(12rem,18vw,16rem)] h-[clamp(2.75rem,6vh,4rem)]">
                        RECORD MATCH
                    </FrameButton>
                </div>

                <div className="w-full flex flex-col lg:flex-row items-center lg:justify-center gap-[clamp(0.5rem,2vh,1.5rem)] relative">
                    <StatsPanel wins={wins} losses={losses} />

                    <div className="lg:absolute lg:right-12 lg:top-1/2 lg:-translate-y-1/2 animate-in slide-in-from-right-10 duration-700">
                        <FrameButton className="w-[clamp(11rem,16vw,14rem)] h-[clamp(2.5rem,5vh,3.5rem)]">
                            Bonus Matches
                        </FrameButton>
                    </div>
                </div>
            </footer>

            {/* Floating character sprite (overlay, not in layout flow) */}
            <GuideSprite />
        </main>
    );
}
