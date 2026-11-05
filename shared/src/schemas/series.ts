import { z } from 'zod';
import { DECK_LIMITS } from '../decks';
import { isPrizeId, type PrizeId } from '../rewards';
import { PACKS_PER_SET_OPTIONS } from '../rules';
import { DuelistNameSchema } from './auth';

/** A series' display name, e.g. "Kaiba vs Joey" or "Solo run #2". */
export const SeriesNameSchema = z.string().trim().min(1, 'Give the series a name').max(40, 'At most 40 characters');

const PacksPerSetSchema = z.union(PACKS_PER_SET_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<30>]);

/**
 * Creating a series. A duo series starts out waiting for its rival, who is
 * invited afterwards. The server checks `startSetIndex` against the real timeline.
 */
export const CreateSeriesBodySchema = z.strictObject({
    name: SeriesNameSchema,
    mode: z.enum(['solo', 'duo']),
    startSetIndex: z.number().int().min(0),
    packsPerSet: PacksPerSetSchema,
});

export type CreateSeriesBody = z.infer<typeof CreateSeriesBodySchema>;

/** Invite a rival by duelist name, or (no name) get a shareable link. */
export const InviteBodySchema = z.strictObject({ duelistName: DuelistNameSchema.optional() });

const CardIdSchema = z.number().int().positive();
const SetNameSchema = z.string().min(1).max(200);
const WhenSchema = z.string().max(40);
const cards = (max: number) => z.array(CardIdSchema).max(max);
/** A collection key, `id_setCode_rarity`; safe as a Mongo field name. */
export const PrintingSchema = z.string().max(120).regex(/^\d+_[^.$]+$/);
export const MAX_GUEST_PRINTINGS = 20_000;

/**
 * A guest save from this browser, moved into the account as a solo series.
 * The server re-places it on the timeline and drops cards it doesn't know.
 */
export const GuestSaveBodySchema = z.strictObject({
    saveId: z.string().regex(/^[\w-]{1,64}$/),
    name: SeriesNameSchema,
    startSetIndex: z.number().int().min(0),
    currentSetIndex: z.number().int().min(0),
    currentSetName: SetNameSchema.optional(),
    packsPerSet: PacksPerSetSchema,
    collection: z
        .record(PrintingSchema, z.number().int().min(1).max(9999))
        .refine((c) => Object.keys(c).length <= MAX_GUEST_PRINTINGS, 'Too many cards'),
    matchHistory: z.array(z.strictObject({ won: z.boolean(), setName: SetNameSchema, at: WhenSchema })).max(2000),
    rewards: z
        .array(
            z.strictObject({
                prizeId: z.custom<PrizeId>(isPrizeId),
                wonFromPackName: SetNameSchema,
                wonFromSetIndex: z.number().int().min(0),
                wonDate: WhenSchema,
                status: z.enum(['available', 'claimed']),
                claimedDate: WhenSchema.optional(),
                grantedCardId: CardIdSchema.optional(),
                grantedCardIds: cards(100).optional(),
                bannedCardId: CardIdSchema.optional(),
            }),
        )
        .max(2000),
    bannedCardIds: cards(2000),
    savedDecks: z
        .array(
            z.strictObject({
                id: z.string().regex(/^[\w-]{1,64}$/),
                name: z.string().trim().min(1).max(40),
                mainDeck: cards(DECK_LIMITS.main),
                extraDeck: cards(DECK_LIMITS.extra),
                sideDeck: cards(DECK_LIMITS.side),
                createdAt: z.number(),
            }),
        )
        .max(50),
});

export type GuestSaveBody = z.infer<typeof GuestSaveBodySchema>;
