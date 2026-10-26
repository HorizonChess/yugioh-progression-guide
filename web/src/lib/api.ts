import boosterImagesData from '@/data/booster_images.json';
import {
    existedByCutoff,
    setDateMap,
    timelineSets,
    tournamentSets,
    type Card,
    type CardSet,
} from '@ygo/shared';

// Card/set types and the timeline filters live in @ygo/shared so the API uses the same rules.
export type { Card, CardSet, PulledCard } from '@ygo/shared';
export { existedByCutoff, earliestPrintingDate } from '@ygo/shared';

const boosterImages = boosterImagesData as Record<string, string>;

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

/**
 * Cached raw `/cardsets.php` response (unfiltered). Both `fetchAllSets` and
 * `fetchTournamentSets` reduce this, so it's fetched once per session.
 */
let rawSetsPromise: Promise<CardSet[]> | null = null;

/*
 * Response bodies are read as `unknown` and narrowed to the expected container
 * (an array, or `{ data: [...] }`). The items themselves are trusted to match
 * `CardSet` / `Card` — this module is the trust boundary for API data.
 */
async function readJson(response: Response): Promise<unknown> {
    return (await response.json()) as unknown;
}

/**
 * GET a `cardinfo.php` query, with images rewritten to R2. The API answers 400
 * (with an `{ error }` body) when nothing matches, treated as "no cards".
 */
async function fetchCardInfo(query: string): Promise<Card[]> {
    const response = await fetch(`${BASE_URL}/cardinfo.php?${query}`);
    if (!response.ok) return [];
    const body = await readJson(response);
    if (typeof body !== 'object' || body === null || !('data' in body) || !Array.isArray(body.data)) return [];
    return (body.data as Card[]).map(transformCardImages);
}

async function fetchRawSets(): Promise<CardSet[]> {
    if (!rawSetsPromise) {
        rawSetsPromise = (async () => {
            const response = await fetch(`${BASE_URL}/cardsets.php`);
            if (!response.ok) {
                throw new Error('Failed to fetch card sets');
            }
            const body = await readJson(response);
            if (!Array.isArray(body)) throw new Error('Unexpected card sets response');
            return body as CardSet[];
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

        return timelineSets(data).map(set => {
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

        return tournamentSets(data).map(set => ({
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
        return await fetchCardInfo(`set=${encodeURIComponent(setName)}`);
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
    return setDateMap(await fetchRawSets());
}

/**
 * Fuzzy card-name search (`cardinfo.php?fname=`) for the ban typeahead, RESTRICTED
 * to cards that existed by the cutoff (`existedByCutoff`) — purely by printing
 * date, so any card with a pre-cutoff printing in any set kind is bannable, while
 * post-cutoff-only cards (which showed as blank thumbnails) are filtered out.
 * A no-match query returns [].
 */
export async function searchCardsByName(query: string): Promise<Card[]> {
    const q = query.trim();
    if (!q) return [];
    try {
        const [cards, setDates] = await Promise.all([
            fetchCardInfo(`fname=${encodeURIComponent(q)}`),
            fetchSetDateMap(),
        ]);
        return cards.filter((card) => existedByCutoff(card, setDates));
    } catch (error) {
        console.error(`Error searching cards for "${q}":`, error);
        return [];
    }
}

// In-memory cache for card data
const cardCache = new Map<number, Card>();

export async function fetchCardsByIds(ids: number[]): Promise<Card[]> {
    if (ids.length === 0) return [];

    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(ids));

    // Identify missing IDs
    const missingIds = uniqueIds.filter(id => !cardCache.has(id));

    // Fetch missing IDs (the API takes comma-separated IDs)
    if (missingIds.length > 0) {
        try {
            const fetchedCards = await fetchCardInfo(`id=${missingIds.join(',')}`);
            fetchedCards.forEach(card => cardCache.set(card.id, card));
        } catch (error) {
            console.error('Error fetching cards by IDs:', error);
        }
    }

    // Return cards from cache
    return uniqueIds.flatMap(id => cardCache.get(id) ?? []);
}
