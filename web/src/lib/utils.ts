import { Card } from "./api";

export const RARITY_ORDER = [
    "Common",
    "Rare",
    "Super Rare",
    "Ultra Rare",
    "Secret Rare"
];

export function getCardRarity(card: Card, setCodePrefix?: string): string {
    // Find rarity for this set
    const setInfo = setCodePrefix
        ? card.card_sets?.find(s => s.set_code.split('-')[0] === setCodePrefix)
        : card.card_sets?.[0];

    let rarity = setInfo?.set_rarity || "Common";

    // Merge Short Prints into Common
    if (rarity === "Short Print" || rarity === "Super Short Print" || rarity === "SP") {
        rarity = "Common";
    }

    return rarity;
}

export function sortCardsByRarity(cards: Card[], setCodePrefix?: string): Card[] {
    return [...cards].sort((a, b) => {
        const rarityA = getCardRarity(a, setCodePrefix);
        const rarityB = getCardRarity(b, setCodePrefix);

        const indexA = RARITY_ORDER.indexOf(rarityA);
        const indexB = RARITY_ORDER.indexOf(rarityB);

        // If rarity is same, sort by name
        if (indexA === indexB) {
            return a.name.localeCompare(b.name);
        }

        // Sort by rarity index (Common -> Secret)
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
}

/** Prefix a file from /public with the site's base path (needed when hosted under a subfolder, e.g. GitHub Pages). */
export const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
