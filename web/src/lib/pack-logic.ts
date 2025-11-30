import { Card } from './api';

// Booster Pack Logic

export interface PackResult {
    cards: Card[];
}

const RARITY_WEIGHTS = {
    'Secret Rare': 0.04, // ~1 in 23-24
    'Ultra Rare': 0.08,  // ~1 in 12
    'Super Rare': 0.16,  // ~1 in 6
    'Rare': 1.0          // Guaranteed if nothing else
};

export function generateBoosterPack(setCards: Card[], setPrefix: string): Card[] {
    const pack: Card[] = [];

    // Group cards by rarity using strict set-based filtering
    const commons = setCards.filter(c => isRarity(c, 'Common', setPrefix) || isRarity(c, 'Short Print', setPrefix));
    const rares = setCards.filter(c => isRarity(c, 'Rare', setPrefix));
    const superRares = setCards.filter(c => isRarity(c, 'Super Rare', setPrefix));
    const ultraRares = setCards.filter(c => isRarity(c, 'Ultra Rare', setPrefix));
    const secretRares = setCards.filter(c => isRarity(c, 'Secret Rare', setPrefix));

    // 1. Add 8 Commons (or Short Prints)
    for (let i = 0; i < 8; i++) {
        if (commons.length > 0) {
            pack.push(getRandomCard(commons));
        }
    }

    // 2. Add 1 Rare or Foil
    const roll = Math.random();
    let rareSlotCard: Card | null = null;

    // Adjusted weights for realism (approximate hobby box ratios)
    // Secret Rare: ~1:24 packs (0.04)
    // Ultra Rare: ~1:12 packs (0.08)
    // Super Rare: ~1:6 packs (0.16)
    // Rare: Remainder (guaranteed if no foil)

    if (secretRares.length > 0 && roll < RARITY_WEIGHTS['Secret Rare']) {
        rareSlotCard = getRandomCard(secretRares);
    } else if (ultraRares.length > 0 && roll < (RARITY_WEIGHTS['Secret Rare'] + RARITY_WEIGHTS['Ultra Rare'])) {
        rareSlotCard = getRandomCard(ultraRares);
    } else if (superRares.length > 0 && roll < (RARITY_WEIGHTS['Secret Rare'] + RARITY_WEIGHTS['Ultra Rare'] + RARITY_WEIGHTS['Super Rare'])) {
        rareSlotCard = getRandomCard(superRares);
    } else if (rares.length > 0) {
        rareSlotCard = getRandomCard(rares);
    } else {
        // Fallback: if no rares defined for this set, fill with common
        rareSlotCard = getRandomCard(commons);
    }

    if (rareSlotCard) {
        pack.push(rareSlotCard);
    }

    return pack;
}

// Helper to check rarity strictly within the current set
function isRarity(card: Card, rarity: string, setPrefix: string): boolean {
    if (!card.card_sets) return false;

    // Find the printing in this specific set
    const setPrinting = card.card_sets.find(s => s.set_code.startsWith(setPrefix));

    if (!setPrinting) return false;

    // Check if the rarity matches
    // API returns things like "Common", "Rare", "Super Rare", "Short Print"
    return setPrinting.set_rarity === rarity;
}

function getRandomCard(cards: Card[]): Card {
    if (cards.length === 0) return {} as Card; // Should be handled by caller, but safety first
    const index = Math.floor(Math.random() * cards.length);
    return cards[index];
}
