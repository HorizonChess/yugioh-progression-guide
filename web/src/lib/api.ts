// YGOPRODECK API Wrapper

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

export interface CardSet {
    set_name: string;
    set_code: string;
    num_of_cards: number;
    tcg_date: string;
    set_image?: string;
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
    archetype?: string;
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
                return set.tcg_date < CUTOFF_DATE && set.num_of_cards > 20;
            })
            .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime());
    } catch (error) {
        console.error('Error fetching sets:', error);
        return [];
    }
}

export async function fetchCardsInSet(setName: string): Promise<Card[]> {
    try {
        const response = await fetch(`${BASE_URL}/cardinfo.php?set=${encodeURIComponent(setName)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch cards for set: ${setName}`);
        }
        const data = await response.json();
        return data.data as Card[];
    } catch (error) {
        console.error(`Error fetching cards for ${setName}:`, error);
        return [];
    }
}

export async function fetchCardsByIds(ids: number[]): Promise<Card[]> {
    if (ids.length === 0) return [];
    try {
        // API allows comma separated IDs
        const idString = ids.join(',');
        const response = await fetch(`${BASE_URL}/cardinfo.php?id=${idString}`);
        if (!response.ok) {
            throw new Error('Failed to fetch cards by IDs');
        }
        const data = await response.json();
        return data.data as Card[];
    } catch (error) {
        console.error('Error fetching cards by IDs:', error);
        return [];
    }
}
