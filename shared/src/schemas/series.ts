import { z } from 'zod';
import { PACKS_PER_SET_OPTIONS } from '../rules';
import { DuelistNameSchema } from './auth';

/** A series' display name, e.g. "Kaiba vs Joey" or "Solo run #2". */
export const SeriesNameSchema = z.string().trim().min(1, 'Give the series a name').max(40, 'At most 40 characters');

/**
 * Creating a series. A duo series starts out waiting for its rival, who is
 * invited afterwards. The server checks `startSetIndex` against the real timeline.
 */
export const CreateSeriesBodySchema = z.strictObject({
    name: SeriesNameSchema,
    mode: z.enum(['solo', 'duo']),
    startSetIndex: z.number().int().min(0),
    packsPerSet: z.union(PACKS_PER_SET_OPTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<12>, z.ZodLiteral<24>, z.ZodLiteral<30>]),
});

export type CreateSeriesBody = z.infer<typeof CreateSeriesBodySchema>;

/** Invite a rival by duelist name, or (no name) get a shareable link. */
export const InviteBodySchema = z.strictObject({ duelistName: DuelistNameSchema.optional() });
