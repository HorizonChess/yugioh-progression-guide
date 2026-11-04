import type { Card } from './types';

export const DECK_LIMITS = { main: 60, extra: 15, side: 15, copies: 3 } as const;

export function isExtraDeckCard(card: Card): boolean {
    return ['Fusion', 'Synchro', 'XYZ', 'Link'].some((t) => card.type.includes(t));
}

export interface DeckLists {
    mainDeck: number[];
    extraDeck: number[];
    sideDeck: number[];
}

/** Why a deck can't be saved, or null. A main deck under 40 is allowed (the builder warns). */
export function deckProblem(
    deck: DeckLists,
    cards: ReadonlyMap<number, Card>,
    owned: ReadonlyMap<number, number>,
    banned: ReadonlySet<number>,
): string | null {
    if (deck.mainDeck.length > DECK_LIMITS.main) return `The main deck holds at most ${DECK_LIMITS.main} cards`;
    if (deck.extraDeck.length > DECK_LIMITS.extra) return `The extra deck holds at most ${DECK_LIMITS.extra} cards`;
    if (deck.sideDeck.length > DECK_LIMITS.side) return `The side deck holds at most ${DECK_LIMITS.side} cards`;

    const copies = new Map<number, number>();
    for (const id of [...deck.mainDeck, ...deck.extraDeck, ...deck.sideDeck]) copies.set(id, (copies.get(id) ?? 0) + 1);
    for (const [id, count] of copies) {
        const card = cards.get(id);
        if (!card) return `Unknown card ${id}`;
        if (banned.has(id)) return `${card.name} is banned`;
        if (count > DECK_LIMITS.copies) return `At most ${DECK_LIMITS.copies} copies of ${card.name}`;
        if (count > (owned.get(id) ?? 0)) return `You don't own enough copies of ${card.name}`;
    }
    if (deck.extraDeck.some((id) => !isExtraDeckCard(cards.get(id)!))) return 'Only Extra Deck monsters go in the extra deck';
    if (deck.mainDeck.some((id) => isExtraDeckCard(cards.get(id)!))) return 'Extra Deck monsters cannot go in the main deck';
    return null;
}
