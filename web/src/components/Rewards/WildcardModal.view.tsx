"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardSet, PulledCard, fetchAllSets, fetchCardsInSet } from "@/lib/api";
import { RewardEntry, getPrize, wildcardRarityFloor, isRarityAtOrBelow } from "@/lib/rewards";
import { getCardRarity } from "@/lib/utils";
import { processCardsForRarityGrid } from "@/lib/card-utils";
import { useCardTooltip } from "@/hooks/useCardTooltip";
import Modal from "@/components/ui/Modal.view";
import PackDetails from "@/components/PackOpener/PackDetails.view";
import CardTooltip from "@/components/card/CardTooltip.view";
import FrameButton from "@/components/ui/FrameButton.view";

interface WildcardModalProps {
    entry: RewardEntry;
    /** Grant the chosen card + mark the reward claimed, then the modal closes. */
    onChoose: (card: PulledCard) => void;
    onClose: () => void;
}

/**
 * The Wildcard reward claim. Shows the card list of the pack the reward was won
 * from (`sets[wonFromSetIndex]`) via the shared `PackDetails`, with only the
 * rarities at or below the wildcard's ceiling selectable (`wildcardRarityFloor`
 * + `isRarityAtOrBelow`). Picking a card asks for confirmation (a wildcard is a
 * one-shot pick — a stray click shouldn't burn it), then grants it as a
 * PulledCard of its rarity in this set.
 *
 * Starlight (`wildcard-starlight`) is NOT handled here — it searches the full
 * catalog and is routed to its own flow in Phase 6.
 */
export default function WildcardModal({ entry, onChoose, onClose }: WildcardModalProps) {
    const [set, setSet] = useState<CardSet | null>(null);
    const [cards, setCards] = useState<Card[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [pending, setPending] = useState<Card | null>(null);

    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();

    const ceiling = wildcardRarityFloor(entry.prizeId);
    const prizeLabel = getPrize(entry.prizeId)?.label ?? "Wildcard";

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const sets = await fetchAllSets();
                const chosen = sets[entry.wonFromSetIndex] ?? null;
                if (!chosen) {
                    if (!cancelled) setStatus("error");
                    return;
                }
                const fetched = await fetchCardsInSet(chosen.set_name);
                if (cancelled) return;
                if (!fetched.length) {
                    setStatus("error");
                    return;
                }
                setSet(chosen);
                setCards(fetched);
                setStatus("ready");
            } catch {
                if (!cancelled) setStatus("error");
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry.id]);

    // Rarity sections the grid will show, kept to the wildcard's ceiling or below.
    const selectableRarities = useMemo(() => {
        if (!set) return new Set<string>();
        const { sortedRarities } = processCardsForRarityGrid(cards, set.set_code);
        return new Set(sortedRarities.filter((r) => isRarityAtOrBelow(r, ceiling)));
    }, [cards, set, ceiling]);

    const panelClassName =
        "relative w-full max-w-6xl h-[85vh] max-h-[820px] bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col";

    if (status !== "ready" || !set) {
        return (
            <Modal onClose={onClose} panelClassName={panelClassName} showCloseButton>
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                    {status === "error" ? (
                        <div>
                            <p className="text-xl font-bold text-white mb-2">Couldn&apos;t load the pack.</p>
                            <p className="text-white/60 text-sm">Please close and try again.</p>
                        </div>
                    ) : (
                        <div className="text-xl animate-pulse text-white/80">Loading cards…</div>
                    )}
                </div>
            </Modal>
        );
    }

    const setPrefix = set.set_code.split("-")[0];

    const confirmChoice = () => {
        if (!pending) return;
        const rarity = getCardRarity(pending, setPrefix);
        const granted: PulledCard = {
            ...pending,
            pulled_rarity: rarity,
            pulled_set_code: set.set_code,
        };
        onChoose(granted);
    };

    return (
        <Modal onClose={onClose} panelClassName={panelClassName} showCloseButton>
            {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}

            {/* Header — what to do + the rarity ceiling */}
            <div className="shrink-0 px-6 py-4 border-b border-white/10">
                <h2 className="text-2xl font-black text-white">{prizeLabel}</h2>
                <p className="text-primary text-sm font-bold">
                    Choose any <span className="uppercase tracking-wide">{ceiling}</span> or lower card from {set.set_name}.
                </p>
            </div>

            {/* The set's card list — only eligible rarities are shown/pickable */}
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6">
                <PackDetails
                    set={set}
                    cards={cards}
                    onCardClick={setPending}
                    onHover={onHover}
                    onLeave={onLeave}
                    selectableRarities={selectableRarities}
                    selectedCardId={pending?.id}
                />
            </div>

            {/* Confirm bar — a wildcard is one-shot, so confirm before granting */}
            {pending && (
                <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-t border-white/10 bg-black/30">
                    <div className="min-w-0">
                        <p className="text-white font-bold truncate">{pending.name}</p>
                        <p className="text-white/60 text-xs uppercase tracking-wide">{getCardRarity(pending, setPrefix)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={() => setPending(null)}
                            className="h-11 px-5 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 transition-colors text-sm font-bold uppercase tracking-wider"
                        >
                            Cancel
                        </button>
                        <FrameButton
                            onClick={confirmChoice}
                            className="h-11 px-5"
                            textClassName="tracking-[0.1em] text-[0.72rem]"
                        >
                            Add to Collection
                        </FrameButton>
                    </div>
                </div>
            )}
        </Modal>
    );
}
