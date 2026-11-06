"use client";

import { useEffect, useState } from "react";
import { fetchCardsByIds } from "@/lib/api";
import { parseCollectionKey, ownedCountsById, type Collection } from "@/lib/collection";
import { useProgression } from "@/context/ProgressionContext";
import CardGallery, { type GalleryItem } from "@/components/card/CardGallery";
import { CardCloseUp } from "@/components/card/CardPlate";
import { tierOf } from "@/components/packs/stage/plate";
import CartoucheButton from "@/components/ui/CartoucheButton";
import RewardRite, { RiteNote } from "@/components/rewards/RewardRite";

interface SnatchModalProps {
    /** The rival's binder: copy counts by collection key. */
    loadBinder: () => Promise<Collection>;
    /** Takes one copy of the picked printing. */
    onChoose: (printing: string) => void;
    onClose: () => void;
    rivalName?: string;
    /** Which set's wheel it was won on, for the heading. */
    wonFrom?: string;
}

/**
 * Snatch Steal: every printing in the rival's binder under its rarity band, with
 * how many copies they hold. Tap one, confirm in its close-up, and you get a copy;
 * the rival keeps theirs.
 */
export default function SnatchModal({ loadBinder, onChoose, onClose, rivalName = "Your rival", wonFrom }: SnatchModalProps) {
    const { collection } = useProgression();
    const [items, setItems] = useState<GalleryItem[] | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [pending, setPending] = useState<GalleryItem | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const binder = await loadBinder();
                const entries = Object.entries(binder).flatMap(([key, count]) => {
                    const entry = parseCollectionKey(key);
                    return entry && count > 0 ? [{ key, count, ...entry }] : [];
                });
                const cards = new Map((await fetchCardsByIds(entries.map((e) => e.id))).map((c) => [c.id, c]));
                const mine = ownedCountsById(collection);
                const shown = entries.flatMap(({ key, count, id, setCode, rarity }): GalleryItem[] => {
                    const card = cards.get(id);
                    if (!card) return [];
                    const n = mine.get(id) ?? 0;
                    return [{
                        key, count,
                        card: { card, image: card.card_images[0]?.image_url ?? "", tier: tierOf(rarity), rarity, code: setCode, owned: n, ownedNote: n ? `You own ×${n}` : "Not in your binder" },
                    }];
                });
                if (!cancelled) setItems(shown.sort((a, b) => a.card.card.name.localeCompare(b.card.card.name)));
            } catch (error) {
                if (!cancelled) setFailed(error instanceof Error ? error.message : "Couldn't open your rival's binder.");
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- read the binder once, when opened
    }, []);

    return (
        <RewardRite
            prizeId="snatch-steal"
            kicker={wonFrom ? `Won on the ${wonFrom} wheel` : undefined}
            title={`${rivalName}'s binder`}
            lead="Pick any card to get a copy of it. They keep theirs."
            onClose={onClose}
        >
            {failed ? (
                <RiteNote>{failed}</RiteNote>
            ) : !items ? (
                <RiteNote pulse>Opening the binder…</RiteNote>
            ) : (
                <CardGallery items={items} onOpen={setPending} empty={<RiteNote>{rivalName}&apos;s binder is empty.</RiteNote>} />
            )}

            {pending && (
                <CardCloseUp
                    card={pending.card}
                    onClose={() => setPending(null)}
                    action={
                        <div className="rite__confirm">
                            <CartoucheButton next onClick={() => onChoose(pending.key)}>Snatch It</CartoucheButton>
                            <p>{rivalName} holds ×{pending.count}</p>
                        </div>
                    }
                />
            )}
        </RewardRite>
    );
}
