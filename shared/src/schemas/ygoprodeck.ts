import { z } from 'zod';
import type { Card, CardSet } from '../types';

/*
 * Validation for YGOPRODeck API data at the server's trust boundary. Parsing
 * strips fields the game doesn't use (prices, URLs, banlist info) and
 * normalises the API's quirks into the shared `Card` / `CardSet` shapes:
 *  - a few sets have no `tcg_date` (stored as '', which the timeline filters treat as undated);
 *  - `atk` / `def` / `level` / `attribute` are sometimes `null` rather than absent.
 */

/** Optional field the API may send as null; null becomes absent. */
const nullable = <T extends z.ZodType>(schema: T) =>
    schema.nullish().transform((value) => value ?? undefined);

export const CardSetSchema = z.object({
    set_name: z.string().min(1),
    set_code: z.string(),
    num_of_cards: z.number().int().nonnegative(),
    tcg_date: z.string().default(''),
});

const CardPrintingSchema = z.object({
    set_name: z.string(),
    set_code: z.string(),
    set_rarity: z.string(),
    set_rarity_code: z.string().default(''),
    set_price: z.string().default('0'),
});

const CardImageSchema = z.object({
    id: z.number().int(),
    image_url: z.string(),
    image_url_small: z.string(),
    image_url_cropped: z.string(),
});

export const CardSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    type: z.string(),
    frameType: z.string(),
    desc: z.string(),
    race: z.string(),
    archetype: nullable(z.string()),
    atk: nullable(z.number()),
    def: nullable(z.number()),
    level: nullable(z.number()),
    rank: nullable(z.number()),
    attribute: nullable(z.string()),
    scale: nullable(z.number()),
    linkval: nullable(z.number()),
    linkmarkers: nullable(z.array(z.string())),
    card_sets: nullable(z.array(CardPrintingSchema)),
    card_images: z.array(CardImageSchema),
});

/** `/cardinfo.php` wraps its results as `{ data: [...] }`. */
export const CardInfoResponseSchema = z.object({ data: z.array(z.unknown()) });

// Compile-time guarantee that parsed data fits the shared types the game code uses.
type Assignable<T, U extends T> = U;
type _CardSetFits = Assignable<CardSet, z.output<typeof CardSetSchema>>;
type _CardFits = Assignable<Card, z.output<typeof CardSchema>>;
