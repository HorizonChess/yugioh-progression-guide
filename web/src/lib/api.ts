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

/**
 * The tournament-family sets `fetchAllSets` filters OUT via EXCLUDE_KEYWORDS —
 * pulled back in by `fetchTournamentSets()` for the "3 Tournament Packs" reward.
 * Kept aligned with the pack-logic tournament types (see pack-logic.ts
 * `determinePackType` / `generateTournamentPack`) so the reward opens with the
 * correct tournament ratios.
 */
const TOURNAMENT_KEYWORDS = [
    "Tournament Pack",   // incl. "OTS Tournament Pack"
    "Champion Pack",
    "Turbo Pack",
    "Astral Pack",
];

/**
 * Cached raw `/cardsets.php` response (unfiltered). Both `fetchAllSets` and
 * `fetchTournamentSets` reduce this, so it's fetched once per session.
 */
let rawSetsPromise: Promise<CardSet[]> | null = null;

async function fetchRawSets(): Promise<CardSet[]> {
    if (!rawSetsPromise) {
        rawSetsPromise = (async () => {
            const response = await fetch(`${BASE_URL}/cardsets.php`);
            if (!response.ok) {
                throw new Error('Failed to fetch card sets');
            }
            return (await response.json()) as CardSet[];
        })().catch((error) => {
            // Don't cache a rejection — let the next call retry.
            rawSetsPromise = null;
            throw error;
        });
    }
    return rawSetsPromise;
}

export async function fetchAllSets(): Promise<CardSet[]> {
    try {
        const data = await fetchRawSets();

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

/**
 * The tournament-family sets `fetchAllSets` drops — surfaced for the "3
 * Tournament Packs" reward. Same date cutoff as the main sets, sorted ascending
 * by date. Booster art usually isn't in booster_images.json for these (the
 * ledger doesn't show pack art, and the reveal only uses the set name), so
 * `set_image` is left undefined rather than hotlinking.
 */
export async function fetchTournamentSets(): Promise<CardSet[]> {
    try {
        const data = await fetchRawSets();

        return data
            .filter(set => {
                if (!set.tcg_date) return false;
                if (set.tcg_date >= CUTOFF_DATE) return false;

                const name = set.set_name;
                return TOURNAMENT_KEYWORDS.some(keyword => name.includes(keyword));
            })
            .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime())
            .map(set => ({
                ...set,
                original_image: undefined,
                set_image: boosterImages[set.set_code] || undefined,
            }));
    } catch (error) {
        console.error('Error fetching tournament sets:', error);
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
            image_url_small: img.id === 102380 ? `${IMAGE_HOST}/cards/${img.id}_lg.jpg` : `${IMAGE_HOST}/cards/${img.id}_md.jpg`,
            image_url_cropped: `${IMAGE_HOST}/cards/${img.id}_sm.jpg`,
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

/**
 * set_name → tcg_date over the RAW (unfiltered) set list. Used to date a card's
 * printings so we can tell whether the app's timeline covers it (i.e. it has a
 * printing before CUTOFF_DATE). Cached for the session via `fetchRawSets`.
 */
export async function fetchSetDateMap(): Promise<Map<string, string>> {
    const sets = await fetchRawSets();
    const map = new Map<string, string>();
    for (const set of sets) {
        if (set.tcg_date) map.set(set.set_name, set.tcg_date);
    }
    return map;
}

/**
 * True if `card` existed by the app's cutoff — i.e. it has at least one printing
 * (in ANY set: core booster, structure deck, tin, etc.) dated before CUTOFF_DATE.
 * This is a pure DATE test, not set-membership: a card printed only in a structure
 * deck still counts, matching how Starlight search reaches structure-deck cards.
 * Cards printed only after the cutoff (post-Link era) have no R2 art and aren't
 * part of the progression, so they must not be bannable. Undatable printings are
 * ignored; a card with no datable pre-cutoff printing is treated as too new.
 */
export function existedByCutoff(card: Card, setDates: Map<string, string>): boolean {
    return (card.card_sets ?? []).some((printing) => {
        const date = setDates.get(printing.set_name);
        return date != null && date < CUTOFF_DATE;
    });
}

/**
 * The earliest datable printing of `card` (across ALL set kinds), or null if none
 * of its printings can be dated via `setDates`. Used by the Starlight search to
 * gate a card to those with a printing released BEFORE the won pack — the same
 * pure-date rule as `existedByCutoff`, but against the pack's date rather than the
 * global cutoff, so Starlight can reach off-timeline (e.g. structure-deck) cards.
 */
export function earliestPrintingDate(card: Card, setDates: Map<string, string>): string | null {
    let earliest: string | null = null;
    for (const printing of card.card_sets ?? []) {
        const date = setDates.get(printing.set_name);
        if (date != null && (earliest == null || date < earliest)) earliest = date;
    }
    return earliest;
}

/**
 * Fuzzy card-name search (`cardinfo.php?fname=`) for the ban typeahead, RESTRICTED
 * to cards that existed by the cutoff (`existedByCutoff`) — purely by printing
 * date, so any card with a pre-cutoff printing in any set kind is bannable, while
 * post-cutoff-only cards (which showed as blank thumbnails) are filtered out.
 * Images are rewritten to R2 via `transformCardImages`. A no-match query returns
 * [] (the API answers 400 with an `{error}` body, treated as "nothing found").
 */
export async function searchCardsByName(query: string): Promise<Card[]> {
    const q = query.trim();
    if (!q) return [];
    try {
        const [response, setDates] = await Promise.all([
            fetch(`${BASE_URL}/cardinfo.php?fname=${encodeURIComponent(q)}`),
            fetchSetDateMap(),
        ]);
        if (!response.ok) return []; // 400 = no match
        const data = await response.json();
        if (!Array.isArray(data.data)) return [];
        return (data.data as Card[])
            .filter((card) => existedByCutoff(card, setDates))
            .map(transformCardImages);
    } catch (error) {
        console.error(`Error searching cards for "${q}":`, error);
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
