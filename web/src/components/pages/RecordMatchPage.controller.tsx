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
 * and NOT the visual timeline; that lives at /map). Wraps the record-match
 * board with the match-result math (win rate + streak) and drives the
 * record-then-reward flow:
 *
 *   WIN  → record → the board content VORTEXES away and the Winner's Wheel
 *          CURTAINS in — INSIDE THE SAME persistent glass panel (the box does
 *          not move / re-mount) → spin → claim → advance → /map.
 *   LOSS → the DEFEAT flourish → record → advance → the untouched /rewards pity flow.
 *
 * The win moment is ONE persistent `.win-panel`: only its inner CONTENT swaps
 * (`stage` = "board" | "wheel") under <AnimatePresence>, so the panel is a stable
 * stage and the acts change on it. Degrades to a plain cross-fade under
 * prefers-reduced-motion.
 */
type Stage = "board" | "wheel";

export default function RecordMatchPage() {
    const { matchHistory, recordMatch, advanceSet, claimReward, currentSetIndex } = useProgression();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState<Stage>("board");
    const [defeat, setDefeat] = useState(false);

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
            // Swap the panel's CONTENTS: board vortexes out, wheel curtains in.
            setStage("wheel");
        } else {
            // Loss: play the flourish, then hand off to the untouched pity flow.
            setDefeat(true);
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

    if (defeat) {
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

    // Content transitions INSIDE the stable panel. Board content vortexes out
    // (collapse + spin inward); wheel content curtains in (open from a slit).
    // Reduced motion → a plain cross-fade for both.
    const vortexExit = reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scale: 0.2, rotate: 25, filter: "blur(6px)" };
    const curtainsInitial = reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, scaleX: 0.02, scaleY: 0.85 };
    const curtainsAnimate = { opacity: 1, scaleX: 1, scaleY: 1 };

    return (
        <div className="h-full flex items-center justify-center p-4 md:p-8">
            {/* ONE persistent panel — the stable stage. It never unmounts across the
                board→wheel swap; only its inner content changes. */}
            <div className="win-panel">
                <div className="win-panel__stage">
                    <AnimatePresence mode="wait" initial={false}>
                        {stage === "board" && currentSet && (
                            <motion.div
                                key="board"
                                className="win-panel__act"
                                initial={{ opacity: 1 }}
                                exit={vortexExit}
                                transition={{ duration: reduceMotion ? 0.25 : 0.55, ease: "easeIn" }}
                            >
                                <RecordMatch
                                    onRecord={handleRecordMatch}
                                    onCancel={() => router.push("/map")}
                                    opponentName={currentSet.set_name}
                                    winRate={winRate}
                                    streak={streakDisplay}
                                />
                            </motion.div>
                        )}

                        {stage === "wheel" && (
                            <motion.div
                                key="wheel"
                                className="win-panel__act"
                                initial={curtainsInitial}
                                animate={curtainsAnimate}
                                transition={{ duration: reduceMotion ? 0.25 : 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.05 }}
                            >
                                <WinnersWheel onClaim={handleClaimPrize} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Character sprite — bottom left */}
            <GuideSprite />
        </div>
    );
}
