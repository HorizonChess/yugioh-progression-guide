"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RecordMatch from "@/components/RecordMatch/RecordMatch.view";
import WinnersWheel from "@/components/RecordMatch/WinnersWheel.view";
import GuideSprite from "@/components/shell/GuideSprite.view";

/**
 * The Record Match screen (route: /timeline — the folder name is historical
 * and NOT the visual timeline; that lives at /map). Wraps the <RecordMatch>
 * board with the match-result math (win rate + streak) and drives the
 * record-then-reward flow:
 *
 *   WIN  → record → the board VORTEXES away → the Winner's Wheel opens like
 *          CURTAINS in its place → spin → claim → advance → /map.
 *   LOSS → the DEFEAT flourish → record → advance → the untouched /rewards pity flow.
 *
 * The win transition is orchestrated with framer-motion's <AnimatePresence>
 * (the app's animation lib); it degrades to a plain cross-fade under
 * prefers-reduced-motion.
 */
type Phase = "board" | "wheel" | "defeat";

export default function RecordMatchPage() {
    const { matchHistory, recordMatch, advanceSet, claimReward, currentSetIndex } = useProgression();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [phase, setPhase] = useState<Phase>("board");

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
    }, []);

    // Win rate and current streak from match history
    const wins = matchHistory.filter((m) => m.winner === "player").length;
    const total = matchHistory.length;
    const winRate = total > 0 ? `${Math.round((wins / total) * 100)}%` : "--";

    let streak = 0;
    for (let i = matchHistory.length - 1; i >= 0; i--) {
        const isWin = matchHistory[i].winner === "player";
        if (i === matchHistory.length - 1) {
            streak = isWin ? 1 : -1;
        } else {
            const prevWin = matchHistory[i + 1].winner === "player";
            if (isWin === prevWin) {
                streak += isWin ? 1 : -1;
            } else {
                break;
            }
        }
    }
    const streakDisplay = streak === 0 ? "--" : streak > 0 ? `+${streak}` : `${streak}`;

    const handleRecordMatch = (winner: "player" | "opponent") => {
        const currentSet = sets[currentSetIndex];
        if (!currentSet) return;

        // Record immediately so a mid-transition refresh knows a reward is owed
        // (recordMatch sets pendingReward: 'wheel' on a win, 'pity' on a loss).
        recordMatch({ winner, packName: currentSet.set_name, date: new Date().toISOString() });

        if (winner === "player") {
            // Vortex the board away, open the wheel in its place.
            setPhase("wheel");
        } else {
            // Loss: play the flourish, then hand off to the untouched pity flow.
            setPhase("defeat");
            setTimeout(() => {
                advanceSet();
                router.push("/rewards");
            }, 2000);
        }
    };

    // Wheel prize claimed → clear the owed reward, advance, go see progress.
    // (Text prizes just acknowledge for now, mirroring /rewards; when Rewards
    // becomes a ledger tab, resolve the prize here before clearing.)
    const handleClaimPrize = () => {
        claimReward();
        advanceSet();
        router.push("/map");
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading...</div>
            </div>
        );
    }

    if (phase === "defeat") {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                <div className="text-center animate-in zoom-in duration-500">
                    <h1 className="record-outcome record-outcome--defeat">DEFEAT</h1>
                    <p className="text-2xl text-white font-bold animate-pulse">Claiming pity packs...</p>
                </div>
            </div>
        );
    }

    const currentSet = sets[currentSetIndex];

    // Vortex (board exit) + curtains (wheel enter). Reduced motion → cross-fade.
    const vortexExit = reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: 0.2, rotate: 25, filter: "blur(6px)" };
    const curtainsInitial = reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scaleX: 0.02, scaleY: 0.85 };
    const curtainsAnimate = reduceMotion
        ? { opacity: 1 }
        : { opacity: 1, scaleX: 1, scaleY: 1 };

    return (
        <div className="h-full flex flex-col">
            <AnimatePresence mode="wait">
                {phase === "board" && currentSet && (
                    <motion.div
                        key="board"
                        className="flex-1 flex flex-col min-h-0"
                        initial={{ opacity: 1 }}
                        exit={vortexExit}
                        transition={{ duration: reduceMotion ? 0.25 : 0.6, ease: "easeIn" }}
                    >
                        <RecordMatch
                            onRecord={handleRecordMatch}
                            onCancel={() => router.push("/map")}
                            mode="fullPage"
                            winRate={winRate}
                            streak={streakDisplay}
                        />
                    </motion.div>
                )}

                {phase === "wheel" && (
                    <motion.div
                        key="wheel"
                        className="flex-1 flex items-center justify-center p-4 md:p-8"
                        initial={curtainsInitial}
                        animate={curtainsAnimate}
                        transition={{ duration: reduceMotion ? 0.25 : 0.55, ease: "easeOut", delay: reduceMotion ? 0 : 0.1 }}
                    >
                        <WinnersWheel onClaim={handleClaimPrize} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Character sprite — bottom left */}
            <GuideSprite />
        </div>
    );
}
