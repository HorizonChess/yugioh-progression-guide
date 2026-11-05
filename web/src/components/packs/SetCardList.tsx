"use client";

import type { Card, CardSet } from "@/lib/api";
import CardGallery, { type GalleryItem } from "@/components/card/CardGallery";
import { printedIn } from "@/components/packs/stage/plate";

/**
 * Every card in the set, under its rarity band, from the pack screen. Cards you
 * own show how many; the ones you don't are dimmed.
 */
export default function SetCardList({ set, cards, ownedCount, onBack }: { set: CardSet; cards: Card[]; ownedCount: (id: number) => number; onBack: () => void }) {
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
            <CardGallery items={items} countCopies={false} empty={<p className="store__note">Loading the card list…</p>} />
        </div>
    );
}
