import { Card } from "@/lib/api";

/** The three deck sections a card can sit in. */
export type DeckZone = "main" | "extra" | "side";

/** Where a drag started: a deck section or the collection search panel. */
export type DragSource = DeckZone | "search";

/** What's carried in a card drag's dataTransfer. */
export interface DragPayload {
    cardId: number;
    from: DragSource;
    /** Position in the source deck; absent when dragged from search. */
    index?: number;
}

export const DRAG_MIME = "application/json";

const DRAG_SOURCES: readonly DragSource[] = ["main", "extra", "side", "search"];

/** Reads and validates a card drag's payload; null for foreign or malformed drops. */
export function parseDragPayload(dataTransfer: DataTransfer): DragPayload | null {
    let data: unknown;
    try {
        data = JSON.parse(dataTransfer.getData(DRAG_MIME)) as unknown;
    } catch {
        return null;
    }
    if (typeof data !== "object" || data === null) return null;
    const { cardId, from, index } = data as Record<string, unknown>;
    if (typeof cardId !== "number") return null;
    const source = DRAG_SOURCES.find((s) => s === from);
    if (!source) return null;
    return { cardId, from: source, index: typeof index === "number" ? index : undefined };
}

/**
 * Checks if a card belongs in the Extra Deck (Fusion, Synchro, XYZ, Link).
 */
export function isExtraDeckCard(card: Card): boolean {
    return card.type.includes("Fusion") ||
           card.type.includes("Synchro") ||
           card.type.includes("XYZ") ||
           card.type.includes("Link");
}

/**
 * Removes a card from a deck array at the given index and returns the new array.
 */
export function removeCardFromDeck(deck: Card[], index: number): Card[] {
    const newDeck = [...deck];
    newDeck.splice(index, 1);
    return newDeck;
}

/**
 * Sorts cards by category (Monsters → Spells → Traps), then alphabetically.
 */
export function sortDeckCards(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => {
        const getCategory = (card: Card) => {
            if (card.type.includes("Spell")) return 1;
            if (card.type.includes("Trap")) return 2;
            return 0; // Monster
        };

        const catA = getCategory(a);
        const catB = getCategory(b);

        if (catA !== catB) return catA - catB;
        return a.name.localeCompare(b.name);
    });
}
