"use client";

import { useWelcome } from "@/lib/guide/welcome";
import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { RepoError, type PendingReport } from "@/lib/repo/types";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RecordMatch from "@/components/record-match/RecordMatch";
import WinnersWheel from "@/components/record-match/WinnersWheel";
import DefeatAct from "@/components/record-match/DefeatAct";
import GuideSprite from "@/components/layout/GuideSprite";
import { resultLine, waitingLine } from "@/lib/guide/lines";
import { guide, seed } from "@/lib/guide/store";
import PendingReportPanel from "@/components/record-match/PendingReportPanel";
import { useAuth } from "@/context/AuthContext";
import { wheelPrizesFor } from "@ygo/shared";
import { asset } from "@/lib/utils";
import type { WheelPrize } from "@/lib/rewards";
import DuelLauncher from "@/components/duel/DuelLauncher";
import { openDuels } from "@/lib/duel-client";
import "@/components/record-match/record-match.css";

/** The board's art, handed to its CSS through asset() (which knows the base path). */
const ART = {
    "--rm-stone": `url('${asset("/ui/record-match/stone.webp")}')`,
    "--rm-frieze": `url('${asset("/ui/record-match/frieze.webp")}')`,
    "--rm-tab-win": `url('${asset("/ui/record-match/tablet-win.webp")}')`,
    "--rm-tab-win-lines": `url('${asset("/ui/record-match/tablet-win-lines.webp")}')`,
    "--rm-tab-lose": `url('${asset("/ui/record-match/tablet-lose.webp")}')`,
    "--rm-tab-lose-lines": `url('${asset("/ui/record-match/tablet-lose-lines.webp")}')`,
} as React.CSSProperties;

/**
 * The Record Match screen (route: /record-match): one temple-stone board. The opponent's pack
 * sits in a niche on the left; on the right the acts take turns:
 *
 *   choose → the two stone tablets (Victory / Defeat)
 *   WIN    → the Winner's Wheel; its prize takes the pack's place → Claim → /rewards
 *   LOSS   → the bowed tablet lit and 3 Pity Packs dealt → Claim → /rewards
 *   DUO    → the reported result waits for the rival (or for this player to confirm it)
 *
 * Reporting the result books the reward (a wheel spin or pity packs) and advances the set;
 * a spin left for later is resumed with ?spin=<rewardId>.
 */
type Stage = "board" | "duel" | "wheel" | "defeat";

export default function RecordMatchPage() {
    const { matchHistory, reportMatch, confirmReport, rejectReport, spin, currentSetIndex, series, savedDecks } = useProgression();
    const userId = useAuth().user?.id;
    // Anyone can duel here; a guest only practices (rival duels need accounts on both sides).
    const canDuel = !!series && !series.finished;
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

    // A duel waiting on this player (the rival's challenge, or one in progress) opens the duel act first.
    useEffect(() => {
        if (!canDuel || !series || !userId) return;
        let live = true;
        openDuels(series.id)
            .then((duels) => live && duels.some((d) => d.kind === "rival") && setStage((s) => (s === "board" ? "duel" : s)))
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [canDuel, series, userId]);

    // Win rate and current streak from match history
    const wins = matchHistory.filter((m) => m.winner === "player").length;
    const total = matchHistory.length;
    const losses = total - wins;
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
    // In duo the result waits for the rival; the page then shows it as pending.
    // Yugi on the result. In solo the opponent is the set; in duo, the rival.
    const rivalName = series?.members.find((m) => m.id !== userId)?.duelistName ?? "your rival";
    const cheer = (won: boolean) => {
        const after = won ? (streak > 0 ? streak + 1 : 1) : streak < 0 ? streak - 1 : -1;
        guide.say(resultLine(won, { mode: series?.mode ?? "solo", rival: rivalName, streak: after, next: sets[currentSetIndex + 1]?.set_name, seed: seed() }));
    };

    const handleRecordMatch = async (winner: "player" | "opponent") => {
        try {
            const outcome = await reportMatch(winner === "player");
            if (outcome.status === "pending") return void guide.say(waitingLine(rivalName, seed()));
            cheer(winner === "player");
            setSpinRewardId(outcome.reward.id);
            setStage(winner === "player" ? "wheel" : "defeat");
        } catch (error) {
            alertRepoError(error);
        }
    };

    // Confirming the rival's report books both rewards; this player's then plays out here.
    // The answered report stays on screen until the next act takes over.
    const [answered, setAnswered] = useState<PendingReport | null>(null);
    /** The prize the wheel landed on: it takes the pack's place in the niche. */
    const [won, setWon] = useState<WheelPrize | null>(null);
    const answerReport = async (confirm: boolean) => {
        const report = series?.pendingReport;
        if (!report) return;
        try {
            if (!confirm) return await rejectReport(report.id);
            setAnswered(report);
            const reward = await confirmReport(report.id);
            cheer(reward.prizeId === "wheel-spin");
            setSpinRewardId(reward.id);
            setStage(reward.prizeId === "wheel-spin" ? "wheel" : "defeat");
        } catch (error) {
            setAnswered(null);
            alertRepoError(error);
        }
    };

    const toRewards = () => router.push("/rewards");
    const toTimeline = () => router.push("/timeline");

    // The first time the "how did it go?" board is up.
    const choosing = !loading && stage === "board" && !!sets[currentSetIndex] && !(series?.mode === "duo" && (series.pendingReport ?? answered));
    useWelcome("record-match", choosing, { mode: series?.mode, rival: series?.members.find((m) => m.id !== userId)?.duelistName });

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading...</div>
            </div>
        );
    }

    const currentSet = sets[currentSetIndex];
    const pending = series?.mode === "duo" ? (series.pendingReport ?? answered) : null;
    const rival = series?.members.find((m) => m.id !== userId)?.duelistName ?? "Your rival";

    // The acts change on one board: the one leaving fades and sinks, the next rises in.
    const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 };
    const shown = { opacity: 1, y: 0, scale: 1 };
    const leave = reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 };
    const motionProps = { initial: enter, animate: shown, exit: leave, transition: { duration: reduceMotion ? 0.2 : 0.35, ease: "easeOut" as const } };

    const head = stage === "wheel" ? "Victory reward" : stage === "defeat" ? "Match result" : stage === "duel" ? "Duel" : pending ? "Duo series" : "Record the duel";
    const pack = currentSet?.set_image;

    return (
        <div className="rm-screen">
            <div className="rm-board" style={ART}>
                <div className="rm-head"><b><span className="rm-gilt">{head}</span></b></div>
                <div className="rm-main">
                    <div className={`rm-foe ${won ? "rm-foe--won" : ""} ${stage === "wheel" ? "rm-foe--wheel" : ""}`}>
                        <div className="rm-niche">
                            {pack && <img src={pack} alt={`${currentSet?.set_name ?? ""} pack`} />}
                            <div className="rm-medal" aria-hidden={!won}><b>{won?.short}</b></div>
                        </div>
                        <small>Your opponent</small>
                        <b className="rm-foe__name rm-gilt">{pending?.setName ?? currentSet?.set_name ?? "Unknown duelist"}</b>
                        <div className="rm-stats">
                            <div className="rm-stat"><small>Win rate</small><b>{winRate}</b></div>
                            <div className="rm-stat"><small>Streak</small><b>{streakDisplay}</b></div>
                            <div className="rm-stat"><small>Record</small><b>{total ? `${wins}–${losses}` : "--"}</b></div>
                        </div>
                    </div>

                    <div className="rm-stage">
                        <AnimatePresence mode="wait" initial={false}>
                            {stage === "board" && pending && (
                                <motion.div key="pending" className="rm-act" {...motionProps}>
                                    <PendingReportPanel report={pending} rival={rival} mine={pending.reporterId === userId} onAnswer={answerReport} />
                                </motion.div>
                            )}
                            {stage === "board" && !pending && currentSet && (
                                <motion.div key="board" className="rm-act rm-act--choose" {...motionProps}>
                                    {canDuel && <button type="button" className="rm-slab rm-duel-open" onClick={() => setStage("duel")}><span className="rm-carved">⚔ Duel in the app</span><small className="rm-slab__tag">Experimental</small></button>}
                                    <RecordMatch onRecord={handleRecordMatch} rival={series?.mode === "duo" ? rival : undefined} />
                                </motion.div>
                            )}
                            {stage === "duel" && !pending && series && (
                                <motion.div key="duel" className="rm-act rm-act--scroll" {...motionProps}>
                                    <DuelLauncher seriesId={series.id} guest={!userId} setName={currentSet?.set_name} duo={!!userId && series.mode === "duo"} rival={rival} decks={savedDecks} setDate={currentSet?.tcg_date} onBack={() => setStage("board")} />
                                </motion.div>
                            )}
                            {stage === "wheel" && (
                                <motion.div key="wheel" className="rm-act" {...motionProps}>
                                    <WinnersWheel
                                        prizes={wheelPrizesFor(series?.mode ?? "solo")}
                                        spin={() => (spinRewardId ? spin(spinRewardId) : Promise.reject(new RepoError("No reward to spin")))}
                                        onSpinComplete={setWon}
                                        onClaim={toRewards}
                                    />
                                </motion.div>
                            )}
                            {stage === "defeat" && (
                                <motion.div key="defeat" className="rm-act" {...motionProps}>
                                    <DefeatAct onClaimPity={toRewards} packImage={pack} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
                <div className="rm-foot"><button type="button" className="rm-back" onClick={toTimeline}>← Back to campaign</button></div>
            </div>

            <GuideSprite />
        </div>
    );
}
