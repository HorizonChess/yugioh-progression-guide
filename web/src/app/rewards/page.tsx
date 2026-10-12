"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, fetchTournamentSets, fetchCardsInSet, fetchCardsByIds, Card, PulledCard } from "@/lib/api";
import { RewardEntry, resolvePrizeKind, PrizeKind, claimedCardId } from "@/lib/rewards";
import { useEffect, useMemo, useState } from "react";
import StonePanel from "@/components/ui/StonePanel";
import GuideSprite from "@/components/layout/GuideSprite";
import RewardCard from "@/components/rewards/RewardCard";
import PackRevealModal, { RevealSource } from "@/components/rewards/PackRevealModal";
import WildcardModal from "@/components/rewards/WildcardModal";
import StarlightSearchModal from "@/components/rewards/StarlightSearchModal";
import BanInput from "@/components/rewards/BanInput";
import CardDetailModal from "@/components/card/CardDetailModal";

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
 *  - wildcard    → the `WildcardModal`: pick any card of the reward's rarity or
 *                  below from the won pack.
 *  - ban / unban → the `BanInput` typeahead (cosmetic: the deck builder reads
 *                  `bannedCardIds` and blocks/greys the add).
 *  - starlight   → the `StarlightSearchModal`: a full-catalog typeahead gated to
 *                  cards released before the won pack, granted at Starlight Rare.
 * Snatch-steal is the only prize still locked (pending multiplayer).
 */

/** Prize kinds whose claim modal isn't built yet (shown available, disabled). */
const COMING_SOON: Record<PrizeKind, string | null> = {
    text: null,
    pity: null,
    tournament: null,
    wildcard: null,
    starlight: null,
    ban: null,
    unban: null,
    snatch: "Requires multiplayer — coming soon",
};

export default function RewardsPage() {
    const { rewards, claimRewardEntry, addToCollection, banCard, unbanCard, bannedCardIds } = useProgression();
    /** The reward whose 3-pack reveal modal is open (pity or tournament), if any. */
    const [revealEntry, setRevealEntry] = useState<RewardEntry | null>(null);
    /** The reward whose wildcard card-picker modal is open, if any. */
    const [wildcardEntry, setWildcardEntry] = useState<RewardEntry | null>(null);
    /** The reward whose starlight full-catalog search modal is open, if any. */
    const [starlightEntry, setStarlightEntry] = useState<RewardEntry | null>(null);
    /** The reward whose ban/unban typeahead is open, if any. */
    const [banEntry, setBanEntry] = useState<RewardEntry | null>(null);
    /** A claimed reward's picked card, opened in a read-only detail modal. */
    const [inspectCard, setInspectCard] = useState<Card | null>(null);

    const available = rewards.filter((r) => r.status === "available");
    const claimed = rewards.filter((r) => r.status === "claimed");

    // Resolve each claimed single-pick reward's card (wildcard/ban/snatch) so the
    // ledger can show its image. Pack rewards have no single pick (see claimedCardId).
    const claimedCardIds = useMemo(
        () =>
            Array.from(
                new Set(
                    claimed
                        .map((e) => claimedCardId(e))
                        .filter((id): id is number => id != null)
                )
            ),
        [claimed]
    );
    const [pickedCards, setPickedCards] = useState<Record<number, Card>>({});
    useEffect(() => {
        const missing = claimedCardIds.filter((id) => !pickedCards[id]);
        if (missing.length === 0) return;
        let cancelled = false;
        fetchCardsByIds(missing).then((cards) => {
            if (cancelled || cards.length === 0) return;
            setPickedCards((prev) => {
                const next = { ...prev };
                for (const c of cards) next[c.id] = c;
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [claimedCardIds, pickedCards]);

    /** The resolved card + opened-count a claimed entry shows in its ledger row. */
    const claimedExtras = (entry: RewardEntry) => {
        const id = claimedCardId(entry);
        return {
            pickedCard: id != null ? pickedCards[id] ?? null : null,
            packCount: entry.grantedCardIds?.length,
        };
    };

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

    // --- Wildcard: grant the single chosen card and claim the reward ---
    const chooseWildcard = (card: PulledCard) => {
        if (!wildcardEntry) return;
        addToCollection([card]);
        claimRewardEntry(wildcardEntry.id, { grantedCardId: card.id });
        setWildcardEntry(null);
    };

    // --- Starlight: grant the single searched card and claim the reward ---
    const chooseStarlight = (card: PulledCard) => {
        if (!starlightEntry) return;
        addToCollection([card]);
        claimRewardEntry(starlightEntry.id, { grantedCardId: card.id });
        setStarlightEntry(null);
    };

    // --- Ban / Unban: mark (or unmark) the card cosmetically and claim ---
    const pickBanTarget = (card: Card) => {
        if (!banEntry) return;
        const kind = resolvePrizeKind(banEntry.prizeId);
        if (kind === "ban") banCard(card.id);
        else unbanCard(card.id);
        claimRewardEntry(banEntry.id, { bannedCardId: card.id });
        setBanEntry(null);
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

        if (kind === "wildcard") {
            return (
                <RewardCard
                    key={entry.id}
                    entry={entry}
                    actionLabel="Choose Card"
                    onAction={() => setWildcardEntry(entry)}
                />
            );
        }

        if (kind === "starlight") {
            return (
                <RewardCard
                    key={entry.id}
                    entry={entry}
                    actionLabel="Search Card"
                    onAction={() => setStarlightEntry(entry)}
                />
            );
        }

        if (kind === "ban" || kind === "unban") {
            return (
                <RewardCard
                    key={entry.id}
                    entry={entry}
                    actionLabel={kind === "ban" ? "Ban a Card" : "Unban a Card"}
                    onAction={() => setBanEntry(entry)}
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
                                    <RewardCard
                                        key={entry.id}
                                        entry={entry}
                                        {...claimedExtras(entry)}
                                        onPickedCardClick={setInspectCard}
                                    />
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

            {wildcardEntry && (
                <WildcardModal
                    entry={wildcardEntry}
                    onChoose={chooseWildcard}
                    onClose={() => setWildcardEntry(null)}
                />
            )}

            {starlightEntry && (
                <StarlightSearchModal
                    entry={starlightEntry}
                    onChoose={chooseStarlight}
                    onClose={() => setStarlightEntry(null)}
                />
            )}

            {banEntry && (
                <BanInput
                    mode={resolvePrizeKind(banEntry.prizeId) === "unban" ? "unban" : "ban"}
                    bannedCardIds={bannedCardIds}
                    onPick={pickBanTarget}
                    onClose={() => setBanEntry(null)}
                />
            )}

            {inspectCard && (
                <CardDetailModal card={inspectCard} onClose={() => setInspectCard(null)} />
            )}
        </div>
    );
}
