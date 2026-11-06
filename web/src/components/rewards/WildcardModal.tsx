"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardSet, PulledCard, fetchAllSets, fetchCardsInSet } from "@/lib/api";
import { RewardEntry, getPrize, wildcardRarityFloor, isRarityAtOrBelow } from "@/lib/rewards";
import { getCardRarity } from "@/lib/utils";
import { useProgression } from "@/context/ProgressionContext";
import { ownedCountsById } from "@/lib/collection";
import CardGallery, { type GalleryItem } from "@/components/card/CardGallery";
import { CardCloseUp } from "@/components/card/CardPlate";
import { printedIn } from "@/components/packs/stage/plate";
import CartoucheButton from "@/components/ui/CartoucheButton";
import RewardRite, { RiteNote } from "@/components/rewards/RewardRite";

interface WildcardModalProps {
    entry: RewardEntry;
    /** Grant the chosen card + mark the reward claimed, then the modal closes. */
    onChoose: (card: PulledCard) => void;
    onClose: () => void;
}

/**
 * The Wildcard reward claim. Shows the card list of the pack the reward was won
 * from (`sets[wonFromSetIndex]`) under its rarity bands, with only the rarities at
 * or below the wildcard's ceiling shown and pickable (`wildcardRarityFloor` +
 * `isRarityAtOrBelow`). Picking a card opens its close-up
 * to confirm (a wildcard is a one-shot pick: a stray tap shouldn't burn it), then
 * grants it as a PulledCard of its rarity in this set.
 *
 * Starlight (`wildcard-starlight`) is NOT handled here: it searches the full
 * catalog in its own flow.
 */
export default function WildcardModal({ entry, onChoose, onClose }: WildcardModalProps) {
    const { collection } = useProgression();
    const [set, setSet] = useState<CardSet | null>(null);
    const [cards, setCards] = useState<Card[]>([]);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [pending, setPending] = useState<GalleryItem | null>(null);

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

    const setPrefix = set?.set_code.split("-")[0] ?? "";
    // The set's cards the wildcard covers.
    const items = useMemo<GalleryItem[]>(() => {
        if (!set) return [];
        const owned = ownedCountsById(collection);
        return cards
            .map((c) => {
                const n = owned.get(c.id) ?? 0;
                return { key: String(c.id), card: printedIn(c, set.set_code, n, n ? `You own ×${n}` : "Not owned yet"), count: 0, dim: !isRarityAtOrBelow(getCardRarity(c, setPrefix), ceiling) };
            })
            // Only what the wildcard covers, as before: rarer cards aren't shown.
            .filter((i) => !i.dim)
            .sort((a, b) => a.card.code.localeCompare(b.card.code, undefined, { numeric: true }));
    }, [cards, set, collection, ceiling, setPrefix]);

    const confirmChoice = () => {
        if (!pending || !set) return;
        const card = pending.card.card;
        onChoose({ ...card, pulled_rarity: getCardRarity(card, setPrefix), pulled_set_code: set.set_code });
    };

    return (
        <RewardRite
            prizeId={entry.prizeId}
            kicker={set ? `Won on the ${set.set_name} wheel` : "Wildcard"}
            title={prizeLabel}
            lead={<>Choose any <b>{ceiling}</b> or lower card{set ? ` from ${set.set_name}` : ""}.</>}
            onClose={onClose}
        >
            {status === "error" ? (
                <RiteNote>Couldn&apos;t load the pack. Close it and try again.</RiteNote>
            ) : status === "loading" ? (
                <RiteNote pulse>Laying out the cards…</RiteNote>
            ) : (
                <CardGallery items={items} countCopies={false} onOpen={setPending} />
            )}
            {pending && (
                <CardCloseUp
                    card={pending.card}
                    onClose={() => setPending(null)}
                    action={
                        <div className="rite__confirm">
                            <CartoucheButton next onClick={confirmChoice}>Add to Collection</CartoucheButton>
                        </div>
                    }
                />
            )}
        </RewardRite>
    );
}
