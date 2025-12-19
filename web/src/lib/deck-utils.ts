import { Card } from "@/lib/api";

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
