import boosterImagesData from '@/data/booster_images.json';
import tournamentPackArtData from '@/data/tournament_pack_art.json';
import {
    canonicalCardIds,
    canonicalCards,
    existedByCutoff,
    setDateMap,
    timelineSets,
    tournamentSets,
    type Card,
    type CardSet,
} from '@ygo/shared';
import { API_BASE } from '@/lib/auth-client';
import { asset } from '@/lib/utils';

// Card/set types and the timeline filters live in @ygo/shared so the API uses the same rules.
export type { Card, CardSet, PulledCard } from '@ygo/shared';
export { existedByCutoff, earliestPrintingDate } from '@ygo/shared';

const boosterImages = boosterImagesData as Record<string, string>;

const tournamentPackArt = tournamentPackArtData as Record<string, string>;
const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || '';

/**
 * Pack art. Booster sets: small WebP copies of booster_images.json the site serves itself
 * (scripts/images/pack-art.mjs). Tournament packs: upscaled copies on R2
 * (scripts/images/tournament-pack-art.mjs).
 */
const packArt = (code: string) =>
    tournamentPackArt[code] && IMAGE_HOST ? `${IMAGE_HOST}/packs/${code}.webp`
    : boosterImages[code] ? asset(`/packs/${code}.webp`)
    : undefined;

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
 * Card data comes from our own server (`/api/cards`, a synced copy of YGOPRODeck's), so it
 * doesn't depend on the player's browser reaching YGOPRODeck: an ad blocker, a network filter
 * or YGOPRODeck's hour-long rate-limit ban used to leave the collection and decks empty.
 * Where there is no server (the static GitHub Pages build), it falls back to YGOPRODeck.
 */
const OWN_CARDS_URL = `${API_BASE}/api/cards`;

/** GETs JSON from our server, then from YGOPRODeck if ours can't answer. Throws if neither can. */
async function getCardJson(own: string, ygoprodeck: string): Promise<unknown> {
    try {
        const response = await fetch(own);
        // A page instead of JSON means there's no API behind this site.
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) return await readJson(response);
    } catch {
        // fall through to YGOPRODeck
    }
    const response = await fetch(ygoprodeck);
    // YGOPRODeck answers 400 (with an `{ error }` body) when nothing matches.
    if (response.status === 400) return { data: [] };
    if (!response.ok) throw new Error(`Card data answered ${response.status}`);
    return readJson(response);
}

/** GET a `cardinfo.php` query, with images rewritten to R2. "Nothing matched" is no cards. */
async function fetchCardInfo(query: string): Promise<Card[]> {
    const body = await getCardJson(`${OWN_CARDS_URL}?${query}`, `${BASE_URL}/cardinfo.php?${query}`);
    if (typeof body !== 'object' || body === null || !('data' in body) || !Array.isArray(body.data)) return [];
    // Each card under its one id (shared/src/card-ids.ts), whatever id this query listed it under.
    return canonicalCards(body.data as Card[]).map(transformCardImages);
}

export async function fetchRawSets(): Promise<CardSet[]> {
    if (!rawSetsPromise) {
        rawSetsPromise = (async () => {
            const body = await getCardJson(`${OWN_CARDS_URL}/sets`, `${BASE_URL}/cardsets.php`);
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

        // Never the API's own set_image: that would hotlink YGOPRODeck.
        return timelineSets(data).map(set => ({
            ...set,
            original_image: undefined,
            set_image: packArt(set.set_code),
        }));
    } catch (error) {
        console.error('Error fetching sets:', error);
        return [];
    }
}

/**
 * The tournament-family sets `fetchAllSets` drops — surfaced for the "3
 * Tournament Packs" reward. Same date cutoff as the main sets, sorted ascending
 * by date. Their art is on R2 (see `packArt`).
 */
export async function fetchTournamentSets(): Promise<CardSet[]> {
    try {
        const data = await fetchRawSets();

        return tournamentSets(data).map(set => ({
            ...set,
            original_image: undefined,
            set_image: packArt(set.set_code),
        }));
    } catch (error) {
        console.error('Error fetching tournament sets:', error);
        return [];
    }
}

/** Points a card's images at our own image host (the only one the page may load from). */
export function transformCardImages<C extends Card>(card: C): C {
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
/** Ids per request: well under both our server's limit (400) and YGOPRODeck's URL length limit. */
const ID_BATCH = 200;

export async function fetchCardsByIds(ids: number[]): Promise<Card[]> {
    if (ids.length === 0) return [];

    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(canonicalCardIds(ids)));

    // Identify missing IDs
    const missingIds = uniqueIds.filter(id => !cardCache.has(id));

    // Fetch missing IDs, comma-separated, in batches: one long list made a URL YGOPRODeck
    // refused (414 past ~8 KB, about 900 ids), which emptied a big collection. A failed
    // batch loses only its own cards.
    const batches = [];
    for (let i = 0; i < missingIds.length; i += ID_BATCH) batches.push(missingIds.slice(i, i + ID_BATCH));
    await Promise.all(batches.map(async (batch) => {
        try {
            const fetchedCards = await fetchCardInfo(`id=${batch.join(',')}`);
            fetchedCards.forEach(card => cardCache.set(card.id, card));
        } catch (error) {
            console.error('Error fetching cards by IDs:', error);
        }
    }));

    // Return cards from cache
    return uniqueIds.flatMap(id => cardCache.get(id) ?? []);
}
