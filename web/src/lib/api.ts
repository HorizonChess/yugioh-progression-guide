import boosterImagesData from '@/data/booster_images.json';

const boosterImages = boosterImagesData as Record<string, string>;

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

export interface CardSet {
    set_name: string;
    set_code: string;
    num_of_cards: number;
    tcg_date: string;
    set_image?: string;
    original_image?: string;
}

export interface Card {
    id: number;
    name: string;
    type: string;
    frameType: string;
    desc: string;
    race: string;
    archetype?: string;
    atk?: number;
    def?: number;
    level?: number;
    attribute?: string;
    scale?: number;
    linkval?: number;
    linkmarkers?: string[];
    card_sets?: {
        set_name: string;
        set_code: string;
        set_rarity: string;
        set_rarity_code: string;
        set_price: string;
    }[];
    card_images: {
        id: number;
        image_url: string;
        image_url_small: string;
        image_url_cropped: string;
    }[];
}

// Filter out sets that are too new (Link era started around 2017 with Code of the Duelist)
// We want to stop before Link monsters.
// "Code of the Duelist" (COTD) was released Aug 4, 2017.
// We can filter by date.
const CUTOFF_DATE = '2017-08-01';

const EXCLUDE_KEYWORDS = [
    "Structure Deck",
    "Starter Deck",
    "Tournament Pack",
    "Duelist Pack",
    "Battle Pack",
    "Star Pack",
    "Turbo Pack",
    "Astral Pack",
    "Champion Pack",
    "OTS Tournament Pack",
    "Premium Pack",
    "Movie Pack",
    "Super Starter",
    "Speed Duel",
    "Duel Terminal",
    "Legendary Decks",
    "Box Set",
    "Special Edition",
    "Magic Ruler", // Identical to Spell Ruler
];

export async function fetchAllSets(): Promise<CardSet[]> {
    try {
        const response = await fetch(`${BASE_URL}/cardsets.php`);
        if (!response.ok) {
            throw new Error('Failed to fetch card sets');
        }
        const data: CardSet[] = await response.json();

        // Filter and sort by date
        return data
            .filter(set => {
                if (!set.tcg_date) return false;
                if (set.tcg_date >= CUTOFF_DATE) return false;
                if (set.num_of_cards <= 20) return false;

                const name = set.set_name;
                for (const keyword of EXCLUDE_KEYWORDS) {
                    if (name.includes(keyword)) return false;
                }
                return true;
            })
            .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime())
            .map(set => {
                const fandomImage = boosterImages[set.set_code];
                // STRICT: Do not use set.set_image from API to avoid hotlinking YGOPRODeck
                return {
                    ...set,
                    original_image: undefined, // Don't keep the original URL either
                    set_image: fandomImage || undefined // Only use safe image or undefined
                };
            });
    } catch (error) {
        console.error('Error fetching sets:', error);
        return [];
    }
}


const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || '';

function transformCardImages(card: Card): Card {
    if (!IMAGE_HOST) return card;

    return {
        ...card,
        card_images: card.card_images.map(img => ({
            ...img,
            image_url: `${IMAGE_HOST}/cards/${img.id}.jpg`,
            image_url_small: `${IMAGE_HOST}/cards/${img.id}.jpg`, // We only uploaded high-res, use it for small too or handle resizing later
            image_url_cropped: `${IMAGE_HOST}/cards/${img.id}.jpg`, // Same for cropped for now
        }))
    };
}

export async function fetchCardsInSet(setName: string): Promise<Card[]> {
    try {
        const response = await fetch(`${BASE_URL}/cardinfo.php?set=${encodeURIComponent(setName)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch cards for set: ${setName}`);
        }
        const data = await response.json();
        return (data.data as Card[]).map(transformCardImages);
    } catch (error) {
        console.error(`Error fetching cards for ${setName}:`, error);
        return [];
    }
}

// In-memory cache for card data
const cardCache: Record<number, Card> = {};

export async function fetchCardsByIds(ids: number[]): Promise<Card[]> {
    if (ids.length === 0) return [];

    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(ids));

    // Identify missing IDs
    const missingIds = uniqueIds.filter(id => !cardCache[id]);

    // Fetch missing IDs
    if (missingIds.length > 0) {
        try {
            // API allows comma separated IDs
            const idString = missingIds.join(',');
            const response = await fetch(`${BASE_URL}/cardinfo.php?id=${idString}`);
            if (response.ok) {
                const data = await response.json();
                const fetchedCards = (data.data as Card[]).map(transformCardImages);

                // Update cache
                fetchedCards.forEach(card => {
                    cardCache[card.id] = card;
                });
            } else {
                console.error('Failed to fetch cards by IDs');
            }
        } catch (error) {
            console.error('Error fetching cards by IDs:', error);
        }
    }

    // Return cards from cache
    return uniqueIds
        .map(id => cardCache[id])
        .filter(card => card !== undefined);
}
