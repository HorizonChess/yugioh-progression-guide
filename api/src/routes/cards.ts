import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

/** The most ids one request may ask for (the browser splits bigger lists). */
export const MAX_IDS = 400;
const SEARCH_LIMIT = 100;
/** Card data changes only when `sync-cards` runs. */
const CACHE = 'public, max-age=600';

const Query = z.object({
    id: z.string().regex(/^\d+(,\d+)*$/).optional(),
    set: z.string().min(1).max(200).optional(),
    fname: z.string().min(1).max(100).optional(),
});

/**
 * Card data for the browser, from the synced copy in MongoDB, so the site no longer depends on
 * reaching YGOPRODeck from the player's own browser (an ad blocker, a network filter or
 * YGOPRODeck's hour-long rate-limit ban used to leave the collection and decks empty).
 * The shapes match YGOPRODeck's: `GET /api/cards/sets` is cardsets.php, and
 * `GET /api/cards?id=1,2` / `?set=Name` / `?fname=text` is cardinfo.php's `{ data }`.
 * Only cards from before the progression's cutoff are synced, which is all the game uses.
 */
export async function cardRoutes(app: FastifyInstance): Promise<void> {
    app.get('/cards/sets', async (_request, reply) => {
        reply.header('cache-control', CACHE);
        return app.catalog.sets();
    });

    app.get('/cards', async (request, reply) => {
        const parsed = Query.safeParse(request.query);
        if (!parsed.success) return reply.code(400).send({ error: 'Bad query' });
        const { id, set, fname } = parsed.data;
        let data;
        if (id) {
            const ids = id.split(',').map(Number);
            if (ids.length > MAX_IDS) return reply.code(400).send({ error: `At most ${MAX_IDS} ids` });
            data = await app.catalog.cardsByIds(ids);
        } else if (set) {
            data = await app.catalog.cardsInSet(set);
        } else if (fname) {
            data = await app.catalog.searchByName(fname, SEARCH_LIMIT);
        } else {
            return reply.code(400).send({ error: 'Give id, set or fname' });
        }
        reply.header('cache-control', CACHE);
        return { data };
    });
}
