"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchTournamentSets, fetchCardsInSet, PulledCard } from "@/lib/api";
import { RewardEntry, resolvePrizeKind, PrizeKind } from "@/lib/rewards";
import { useState } from "react";
import StonePanel from "@/components/ui/StonePanel.view";
import GuideSprite from "@/components/shell/GuideSprite.view";
import RewardCard from "@/components/Rewards/RewardCard.view";
import PackRevealModal, { RevealSource } from "@/components/Rewards/PackRevealModal.view";

/**
 * The REWARDS tab (route: /rewards) — the persisted reward ledger.
 *
 * Two sections: AVAILABLE (unclaimed rewards, each with a claim affordance
 * appropriate to its prize kind) and CLAIMED (read-only history). Rewards are
 * created by the record-match flow (win → the spun wheel prize; loss → the pity
 * prize) and resolved here.
 *
 * Claims wired so far:
 *  - text        → inline "Claim" (nothing to grant beyond acknowledging it)
 *  - pity        → the shared `PackRevealModal`, opening 3 boosters of the
 *                  just-finished CORE set
 *  - tournament  → the same `PackRevealModal`, opening 3 packs of the latest
 *                  tournament set released before the won pack
 * pity + tournament share one modal, differing only in which set they resolve.
 * The remaining interactive prizes (wildcard, ban/unban, starlight) are shown
 * available but disabled ("coming soon") until their phases; snatch-steal is
 * locked pending multiplayer.
 */

/** Prize kinds whose claim modal isn't built yet (shown available, disabled). */
const COMING_SOON: Record<PrizeKind, string | null> = {
    text: null,
    pity: null,
    tournament: null,
    snatch: "Requires multiplayer — coming soon",
    wildcard: "Claim flow coming soon",
    starlight: "Claim flow coming soon",
    ban: "Claim flow coming soon",
    unban: "Claim flow coming soon",
};

export default function RewardsPage() {
    const { rewards, claimRewardEntry, addToCollection } = useProgression();
    /** The reward whose 3-pack reveal modal is open (pity or tournament), if any. */
    const [revealEntry, setRevealEntry] = useState<RewardEntry | null>(null);

    const available = rewards.filter((r) => r.status === "available");
    const claimed = rewards.filter((r) => r.status === "claimed");

    // --- Text claim: nothing to grant, just acknowledge it ---
    const claimText = (entry: RewardEntry) => {
        claimRewardEntry(entry.id);
    };

    // Which set a reward's 3 packs open from — the only thing that differs
    // between pity and tournament. Passed to the shared PackRevealModal.
    const resolveSource = async (entry: RewardEntry): Promise<RevealSource> => {
        const kind = resolvePrizeKind(entry.prizeId);
        if (kind === "tournament") {
            const [sets, tournamentSets] = await Promise.all([fetchAllSets(), fetchTournamentSets()]);
            const anchorDate = sets[entry.wonFromSetIndex]?.tcg_date;
            // Latest tournament set released before the won pack (fall back to the
            // latest available if the anchor date can't be resolved).
            const eligible = anchorDate
                ? tournamentSets.filter((s) => s.tcg_date < anchorDate)
                : tournamentSets;
            const set = (eligible.length ? eligible : tournamentSets).at(-1) ?? null;
            const cards = set ? await fetchCardsInSet(set.set_name) : [];
            return { set, cards };
        }
        // pity → the just-finished CORE set the match was lost against.
        const sets = await fetchAllSets();
        const set = sets[entry.wonFromSetIndex] ?? null;
        const cards = set ? await fetchCardsInSet(set.set_name) : [];
        return { set, cards };
    };

    // --- Collect the opened packs (pity or tournament) and claim the reward ---
    const collectReveal = (cards: PulledCard[]) => {
        if (!revealEntry) return;
        addToCollection(cards);
        claimRewardEntry(revealEntry.id, { grantedCardIds: cards.map((c) => c.id) });
        setRevealEntry(null);
    };

    // Choose the claim affordance for an available entry by its prize kind.
    const renderAvailable = (entry: RewardEntry) => {
        const kind = resolvePrizeKind(entry.prizeId);
        const comingSoon = COMING_SOON[kind];

        if (comingSoon) {
            return (
                <RewardCard
                    key={entry.id}
                    entry={entry}
                    locked
                    lockedNote={comingSoon}
                />
            );
        }

        if (kind === "pity" || kind === "tournament") {
            return (
                <RewardCard
                    key={entry.id}
                    entry={entry}
                    actionLabel="Open 3 Packs"
                    onAction={() => setRevealEntry(entry)}
                />
            );
        }

        // text
        return (
            <RewardCard
                key={entry.id}
                entry={entry}
                actionLabel="Claim"
                onAction={() => claimText(entry)}
            />
        );
    };

    return (
        <div className="h-full overflow-hidden grid grid-rows-[auto_1fr] relative">
            {/* Sub-header — matches Collection's wooden bar (title + count), sitting
                below the hoisted nav so the tab reads as part of the app chrome. */}
            <div className="bg-wood-dark border-b-2 border-wood-border p-4 shadow-md relative z-40">
                <div className="max-w-3xl mx-auto flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white leading-none">Rewards</h1>
                        <p className="text-sm text-gray-400 font-mono mt-1">
                            Claim what you&apos;ve earned on the road through history.
                        </p>
                    </div>
                    <p className="text-sm text-primary font-bold whitespace-nowrap">
                        {available.length} Available
                    </p>
                </div>
            </div>

            <div className="min-h-0 overflow-y-auto custom-scrollbar p-6 md:p-8 pb-16">
                <div className="max-w-3xl mx-auto space-y-8">
                    <StonePanel title={`Available Rewards${available.length ? ` (${available.length})` : ""}`}>
                        {available.length === 0 ? (
                            <div className="reward-empty">No rewards waiting. Win or lose a match to earn some.</div>
                        ) : (
                            <div className="space-y-3">{available.map(renderAvailable)}</div>
                        )}
                    </StonePanel>

                    <StonePanel title={`Claimed Rewards${claimed.length ? ` (${claimed.length})` : ""}`}>
                        {claimed.length === 0 ? (
                            <div className="reward-empty">Nothing claimed yet.</div>
                        ) : (
                            <div className="space-y-3">
                                {claimed.map((entry) => (
                                    <RewardCard key={entry.id} entry={entry} />
                                ))}
                            </div>
                        )}
                    </StonePanel>
                </div>
            </div>

            <GuideSprite />

            {revealEntry && (
                <PackRevealModal
                    entry={revealEntry}
                    resolveSource={resolveSource}
                    onCollect={collectReveal}
                    onClose={() => setRevealEntry(null)}
                />
            )}
        </div>
    );
}
