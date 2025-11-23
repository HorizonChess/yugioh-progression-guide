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

export function generateBoosterPack(setCards: Card[]): Card[] {
    const pack: Card[] = [];

    // Group cards by rarity
    const commons = setCards.filter(c => isRarity(c, 'Common') || isRarity(c, 'Short Print'));
    const rares = setCards.filter(c => isRarity(c, 'Rare'));
    const superRares = setCards.filter(c => isRarity(c, 'Super Rare'));
    const ultraRares = setCards.filter(c => isRarity(c, 'Ultra Rare'));
    const secretRares = setCards.filter(c => isRarity(c, 'Secret Rare'));

    // 1. Add 8 Commons
    for (let i = 0; i < 8; i++) {
        if (commons.length > 0) {
            pack.push(getRandomCard(commons));
        }
    }

    // 2. Add 1 Rare or Foil
    const roll = Math.random();
    let rareSlotCard: Card | null = null;

    if (secretRares.length > 0 && roll < RARITY_WEIGHTS['Secret Rare']) {
        rareSlotCard = getRandomCard(secretRares);
    } else if (ultraRares.length > 0 && roll < RARITY_WEIGHTS['Ultra Rare']) {
        rareSlotCard = getRandomCard(ultraRares);
    } else if (superRares.length > 0 && roll < RARITY_WEIGHTS['Super Rare']) {
        rareSlotCard = getRandomCard(superRares);
    } else if (rares.length > 0) {
        rareSlotCard = getRandomCard(rares);
    } else {
        // Fallback if no rares exist (some sets might be weird), take a common
        rareSlotCard = getRandomCard(commons);
    }

    if (rareSlotCard) {
        pack.push(rareSlotCard);
    }

    return pack;
}

function isRarity(card: Card, rarity: string): boolean {
    // Check the specific set rarity if available, otherwise fallback (though API usually provides it in card_sets)
    // We need to check the 'card_sets' array for the specific set we are opening.
    // However, the input 'setCards' should ideally already be filtered/processed or we check any match.
    // For simplicity here, we assume the card object has the correct rarity context or we check strictly.
    // The API returns 'card_sets' array. We should probably pass the setCode to this function to be precise,
    // but for now we'll check if ANY of the card_sets match the rarity.
    // A better approach is to filter the cards BEFORE passing them here, or pass the set code.
    // Let's assume the caller filters 'setCards' to only include the version from this set.

    // Actually, the API 'Card' object has 'card_sets'.
    // We'll check if the card has the rarity in ANY of its set printings (which is a bit loose but works if we passed in all cards from a specific set query).
    // Since we fetch by set, the card_sets array will contain the entry for THIS set.
    return card.card_sets?.some(s => s.set_rarity === rarity) ?? false;
}

function getRandomCard(cards: Card[]): Card {
    const index = Math.floor(Math.random() * cards.length);
    return cards[index];
}
