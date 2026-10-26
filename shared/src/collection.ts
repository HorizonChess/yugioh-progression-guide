/**
 * A save's owned cards: copy counts keyed by `${id}_${setCode}_${rarity}`, so the
 * same card pulled from different sets/rarities is tracked separately. Cards
 * imported without set info (YDK import, legacy saves) use UNKNOWN_SET/Common.
 */
export type Collection = Record<string, number>;

export const UNKNOWN_SET = "Unknown";

export interface CollectionEntry {
    id: number;
    setCode: string;
    rarity: string;
}

export function collectionKey(id: number, setCode = UNKNOWN_SET, rarity = "Common"): string {
    return `${id}_${setCode}_${rarity}`;
}

/** Splits a collection key back into its parts; null if the id isn't numeric. */
export function parseCollectionKey(key: string): CollectionEntry | null {
    const [idStr = "", setCode = UNKNOWN_SET, rarity = "Common"] = key.split("_");
    const id = parseInt(idStr, 10);
    return Number.isNaN(id) ? null : { id, setCode, rarity };
}

/** Total copies owned per card id, across every set/rarity variant. */
export function ownedCountsById(collection: Collection): Map<number, number> {
    const counts = new Map<number, number>();
    for (const [key, count] of Object.entries(collection)) {
        const entry = parseCollectionKey(key);
        if (entry) counts.set(entry.id, (counts.get(entry.id) ?? 0) + count);
    }
    return counts;
}

/** The distinct card ids in a collection. */
export function ownedCardIds(collection: Collection): number[] {
    return Array.from(ownedCountsById(collection).keys());
}
