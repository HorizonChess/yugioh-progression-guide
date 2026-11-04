import { z } from 'zod';
import { PACKS_PER_SET_OPTIONS } from '../rules';

/** A series' display name, e.g. "Kaiba vs Joey" or "Solo run #2". */
export const SeriesNameSchema = z.string().trim().min(1, 'Give the series a name').max(40, 'At most 40 characters');

/**
 * Creating a series. Solo only for now; duo (inviting a rival) arrives in
 * Phase 4. The server checks `startSetIndex` against the real timeline.
 */
export const CreateSeriesBodySchema = z.strictObject({
    name: SeriesNameSchema,
    mode: z.literal('solo'),
    startSetIndex: z.number().int().min(0),
    packsPerSet: z.union(PACKS_PER_SET_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<30>]),
});

export type CreateSeriesBody = z.infer<typeof CreateSeriesBodySchema>;
