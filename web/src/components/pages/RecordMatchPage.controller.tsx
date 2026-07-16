"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RecordMatch from "@/components/RecordMatch/RecordMatch.view";
import WinnersWheel from "@/components/RecordMatch/WinnersWheel.view";
import DefeatAct from "@/components/RecordMatch/DefeatAct.view";
import GuideSprite from "@/components/shell/GuideSprite.view";
import { WheelPrize, PITY_PRIZE } from "@/lib/rewards";

/**
 * The Record Match screen (route: /timeline — the folder name is historical
 * and NOT the visual timeline; that lives at /map). Wraps the record-match
 * board with the match-result math (win rate + streak) and drives the
 * record-then-reward flow:
 *
 *   WIN  → record → the board content VORTEXES away and the Winner's Wheel
 *          CURTAINS in — INSIDE THE SAME persistent glass panel (the box does
 *          not move / re-mount) → spin → claim the prize into the ledger →
 *          advance → /rewards (or Back to Campaign → /map).
 *   LOSS → record → the board content VORTEXES away and the DEFEAT act CURTAINS
 *          in — SAME persistent panel, mirroring the win → "3 Pity Packs" with
 *          two exits: Claim Pity Packs (→ /rewards) or Back to Campaign (→ /map).
 *
 * The record moment is ONE persistent `.win-panel`: only its inner CONTENT swaps
 * (`stage` = "board" | "wheel" | "defeat") under <AnimatePresence>, so the panel
 * is a stable stage and the acts change on it. Degrades to a plain cross-fade
 * under prefers-reduced-motion.
 *
 * Rewards are created when the outcome is CLAIMED (win → the spun WheelPrize,
 * loss → the PITY_PRIZE) and pushed onto the persisted ledger via addReward —
 * NOT in recordMatch (which is now append-only). See rewards-tab plan.
 */
type Stage = "board" | "wheel" | "defeat";

export default function RecordMatchPage() {
    const { matchHistory, recordMatch, advanceSet, addReward, currentSetIndex } = useProgression();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState<Stage>("board");

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

        // Append the match result (append-only; the reward is created on claim).
        recordMatch({ winner, packName: currentSet.set_name, date: new Date().toISOString() });

        // Swap the panel's CONTENTS: board vortexes out, the outcome act curtains
        // in. Same persistent panel for both win and loss.
        setStage(winner === "player" ? "wheel" : "defeat");
    };

    // The pack this match was played against — recorded on every reward so its
    // claim flow can reference the source pack (details view, date gates).
    const currentSetForRewards = sets[currentSetIndex];

    // Push a won reward onto the ledger, then advance the set. Shared by the win
    // (spun prize) and loss (pity) claim paths.
    const grantReward = (prizeId: string) => {
        if (currentSetForRewards) {
            addReward({
                prizeId,
                wonFromPackName: currentSetForRewards.set_name,
                wonFromSetIndex: currentSetIndex,
            });
        }
        advanceSet();
    };

    // WIN: the spun wheel prize is claimed → land it in the ledger → /rewards.
    const handleClaimPrize = (prize: WheelPrize) => {
        grantReward(prize.id);
        router.push("/rewards");
    };

    // WIN: skip the ledger detour and head back to the map (set still advances).
    const handleWinBackToCampaign = () => {
        advanceSet();
        router.push("/map");
    };

    // LOSS: claim the pity packs → land the pity reward in the ledger → /rewards.
    const handleClaimPity = () => {
        grantReward(PITY_PRIZE.id);
        router.push("/rewards");
    };

    // LOSS: skip the pity reward for now, back to the map (set still advances).
    const handleDefeatBackToCampaign = () => {
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
                                <WinnersWheel onClaim={handleClaimPrize} onBackToCampaign={handleWinBackToCampaign} />
                            </motion.div>
                        )}

                        {stage === "defeat" && (
                            <motion.div
                                key="defeat"
                                className="win-panel__act"
                                initial={curtainsInitial}
                                animate={curtainsAnimate}
                                transition={{ duration: reduceMotion ? 0.25 : 0.5, ease: "easeOut", delay: reduceMotion ? 0 : 0.05 }}
                            >
                                <DefeatAct onClaimPity={handleClaimPity} onBackToCampaign={handleDefeatBackToCampaign} />
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
