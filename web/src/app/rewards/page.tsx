"use client";

import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { fetchCardsByIds, Card } from "@/lib/api";
import type { Opening } from "@/lib/repo/types";
import { useRouter } from "next/navigation";
import { RewardEntry, resolvePrizeKind, claimedCardId } from "@/lib/rewards";
import { useEffect, useMemo, useState } from "react";
import StonePanel from "@/components/ui/StonePanel";
import GuideSprite from "@/components/layout/GuideSprite";
import RewardCard from "@/components/rewards/RewardCard";
import PackRevealModal from "@/components/rewards/PackRevealModal";
import WildcardModal from "@/components/rewards/WildcardModal";
import StarlightSearchModal from "@/components/rewards/StarlightSearchModal";
import BanInput from "@/components/rewards/BanInput";
import SnatchModal from "@/components/rewards/SnatchModal";
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
 *  - snatch      → the `SnatchModal`: copy a card from the rival's binder, who
 *                  keeps theirs (duo series only; solo wheels leave it off).
 */

const REDOER_NOTE = "Spend it from the pack summary to reroll an opening";

export default function RewardsPage() {
    const { rewards, bannedCardIds, hasLoaded, claimReward, rivalBinder, activeOpening, flip, saveOpening } = useProgression();
    /** The reward whose rival-binder picker is open, if any. */
    const [snatchEntry, setSnatchEntry] = useState<RewardEntry | null>(null);
    const router = useRouter();
    /** The pity or tournament packs being opened, if any. */
    const [revealOpening, setRevealOpening] = useState<Opening | null>(null);
    /** The reward whose wildcard card-picker modal is open, if any. */
    const [wildcardEntry, setWildcardEntry] = useState<RewardEntry | null>(null);
    /** The reward whose starlight full-catalog search modal is open, if any. */
    const [starlightEntry, setStarlightEntry] = useState<RewardEntry | null>(null);
    /** The reward whose ban/unban typeahead is open, if any. */
    const [banEntry, setBanEntry] = useState<RewardEntry | null>(null);
    /** A claimed reward's picked card, opened in a read-only detail modal. */
    const [inspectCard, setInspectCard] = useState<Card | null>(null);

    const available = useMemo(() => rewards.filter((r) => r.status === "available"), [rewards]);
    const claimed = useMemo(() => rewards.filter((r) => r.status === "claimed"), [rewards]);

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

    // A reload mid-reveal comes back to the same packs.
    useEffect(() => {
        if (!hasLoaded) return;
        activeOpening("reward").then((o) => o && setRevealOpening(o)).catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once after loading
    }, [hasLoaded]);

    /** Claims `entry` (with a picked card for single-card prizes) and closes its modal. */
    const claim = async (entry: RewardEntry, cardId: number | undefined, close: () => void, printing?: string) => {
        try {
            const opening = await claimReward(entry.id, cardId, printing);
            close();
            if (opening) setRevealOpening(opening);
        } catch (error) {
            alertRepoError(error);
        }
    };

    const collectReveal = async () => {
        if (!revealOpening) return;
        try {
            await saveOpening(revealOpening.id);
            setRevealOpening(null);
        } catch (error) {
            alertRepoError(error);
        }
    };

    // The claim button for an available entry, by prize kind; null = locked.
    const claimAction = (entry: RewardEntry): { label: string; onClick: () => void } | null => {
        const kind = resolvePrizeKind(entry.prizeId);
        switch (kind) {
            case "pity":
            case "tournament":
                return { label: "Open 3 Packs", onClick: () => claim(entry, undefined, () => undefined) };
            case "wildcard":
                return { label: "Choose Card", onClick: () => setWildcardEntry(entry) };
            case "starlight":
                return { label: "Search Card", onClick: () => setStarlightEntry(entry) };
            case "ban":
            case "unban":
                return { label: kind === "ban" ? "Ban a Card" : "Unban a Card", onClick: () => setBanEntry(entry) };
            case "spin":
                return { label: "Spin the Wheel", onClick: () => router.push(`/record-match?spin=${entry.id}`) };
            case "snatch":
                return { label: "Steal a Card", onClick: () => setSnatchEntry(entry) };
            case "redoer":
                return null;
        }
    };

    const renderAvailable = (entry: RewardEntry) => {
        const action = claimAction(entry);
        return action ? (
            <RewardCard key={entry.id} entry={entry} actionLabel={action.label} onAction={action.onClick} />
        ) : (
            <RewardCard key={entry.id} entry={entry} locked lockedNote={REDOER_NOTE} />
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

            {revealOpening && (
                <PackRevealModal
                    opening={revealOpening}
                    onFlip={(flipped) => void flip(revealOpening.id, flipped).catch(() => undefined)}
                    onCollect={collectReveal}
                    onClose={() => setRevealOpening(null)}
                />
            )}

            {wildcardEntry && (
                <WildcardModal
                    entry={wildcardEntry}
                    onChoose={(card) => claim(wildcardEntry, card.id, () => setWildcardEntry(null))}
                    onClose={() => setWildcardEntry(null)}
                />
            )}

            {starlightEntry && (
                <StarlightSearchModal
                    entry={starlightEntry}
                    onChoose={(card) => claim(starlightEntry, card.id, () => setStarlightEntry(null))}
                    onClose={() => setStarlightEntry(null)}
                />
            )}

            {banEntry && (
                <BanInput
                    mode={resolvePrizeKind(banEntry.prizeId) === "unban" ? "unban" : "ban"}
                    bannedCardIds={bannedCardIds}
                    onPick={(card) => claim(banEntry, card.id, () => setBanEntry(null))}
                    onClose={() => setBanEntry(null)}
                />
            )}

            {snatchEntry && (
                <SnatchModal
                    loadBinder={rivalBinder}
                    onChoose={(printing) => claim(snatchEntry, undefined, () => setSnatchEntry(null), printing)}
                    onClose={() => setSnatchEntry(null)}
                />
            )}

            {inspectCard && (
                <CardDetailModal card={inspectCard} onClose={() => setInspectCard(null)} />
            )}
        </div>
    );
}
