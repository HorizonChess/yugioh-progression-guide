import type { Card } from "@/lib/api";
import { parseCollectionKey, type Collection } from "@/lib/collection";
import { tierOf, type StageCard } from "@/components/packs/stage/plate";

export type Printing = { setCode: string; rarity: string };

/** The printing you own of each card (the first one in your collection). */
export function ownedPrintings(collection: Collection): Map<number, Printing> {
    const m = new Map<number, Printing>();
    for (const key of Object.keys(collection)) {
        const p = parseCollectionKey(key);
        if (p && !m.has(p.id)) m.set(p.id, { setCode: p.setCode, rarity: p.rarity });
    }
    return m;
}

/** A card for the details plate: your printing's code and rarity, and how many you own. */
export function stageOf(card: Card, printing: Printing | undefined, owned: number): StageCard {
    const print = printing ?? { setCode: card.card_sets?.[0]?.set_code ?? "", rarity: card.card_sets?.[0]?.set_rarity ?? "Common" };
    return { card, image: card.card_images[0]?.image_url ?? "", tier: tierOf(print.rarity), rarity: print.rarity, code: print.setCode, owned, ownedNote: `Owned ×${owned}` };
}
