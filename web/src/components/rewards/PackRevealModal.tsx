"use client";

import { useEffect, useState } from "react";
import { CardSet, fetchAllSets, fetchTournamentSets } from "@/lib/api";
import type { Opening } from "@/lib/repo/types";
import type { PrizeId } from "@/lib/rewards";
import { ownedCountsById } from "@/lib/collection";
import { useProgression } from "@/context/ProgressionContext";
import { usePackOpening } from "@/hooks/usePackOpening";
import PackStageView from "@/components/packs/PackStageView";
import OpeningSummary from "@/components/packs/OpeningSummary";
import RewardRite, { RiteNote } from "@/components/rewards/RewardRite";

interface PackRevealModalProps {
    /** A pity or tournament reward's packs, as the repository rolled them. */
    opening: Opening;
    onFlip: (flipped: number[]) => void;
    /** Adds the cards to the collection, then the modal closes. */
    onCollect: () => void;
    onClose: () => void;
}

/**
 * The shared "open 3 packs" reward reveal, in the claiming chamber: the same pack
 * opener as /packs (a tear and a ring on phones, the duel table on wider
 * screens), then the haul with "Add to Collection". Closing keeps the opening, so
 * the rewards page resumes it.
 */
export default function PackRevealModal({ opening, onFlip, onCollect, onClose }: PackRevealModalProps) {
    const { collection } = useProgression();
    const [set, setSet] = useState<CardSet | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const pack = usePackOpening(onFlip);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const sets = [...(await fetchAllSets()), ...(await fetchTournamentSets())];
            const found = sets.find((s) => s.set_name === opening.setName) ?? null;
            if (cancelled) return;
            if (!found) return setStatus("error");
            setSet(found);
            pack.start(opening.packs, opening.flipped);
            setStatus("ready");
        })().catch(() => !cancelled && setStatus("error"));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
    }, [opening.id]);

    const prizeId: PrizeId = opening.source === "tournament" ? "tournament-packs" : "pity-packs";
    const owned = ownedCountsById(collection);

    if (status !== "ready" || !set) {
        return (
            <RewardRite prizeId={prizeId} title={opening.setName} kicker="Opening your packs" onClose={onClose}>
                {status === "error" ? <RiteNote>Couldn&apos;t open your packs. Close this and try again.</RiteNote> : <RiteNote pulse>Preparing your packs…</RiteNote>}
            </RewardRite>
        );
    }

    if (pack.showSummary) {
        return (
            <RewardRite prizeId={prizeId} title={set.set_name} onClose={onClose} bare>
                <div className="rite__scroll custom-scrollbar">
                    <OpeningSummary
                        set={set}
                        cards={pack.allOpenedCards}
                        packCount={pack.packsToOpen.length}
                        ownedCount={(id) => owned.get(id) ?? 0}
                        onSave={onCollect}
                        onBack={onClose}
                        saveLabel="Add to Collection"
                        backLabel="Not now"
                    />
                </div>
            </RewardRite>
        );
    }

    const current = pack.currentPack ?? [];
    // How many of each card the player had before it: the collection, the packs
    // already opened this time, and the cards before it in this pack.
    const ownedBefore = (index: number) => {
        const id = current[index]?.id;
        if (id === undefined) return 0;
        const earlier = [...pack.allOpenedCards, ...current.slice(0, index)].filter((c) => c.id === id).length;
        return (owned.get(id) ?? 0) + earlier;
    };
    return (
        <RewardRite prizeId={prizeId} title={set.set_name} onClose={onClose} bare>
            <PackStageView
                set={set}
                pack={current}
                packIndex={pack.currentPackIndex}
                packCount={pack.packsToOpen.length}
                flippedCards={pack.flippedCards}
                fullyOpened={pack.isPackFullyOpened}
                ownedBefore={ownedBefore}
                onFlip={(index) => pack.flip([index])}
                onNextPack={pack.handleNextPack}
                onOpenAll={pack.handleOpenAll}
                onBack={onClose}
                backLabel="Not now"
            />
        </RewardRite>
    );
}
