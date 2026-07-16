"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchCardsInSet, PulledCard } from "@/lib/api";
import { generateBoosterPack } from "@/lib/pack-logic";
import { RewardEntry, resolvePrizeKind, PrizeKind } from "@/lib/rewards";
import { useState } from "react";
import StonePanel from "@/components/ui/StonePanel.view";
import GuideSprite from "@/components/shell/GuideSprite.view";
import RewardCard from "@/components/Rewards/RewardCard.view";

/**
 * The REWARDS tab (route: /rewards) — the persisted reward ledger.
 *
 * Two sections: AVAILABLE (unclaimed rewards, each with a claim affordance
 * appropriate to its prize kind) and CLAIMED (read-only history). Rewards are
 * created by the record-match flow (win → the spun wheel prize; loss → the pity
 * prize) and resolved here.
 *
 * Phase 1 wires the SIMPLE claims:
 *  - text   → inline "Claim" (nothing to grant beyond acknowledging it)
 *  - pity   → open 3 boosters of the just-finished CORE set → add to collection
 * The interactive prizes (wildcard, tournament packs, ban/unban, starlight) are
 * shown available but disabled ("coming soon") until their dedicated phases add
 * the modal flows; snatch-steal is locked pending multiplayer.
 */

/** Prize kinds whose claim modal isn't built yet (shown available, disabled). */
const COMING_SOON: Record<PrizeKind, string | null> = {
    text: null,
    pity: null,
    snatch: "Requires multiplayer — coming soon",
    wildcard: "Claim flow coming soon",
    starlight: "Claim flow coming soon",
    tournament: "Claim flow coming soon",
    ban: "Claim flow coming soon",
    unban: "Claim flow coming soon",
};

export default function RewardsPage() {
    const { rewards, claimRewardEntry, addToCollection } = useProgression();
    const [busyId, setBusyId] = useState<string | null>(null);

    const available = rewards.filter((r) => r.status === "available");
    const claimed = rewards.filter((r) => r.status === "claimed");

    // --- Pity claim: open 3 boosters of the set the match was lost against ---
    const claimPity = async (entry: RewardEntry) => {
        setBusyId(entry.id);
        try {
            const sets = await fetchAllSets();
            const set = sets[entry.wonFromSetIndex];
            if (!set) {
                // Can't resolve the source set — claim it anyway so it doesn't
                // wedge the ledger (no cards granted).
                claimRewardEntry(entry.id, { grantedCardIds: [] });
                return;
            }
            const setCards = await fetchCardsInSet(set.set_name);
            const cards: PulledCard[] = [];
            for (let i = 0; i < 3; i++) {
                cards.push(...generateBoosterPack(setCards, set));
            }
            addToCollection(cards);
            claimRewardEntry(entry.id, { grantedCardIds: cards.map((c) => c.id) });
        } finally {
            setBusyId(null);
        }
    };

    // --- Text claim: nothing to grant, just acknowledge it ---
    const claimText = (entry: RewardEntry) => {
        claimRewardEntry(entry.id);
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

        if (kind === "pity") {
            return (
                <RewardCard
                    key={entry.id}
                    entry={entry}
                    actionLabel="Open 3 Packs"
                    onAction={() => claimPity(entry)}
                    busy={busyId === entry.id}
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
                busy={busyId === entry.id}
            />
        );
    };

    return (
        <div className="h-full overflow-hidden grid grid-rows-[1fr]">
            <div className="min-h-0 overflow-y-auto custom-scrollbar p-6 md:p-8 pb-16">
                <div className="max-w-3xl mx-auto space-y-8">
                    <header className="text-center">
                        <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)]">
                            Rewards
                        </h1>
                        <p className="text-white/60 text-sm mt-1">
                            Claim what you&apos;ve earned on the road through history.
                        </p>
                    </header>

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
        </div>
    );
}
