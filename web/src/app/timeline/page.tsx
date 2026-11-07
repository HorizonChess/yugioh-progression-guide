"use client";

import { useAuth } from "@/context/AuthContext";
import { useWelcome } from "@/lib/guide/welcome";
import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import GuideSprite from "@/components/layout/GuideSprite";
import CartoucheButton from "@/components/ui/CartoucheButton";
import TimelineRoad from "@/components/timeline/TimelineRoad";
import { useIsPhone } from "@/lib/useIsPhone";
import { launchFlight } from "@/lib/pack-flight";
import TimelineControls from "@/components/timeline/TimelineControls";
import TimelineNode from "@/components/timeline/TimelineNode";
import StatsPanel from "@/components/timeline/StatsPanel";

/**
 * The progression TIMELINE (route: /timeline). A horizontal carousel of booster
 * packs as milestones, a top "Prepare Your Deck" CTA, and a bottom HUD of
 * actions + the wins/losses scoreboard.
 *
 * On phones it's the Road instead: the packs climb a vertical path and the
 * actions sit in a dock (the scoreboard hangs from the phone top bar).
 *
 * Layout is a full-height CSS grid (timeline / HUD; the nav is hoisted to the
 * root layout above this page). Element sizes are vh/clamp-driven so the whole
 * page fits any screen height without a page scrollbar; only the carousel
 * scrolls horizontally.
 */
export default function Timeline() {
    const { currentSetIndex, matchHistory, hasLoaded, series } = useProgression();
    const userId = useAuth().user?.id;
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isPhone = useIsPhone();

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
        if (!loading && !isPhone && scrollContainerRef.current) {
            const currentElement = document.getElementById(`set-${currentSetIndex}`);
            if (currentElement) {
                currentElement.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" });
            }
        }
    }, [loading, currentSetIndex, isPhone]);

    const scroll = (direction: "left" | "right") => {
        if (scrollContainerRef.current) {
            const scrollAmount = 400;
            scrollContainerRef.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
            });
        }
    };

    // Yugi's tour of the game, the first time a run's road is shown (a duo run has its own).
    useWelcome("tour", hasLoaded && !loading && !!series && sets.length > 0, {
        mode: series?.mode,
        set: sets[currentSetIndex]?.set_name,
        packs: series?.rules.packsPerSet,
        rival: series?.members.find((m) => m.id !== userId)?.duelistName,
    });

    if (!hasLoaded || loading) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-black text-white">
                <div className="text-2xl font-bold animate-pulse text-primary">LOADING TIMELINE...</div>
            </div>
        );
    }

    const matchFor = (set: CardSet) => matchHistory.find((m) => m.packName === set.set_name);

    if (isPhone) {
        return (
            <main className="h-full w-full overflow-hidden text-white grid grid-rows-[minmax(0,1fr)_auto]">
                <TimelineRoad sets={sets} currentSetIndex={currentSetIndex} matchFor={matchFor} />
                <nav className="road-dock" aria-label="Stage actions">
                    <CartoucheButton href={`/packs?set=${currentSetIndex}`} onClick={() => launchFlight(currentSetIndex)}>Open Packs</CartoucheButton>
                    <CartoucheButton href="/record-match">Record Match</CartoucheButton>
                    <div className="road-dock__small">
                        <Link href="/deck-builder">Prepare deck</Link>
                    </div>
                </nav>
                <GuideSprite />
            </main>
        );
    }

    return (
        <main className="h-full w-full overflow-hidden text-white font-sans selection:bg-primary selection:text-black grid grid-rows-[1fr_auto] grid-cols-[minmax(0,1fr)]">
            {/* Row 1: Timeline region — fills the 1fr row. min-w-0 stops the wide
                carousel from expanding the grid. (The nav is hoisted to the root
                layout above this page.) */}
            <section className="relative flex flex-col items-center justify-center gap-[clamp(0.75rem,3vh,2rem)] py-[clamp(0.5rem,2vh,1.5rem)] min-h-0 min-w-0">
                <div className="animate-in slide-in-from-top-10 duration-700">
                    <CartoucheButton href="/deck-builder" className="w-[clamp(12rem,min(18vw,26vh),17rem)]">
                        Prepare Your Deck
                    </CartoucheButton>
                </div>

                <div className="w-full min-w-0 relative">
                    <TimelineControls onScroll={scroll} />

                    {/* Horizontal scroll rail (px-[50vw] centers any tile; bottom
                        padding reserves room for the absolute captions) */}
                    <div ref={scrollContainerRef} className="timeline-carousel">
                        {sets.map((set, idx) => (
                            <TimelineNode
                                key={`${set.set_code}-${idx}`}
                                set={set}
                                index={idx}
                                current={idx === currentSetIndex}
                                reached={idx <= currentSetIndex}
                                match={matchFor(set)}
                                showConnector={idx > 0}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* Row 2: Bottom HUD — actions and scoreboard. All vh-driven so it
                compresses on short screens. */}
            <footer className="relative flex flex-col items-center gap-[clamp(0.5rem,2vh,1.5rem)] px-6 pb-[clamp(0.5rem,2vh,1.5rem)]">
                <div className="flex flex-wrap justify-center gap-[clamp(1rem,2vw,1.5rem)]">
                    <CartoucheButton href={`/packs?set=${currentSetIndex}`} onClick={() => launchFlight(currentSetIndex)} className="w-[clamp(11rem,min(16vw,24vh),15rem)]">
                        Open Packs
                    </CartoucheButton>
                    <CartoucheButton href="/record-match" className="w-[clamp(11rem,min(16vw,24vh),15rem)]">
                        Record Match
                    </CartoucheButton>
                </div>

                <div className="w-full flex flex-col lg:flex-row items-center lg:justify-center gap-[clamp(0.5rem,2vh,1.5rem)] relative">
                    <StatsPanel wins={wins} losses={losses} />

                </div>
            </footer>

            {/* Floating character sprite (overlay, not in layout flow) */}
            <GuideSprite />
        </main>
    );
}
