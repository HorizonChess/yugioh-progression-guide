import type { Db } from 'mongodb';
import {
    CardInfoResponseSchema,
    CardSchema,
    CardSetSchema,
    existedByCutoff,
    setDateMap,
    type Card,
    type CardSet,
} from '@ygo/shared';

const YGOPRODECK_API = 'https://db.ygoprodeck.com/api/v7';

/** Where card data comes from: the live API in production, fixtures in tests. */
export interface CardDataSource {
    fetchSets(): Promise<unknown>;
    fetchCards(): Promise<unknown>;
}

/** The live YGOPRODeck API: one request for every set, one for every card. */
export function ygoprodeckSource(fetchImpl: typeof fetch = fetch): CardDataSource {
    const getJson = async (path: string): Promise<unknown> => {
        const response = await fetchImpl(`${YGOPRODECK_API}/${path}`);
        if (!response.ok) throw new Error(`YGOPRODeck ${path} answered ${response.status}`);
        return response.json();
    };
    return {
        fetchSets: () => getJson('cardsets.php'),
        fetchCards: () => getJson('cardinfo.php'),
    };
}

export type CardSetDoc = CardSet & { _id: string };
export type CardDoc = Card & { _id: number };
interface SyncMetaDoc {
    _id: 'card-sync';
    syncedAt: Date;
    sets: number;
    cards: number;
}

export const cardSetsCollection = (db: Db) => db.collection<CardSetDoc>('cardSets');
export const cardsCollection = (db: Db) => db.collection<CardDoc>('cards');
const metaCollection = (db: Db) => db.collection<SyncMetaDoc>('meta');

export interface SyncReport {
    sets: number;
    cards: number;
    rejectedSets: number;
    rejectedCards: number;
    /** Cards skipped because no printing predates the progression cutoff. */
    skippedCards: number;
    removedSets: number;
    removedCards: number;
}

export interface SyncOptions {
    /** Accept a sync that shrinks the stored data by more than 10%. */
    allowShrink?: boolean;
}

/** Above this share of malformed records the response is treated as broken. */
const MAX_REJECTED_SHARE = 0.05;
/** A sync may not silently drop more than this share of what's stored. */
const MAX_SHRINK_SHARE = 0.1;

/**
 * Mirrors YGOPRODeck's sets and cards into MongoDB: every set (the timeline,
 * tournament packs and printing dates all derive from them) and every card
 * that existed by the progression cutoff. Records are validated and trimmed
 * by the shared schemas. A response that looks broken (many malformed
 * records, or far fewer than already stored) aborts before anything is
 * written, so an API outage can't wipe the card pool.
 */
export async function syncCardData(db: Db, source: CardDataSource, options: SyncOptions = {}): Promise<SyncReport> {
    const [rawSets, rawCards] = await Promise.all([source.fetchSets(), source.fetchCards()]);

    if (!Array.isArray(rawSets)) throw new Error('Card sets response is not an array');
    const sets = parseAll(rawSets, CardSetSchema, 'sets');
    const cardResults = parseAll(CardInfoResponseSchema.parse(rawCards).data, CardSchema, 'cards');

    const setDates = setDateMap(sets.valid);
    const cards = cardResults.valid.filter((card) => existedByCutoff(card, setDates));

    await guardAgainstShrink(db, sets.valid.length, cards.length, options);

    const setDocs: CardSetDoc[] = sets.valid.map((set) => ({ _id: set.set_name, ...set }));
    const cardDocs: CardDoc[] = cards.map((card) => ({ _id: card.id, ...withoutUndefined(card) }));

    await cardSetsCollection(db).bulkWrite(
        setDocs.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })),
        { ordered: false },
    );
    await cardsCollection(db).bulkWrite(
        cardDocs.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })),
        { ordered: false },
    );
    const removedSets = await cardSetsCollection(db).deleteMany({ _id: { $nin: setDocs.map((d) => d._id) } });
    const removedCards = await cardsCollection(db).deleteMany({ _id: { $nin: cardDocs.map((d) => d._id) } });

    // Pack rolls look cards up by the set they were printed in.
    await cardsCollection(db).createIndex({ 'card_sets.set_name': 1 });

    await metaCollection(db).replaceOne(
        { _id: 'card-sync' },
        { syncedAt: new Date(), sets: setDocs.length, cards: cardDocs.length },
        { upsert: true },
    );

    return {
        sets: setDocs.length,
        cards: cardDocs.length,
        rejectedSets: sets.rejected,
        rejectedCards: cardResults.rejected,
        skippedCards: cardResults.valid.length - cards.length,
        removedSets: removedSets.deletedCount,
        removedCards: removedCards.deletedCount,
    };
}

/** Drops absent fields, which the Mongo driver would otherwise store as null. */
function withoutUndefined<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function parseAll<T>(items: unknown[], schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, label: string) {
    const valid: T[] = [];
    for (const item of items) {
        const result = schema.safeParse(item);
        if (result.success) valid.push(result.data);
    }
    const rejected = items.length - valid.length;
    if (items.length === 0 || rejected / items.length > MAX_REJECTED_SHARE) {
        throw new Error(`Refusing to sync: ${rejected} of ${items.length} ${label} failed validation`);
    }
    return { valid, rejected };
}

async function guardAgainstShrink(db: Db, sets: number, cards: number, { allowShrink = false }: SyncOptions): Promise<void> {
    if (allowShrink) return;
    const [storedSets, storedCards] = await Promise.all([
        cardSetsCollection(db).estimatedDocumentCount(),
        cardsCollection(db).estimatedDocumentCount(),
    ]);
    const shrinks = (incoming: number, stored: number) => stored > 0 && incoming < stored * (1 - MAX_SHRINK_SHARE);
    if (shrinks(sets, storedSets) || shrinks(cards, storedCards)) {
        throw new Error(
            `Refusing to sync: would shrink stored data from ${storedSets} sets / ${storedCards} cards ` +
            `to ${sets} / ${cards}. Re-run with --allow-shrink if this is expected.`,
        );
    }
}
