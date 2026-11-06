"use client";

import type { Card, CardSet } from "@/lib/api";
import CardGallery, { type GalleryItem } from "@/components/card/CardGallery";
import { printedIn } from "@/components/packs/stage/plate";
import { useEffect } from "react";
import { cardTip, setDetails } from "@/lib/guide/lines";
import { guide, seed } from "@/lib/guide/store";

/** The card's rarity as printed in `set`. */
const rarityIn = (c: Card, set: CardSet) => c.card_sets?.find((p) => p.set_name === set.set_name)?.set_rarity;

/**
 * Every card in the set, under its rarity band, from the pack screen. Cards you
 * own show how many; the ones you don't are dimmed.
 */
export default function SetCardList({ set, cards, ownedCount, onBack, stage }: {
    set: CardSet;
    cards: Card[];
    ownedCount: (id: number) => number;
    onBack: () => void;
    /** The player's stage in the series: Yugi compares cards against what's in the packs by then. */
    stage: number;
}) {
    // Opening the list: Yugi on what the set brings, or on what you have and haven't found yet.
    useEffect(() => {
        if (!cards.length) return;
        const line = setDetails(set.set_code, set.set_name, cards.map((c) => ({ id: c.id, name: c.name, rarity: rarityIn(c, set) })), ownedCount, stage, seed());
        const t = setTimeout(() => guide.say(line), 600);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per list
    }, [set.set_code, cards.length]);
    const items: GalleryItem[] = cards
        .map((c) => {
            const n = ownedCount(c.id);
            return { key: String(c.id), card: printedIn(c, set.set_code, n, n ? `Owned ×${n}` : "Not owned yet"), count: n, dim: n === 0 };
        })
        .sort((a, b) => a.card.card.name.localeCompare(b.card.card.name));
    const owned = items.filter((i) => i.count > 0).length;

    return (
        <div className="haul">
            <header className="haul__head">
                <button onClick={onBack} className="store__back haul__backtop">‹ Back to the pack</button>
                <p className="store__stage">Card list</p>
                <h1>{set.set_name}</h1>
                <p className="store__meta">{cards.length} cards · you own {owned}</p>
            </header>
            <CardGallery items={items} countCopies={false} onLook={(c) => guide.say(cardTip(c, stage, seed()))} empty={<p className="store__note">Loading the card list…</p>} />
        </div>
    );
}
