import type { Db } from 'mongodb';
import { setDateMap, timelineSets, tournamentSets, type Card, type CardSet } from '@ygo/shared';
import { cardSetsCollection, cardsCollection } from './sync';

/**
 * Read access to the synced card data, shaped the way the game uses it. The
 * timeline is computed with the same `timelineSets` the web app uses, so a
 * series' `currentSetIndex` names the same set on both sides.
 *
 * Sets change only when `sync-cards` runs, so they're cached in memory for
 * `SETS_TTL_MS`; cards per set are cached too (a small LRU), since every pack
 * session in a set reads the same list.
 */
export interface CardCatalog {
    /** The progression timeline; `currentSetIndex` indexes into it. */
    timeline(): Promise<CardSet[]>;
    /** The tournament-pack pool, oldest first. */
    tournamentSets(): Promise<CardSet[]>;
    /** set_name → release date, over every set (for dating a card's printings). */
    setDates(): Promise<Map<string, string>>;
    /** Every card printed in `setName`, as pack generation expects. */
    cardsInSet(setName: string): Promise<Card[]>;
    /** The cards with these ids that exist in the pool (unknown ids are left out). */
    cardsByIds(ids: readonly number[]): Promise<Card[]>;
    /** Which of these ids are cards in the pool, without loading the cards. */
    knownIds(ids: readonly number[]): Promise<Set<number>>;
    /** Drops the caches, e.g. after a sync. */
    invalidate(): void;
}

const SETS_TTL_MS = 10 * 60_000;
const CARD_LIST_CACHE_SIZE = 40;

interface SetViews {
    raw: CardSet[];
    timeline: CardSet[];
    tournament: CardSet[];
    dates: Map<string, string>;
    loadedAt: number;
}

export function createCardCatalog(db: Db): CardCatalog {
    let views: Promise<SetViews> | null = null;
    const cardLists = new Map<string, Promise<Card[]>>();

    const loadViews = (): Promise<SetViews> => {
        if (views) return views;
        const loading = (async () => {
            const raw = (await cardSetsCollection(db).find({}, { projection: { _id: 0 } }).toArray()) as CardSet[];
            return { raw, timeline: timelineSets(raw), tournament: tournamentSets(raw), dates: setDateMap(raw), loadedAt: Date.now() };
        })();
        views = loading;
        // A failed load isn't cached; expire a good one after the TTL.
        loading.then(
            (v) => setTimeout(() => { if (views === loading) views = null; }, SETS_TTL_MS - (Date.now() - v.loadedAt)).unref(),
            () => { if (views === loading) views = null; },
        );
        return loading;
    };

    return {
        timeline: async () => (await loadViews()).timeline,
        tournamentSets: async () => (await loadViews()).tournament,
        setDates: async () => (await loadViews()).dates,

        cardsInSet(setName) {
            const cached = cardLists.get(setName);
            if (cached) {
                // Refresh its place in the LRU order.
                cardLists.delete(setName);
                cardLists.set(setName, cached);
                return cached;
            }
            const loading = cardsCollection(db)
                .find({ 'card_sets.set_name': setName }, { projection: { _id: 0 } })
                .sort({ id: 1 })
                .toArray() as Promise<Card[]>;
            cardLists.set(setName, loading);
            loading.catch(() => cardLists.delete(setName));
            while (cardLists.size > CARD_LIST_CACHE_SIZE) {
                const oldest = cardLists.keys().next().value;
                if (oldest === undefined) break;
                cardLists.delete(oldest);
            }
            return loading;
        },

        async cardsByIds(ids) {
            const unique = [...new Set(ids)];
            if (unique.length === 0) return [];
            return (await cardsCollection(db).find({ _id: { $in: unique } }, { projection: { _id: 0 } }).toArray()) as Card[];
        },

        async knownIds(ids) {
            const unique = [...new Set(ids)];
            if (unique.length === 0) return new Set();
            return new Set(await cardsCollection(db).distinct('_id', { _id: { $in: unique } }));
        },

        invalidate() {
            views = null;
            cardLists.clear();
        },
    };
}
