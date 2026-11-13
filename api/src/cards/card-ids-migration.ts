import type { Db } from 'mongodb';
import {
    CARD_ID_TABLE_VERSION,
    OTHER_CARD_IDS,
    canonicalCard,
    canonicalCardId,
    canonicalCardIds,
    canonicalCollection,
    canonicalRewardIds,
} from '@ygo/shared';
import { duelsCollection } from '../duel/hub';
import { packSessions } from '../game/packs';
import { seriesCollection, seriesPlayersCollection } from '../game/series';
import { cardsCollection } from './sync';

interface MigrationDoc {
    _id: 'card-ids';
    table: string;
    ranAt: Date;
}

export interface CardIdMigrationReport {
    skipped: boolean;
    cards: number;
    players: number;
    series: number;
    packSessions: number;
    duels: number;
}

const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/** Ids under their one id, each once (a list of distinct cards: marks, bans). */
const distinct = (ids: readonly number[]) => [...new Set(canonicalCardIds(ids))];

/**
 * Moves everything stored under another id of a card onto its one id (see
 * shared/src/card-ids.ts): the card mirror, players' collections (copies of the
 * same printing added together), decks, marks, reward ledgers, series banlists,
 * pack openings and duels still waiting for a rival. Duels already set up keep
 * their decks: they replay from what they started with, and the engine knows
 * every id. Runs at startup; a no-op once it has run against this id table.
 */
export async function migrateCardIds(db: Db): Promise<CardIdMigrationReport> {
    const meta = db.collection<MigrationDoc>('meta');
    const report: CardIdMigrationReport = { skipped: false, cards: 0, players: 0, series: 0, packSessions: 0, duels: 0 };
    if ((await meta.findOne({ _id: 'card-ids' }))?.table === CARD_ID_TABLE_VERSION) return { ...report, skipped: true };

    // The mirror: a card stored under another id moves to its one id (or goes, if that's already there).
    const cards = cardsCollection(db);
    for (const doc of await cards.find({ _id: { $in: [...OTHER_CARD_IDS] } }).toArray()) {
        const id = canonicalCardId(doc._id);
        if (!(await cards.findOne({ _id: id }, { projection: { _id: 1 } }))) {
            const { _id, ...card } = doc;
            await cards.insertOne({ ...canonicalCard(card), _id: id });
        }
        await cards.deleteOne({ _id: doc._id });
        report.cards++;
    }

    const players = seriesPlayersCollection(db);
    for (const p of await players.find({}).toArray()) {
        const collection = canonicalCollection(p.collection);
        const savedDecks = p.savedDecks.map((d) => ({ ...d, mainDeck: canonicalCardIds(d.mainDeck), extraDeck: canonicalCardIds(d.extraDeck), sideDeck: canonicalCardIds(d.sideDeck) }));
        const rewards = p.rewards.map(canonicalRewardIds);
        const marks = p.marks && distinct(p.marks);
        const changed =
            collection !== p.collection ||
            savedDecks.some((d, i) => !sameIds([...d.mainDeck, ...d.extraDeck, ...d.sideDeck], [...p.savedDecks[i]!.mainDeck, ...p.savedDecks[i]!.extraDeck, ...p.savedDecks[i]!.sideDeck])) ||
            JSON.stringify(rewards) !== JSON.stringify(p.rewards) ||
            (marks !== undefined && !sameIds(marks, p.marks!));
        if (!changed) continue;
        await players.updateOne({ _id: p._id }, { $set: { collection, savedDecks, rewards, ...(marks ? { marks } : {}) } });
        report.players++;
    }

    const series = seriesCollection(db);
    for (const s of await series.find({ bannedCardIds: { $in: [...OTHER_CARD_IDS] } }, { projection: { bannedCardIds: 1 } }).toArray()) {
        await series.updateOne({ _id: s._id }, { $set: { bannedCardIds: distinct(s.bannedCardIds) } });
        report.series++;
    }

    const sessions = packSessions(db);
    // packs is an array of arrays: only $elemMatch reaches the pulls inside.
    for (const s of await sessions.find({ packs: { $elemMatch: { $elemMatch: { id: { $in: [...OTHER_CARD_IDS] } } } } }, { projection: { packs: 1 } }).toArray()) {
        await sessions.updateOne({ _id: s._id }, { $set: { packs: s.packs.map((pack) => pack.map((pull) => ({ ...pull, id: canonicalCardId(pull.id) }))) } });
        report.packSessions++;
    }

    const duels = duelsCollection(db);
    for (const d of await duels.find({ status: 'waiting', challengerDeck: { $exists: true } }, { projection: { challengerDeck: 1 } }).toArray()) {
        const deck = d.challengerDeck!;
        const next = { main: canonicalCardIds(deck.main), extra: canonicalCardIds(deck.extra), ...(deck.side ? { side: canonicalCardIds(deck.side) } : {}) };
        if (sameIds([...next.main, ...next.extra], [...deck.main, ...deck.extra])) continue;
        await duels.updateOne({ _id: d._id }, { $set: { challengerDeck: next } });
        report.duels++;
    }

    await meta.replaceOne({ _id: 'card-ids' }, { table: CARD_ID_TABLE_VERSION, ranAt: new Date() }, { upsert: true });
    return report;
}
