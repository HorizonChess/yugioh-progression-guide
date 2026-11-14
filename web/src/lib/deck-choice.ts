import type { SavedDeck } from "@/lib/storage";

/** When each deck last went into a duel, in this browser (deck id → ms). */
const USED_KEY = "ygo-deck-used";

function used(): Record<string, number> {
    try {
        return JSON.parse(localStorage.getItem(USED_KEY) ?? "{}") as Record<string, number>;
    } catch {
        return {};
    }
}

/** A deck went into a duel: it's the one offered first next time (unless another is saved after). */
export function markDeckUsed(id: string) {
    localStorage.setItem(USED_KEY, JSON.stringify({ ...used(), [id]: Date.now() }));
}

/** The deck to offer first: the one saved or used most recently (`createdAt` is renewed on every save). */
export function latestDeck(decks: SavedDeck[]): SavedDeck | undefined {
    if (typeof window === "undefined") return decks[0];
    const at = used();
    const when = (d: SavedDeck) => Math.max(d.createdAt ?? 0, at[d.id] ?? 0);
    return decks.reduce<SavedDeck | undefined>((best, d) => (!best || when(d) > when(best) ? d : best), undefined);
}
