import { canonicalCardIds } from "@ygo/shared";

/**
 * The deck you're building, kept in this browser per save slot, so a reload or a
 * trip to another page brings it back as you left it. Card ids only; the deck
 * builder fetches the cards. Storage blocked → nothing is kept, nothing breaks.
 */

export interface DeckDraft {
    name: string;
    mainDeck: number[];
    extraDeck: number[];
    sideDeck: number[];
}

const key = (seriesId: string) => `deckDraft:${seriesId}`;

// Each under its one id: a draft from before one id per card may hold another.
const ids = (v: unknown): number[] => (Array.isArray(v) ? canonicalCardIds(v.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)) : []);

export function readDeckDraft(seriesId: string): DeckDraft | null {
    try {
        const raw = localStorage.getItem(key(seriesId));
        if (!raw) return null;
        const v = JSON.parse(raw) as unknown;
        if (typeof v !== "object" || v === null) return null;
        const d = v as Record<string, unknown>;
        return {
            name: typeof d.name === "string" ? d.name : "New Deck",
            mainDeck: ids(d.mainDeck),
            extraDeck: ids(d.extraDeck),
            sideDeck: ids(d.sideDeck),
        };
    } catch {
        return null;
    }
}

export function writeDeckDraft(seriesId: string, draft: DeckDraft): void {
    try {
        localStorage.setItem(key(seriesId), JSON.stringify(draft));
    } catch {
        // Storage blocked or full: the draft just isn't kept.
    }
}
