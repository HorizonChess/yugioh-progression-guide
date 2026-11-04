"use client";

import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { RepoError } from "@/lib/repo/types";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RecordMatch from "@/components/record-match/RecordMatch";
import WinnersWheel from "@/components/record-match/WinnersWheel";
import DefeatAct from "@/components/record-match/DefeatAct";
import GuideSprite from "@/components/layout/GuideSprite";
import { wheelPrizesFor } from "@ygo/shared";

/**
 * The Record Match screen (route: /record-match). Wraps the record-match
 * board with the match-result math (win rate + streak) and drives the
 * record-then-reward flow:
 *
 *   WIN  → record → the board content VORTEXES away and the Winner's Wheel
 *          CURTAINS in — INSIDE THE SAME persistent glass panel (the box does
 *          not move / re-mount) → spin → claim the prize into the ledger →
 *          advance → /rewards (or Back to Campaign → /timeline).
 *   LOSS → record → the board content VORTEXES away and the DEFEAT act CURTAINS
 *          in — SAME persistent panel, mirroring the win → "3 Pity Packs" with
 *          two exits: Claim Pity Packs (→ /rewards) or Back to Campaign (→ /timeline).
 *
 * The record moment is ONE persistent `.win-panel`: only its inner CONTENT swaps
 * (`stage` = "board" | "wheel" | "defeat") under <AnimatePresence>, so the panel
 * is a stable stage and the acts change on it. Degrades to a plain cross-fade
 * under prefers-reduced-motion.
 *
 * Reporting the result books the reward (a wheel spin or pity packs) and
 * advances the set; a spin left for later is resumed with ?spin=<rewardId>.
 */
type Stage = "board" | "wheel" | "defeat";

export default function RecordMatchPage() {
    const { matchHistory, reportMatch, spin, currentSetIndex, series } = useProgression();
    const router = useRouter();
    const reduceMotion = useReducedMotion();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState<Stage>("board");
    /** The unspun reward the wheel is for. */
    const [spinRewardId, setSpinRewardId] = useState<string | null>(null);

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
        // /record-match?spin=<rewardId> comes back to spin a reward left unspun.
        const pendingSpin = new URLSearchParams(window.location.search).get("spin");
        if (pendingSpin) {
            /* eslint-disable react-hooks/set-state-in-effect -- read once from the URL */
            setSpinRewardId(pendingSpin);
            setStage("wheel");
            /* eslint-enable react-hooks/set-state-in-effect */
        }
    }, []);

    // Win rate and current streak from match history
    const wins = matchHistory.filter((m) => m.winner === "player").length;
    const total = matchHistory.length;
    const winRate = total > 0 ? `${Math.round((wins / total) * 100)}%` : "--";

    // Current run of same-result matches: +N wins or -N losses.
    let streak = 0;
    for (const match of [...matchHistory].reverse()) {
        const step = match.winner === "player" ? 1 : -1;
        if (streak !== 0 && Math.sign(streak) !== step) break;
        streak += step;
    }
    const streakDisplay = streak === 0 ? "--" : streak > 0 ? `+${streak}` : `${streak}`;

    // Reporting advances the set and books the reward (a wheel spin or pity
    // packs) at once; the act that follows only spends it.
    const handleRecordMatch = async (winner: "player" | "opponent") => {
        try {
            const outcome = await reportMatch(winner === "player");
            if (outcome.status === "applied") setSpinRewardId(outcome.reward.id);
            setStage(winner === "player" ? "wheel" : "defeat");
        } catch (error) {
            alertRepoError(error);
        }
    };

    const toRewards = () => router.push("/rewards");
    const toTimeline = () => router.push("/timeline");

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
                                    onCancel={() => router.push("/timeline")}
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
                                <WinnersWheel
                                    prizes={wheelPrizesFor(series?.mode ?? "solo")}
                                    spin={() => (spinRewardId ? spin(spinRewardId) : Promise.reject(new RepoError("No reward to spin")))}
                                    onClaim={toRewards}
                                    onBackToCampaign={toTimeline}
                                />
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
                                <DefeatAct onClaimPity={toRewards} onBackToCampaign={toTimeline} />
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
