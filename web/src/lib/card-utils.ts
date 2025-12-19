import { Card } from "@/lib/api";
import { RARITY_ORDER, getCardRarity } from "@/lib/utils";

/**
 * Processes cards for grid display by grouping by rarity and counting duplicates.
 * Used by pack opener for summary and details views.
 */
export function processCardsForRarityGrid(
    cards: Card[],
    setCode: string
): { cardsByRarity: Record<string, { card: Card, count: number }[]>, sortedRarities: string[] } {
    // 1. Group by ID to count duplicates
    const countedCards = new Map<number, { card: Card, count: number }>();
    cards.forEach(card => {
        if (countedCards.has(card.id)) {
            countedCards.get(card.id)!.count++;
        } else {
            countedCards.set(card.id, { card, count: 1 });
        }
    });

    // 2. Group by Rarity
    const cardsByRarity: Record<string, { card: Card, count: number }[]> = {};

    // Convert Map values to array
    const uniqueCardsWithCounts = Array.from(countedCards.values());
    const setPrefix = setCode.split('-')[0];

    // Sort by rarity first, then name
    uniqueCardsWithCounts.sort((a, b) => {
        const rarityA = getCardRarity(a.card, setPrefix);
        const rarityB = getCardRarity(b.card, setPrefix);

        const indexA = RARITY_ORDER.indexOf(rarityA);
        const indexB = RARITY_ORDER.indexOf(rarityB);
        const rDiff = (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        if (rDiff !== 0) return rDiff;

        return a.card.name.localeCompare(b.card.name);
    });

    uniqueCardsWithCounts.forEach(item => {
        const rarity = getCardRarity(item.card, setPrefix);
        if (!cardsByRarity[rarity]) {
            cardsByRarity[rarity] = [];
        }
        cardsByRarity[rarity].push(item);
    });

    const sortedRarities = Object.keys(cardsByRarity).sort((a, b) => {
        const indexA = RARITY_ORDER.indexOf(a);
        const indexB = RARITY_ORDER.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return { cardsByRarity, sortedRarities };
}
