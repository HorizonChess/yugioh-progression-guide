/**
 * Card and set shapes as returned by the YGOPRODeck API (`/cardsets.php`,
 * `/cardinfo.php`). Shared by the web app, which reads them straight from the
 * API, and the server, which mirrors them into MongoDB.
 */
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
    rank?: number;
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

export interface PulledCard extends Card {
    pulled_rarity: string;
    pulled_set_code: string;
}
