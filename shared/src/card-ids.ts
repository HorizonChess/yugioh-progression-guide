import { z } from 'zod';
import { collectionKey, parseCollectionKey, type Collection } from './collection';
import data from './card-ids.json';

/**
 * ONE ID PER CARD. A card can reach the app under several ids: YGOPRODeck answers
 * the same card under different ids depending on the query (`?cardset=LOB` gives
 * Dark Magician as 36996508, `?set=LOB` as 46986414), lists alternate artworks as
 * ids of their own, and its main id sometimes isn't the official passcode (Monster
 * Reborn 83764719, the passcode 83764718). Everything the app keeps or compares
 * (collections, decks, bans, marks, rewards, pack pulls, duels) uses one id: the
 * duel engine's passcode for the card, the official Konami passcode.
 *
 * `card-ids.json` maps every other id a card goes by onto it; it's built from the
 * engine data and YGOPRODeck by `api/scripts/build-card-ids.ts`. Cards the engine
 * doesn't know keep YGOPRODeck's main id. A different card that the rules treat
 * as another (Harpie Lady 1 is "always treated as Harpie Lady") keeps its own id.
 *
 * Normalise where an id ENTERS the app: card data from YGOPRODeck, request bodies
 * (via `CardIdSchema`), YDK files, and saves written before this existed.
 */
const OTHER_IDS = new Map<number, number>(Object.entries(data as Record<string, number>).map(([k, v]) => [Number(k), v]));

/** Every id that is NOT a card's one id (each maps onto one that is), e.g. for finding stored data to migrate. */
export const OTHER_CARD_IDS: readonly number[] = [...OTHER_IDS.keys()];

/** Changes whenever the id table does, so a migration can tell whether it already ran against this one. */
export const CARD_ID_TABLE_VERSION = `${OTHER_IDS.size}:${[...OTHER_IDS].reduce((h, [k, v]) => (h * 31 + k * 7 + v) % 2_147_483_647, 17)}`;

/** The one id the app uses for the card `id` names. */
export function canonicalCardId(id: number): number {
    return OTHER_IDS.get(id) ?? id;
}

export function canonicalCardIds(ids: readonly number[]): number[] {
    return ids.map(canonicalCardId);
}

/** The card under its one id. Its artwork is left as it came. */
export function canonicalCard<C extends { id: number }>(card: C): C {
    const id = canonicalCardId(card.id);
    return id === card.id ? card : { ...card, id };
}

/** Cards under their one id, the first of any that turn out to be the same card kept. */
export function canonicalCards<C extends { id: number }>(cards: readonly C[]): C[] {
    const seen = new Set<number>();
    const out: C[] = [];
    for (const raw of cards) {
        const card = canonicalCard(raw);
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        out.push(card);
    }
    return out;
}

/** A collection under the one ids: copies of the same printing under two ids are added together. */
export function canonicalCollection(collection: Collection): Collection {
    let changed = false;
    const out: Collection = {};
    for (const [key, count] of Object.entries(collection)) {
        const entry = parseCollectionKey(key);
        const id = entry ? canonicalCardId(entry.id) : null;
        const next = entry && id !== entry.id ? collectionKey(id!, entry.setCode, entry.rarity) : key;
        if (next !== key) changed = true;
        out[next] = (out[next] ?? 0) + count;
    }
    return changed ? out : collection;
}

/** A reward ledger entry with the card ids it names under their one id. */
export function canonicalRewardIds<R extends { grantedCardId?: number; grantedCardIds?: number[]; bannedCardId?: number }>(entry: R): R {
    const out = { ...entry };
    if (entry.grantedCardId !== undefined) out.grantedCardId = canonicalCardId(entry.grantedCardId);
    if (entry.grantedCardIds) out.grantedCardIds = canonicalCardIds(entry.grantedCardIds);
    if (entry.bannedCardId !== undefined) out.bannedCardId = canonicalCardId(entry.bannedCardId);
    return out;
}

/** A card id in a request body, read as its one id. */
export const CardIdSchema = z.number().int().positive().max(2 ** 31).transform(canonicalCardId);
