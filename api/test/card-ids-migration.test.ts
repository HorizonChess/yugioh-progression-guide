import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCardIds } from '../src/cards/card-ids-migration';
import { cardsCollection, type CardDoc } from '../src/cards/sync';
import { duelsCollection } from '../src/duel/hub';
import { packSessions } from '../src/game/packs';
import { blankPlayer, seriesCollection, seriesPlayersCollection } from '../src/game/series';
import { startMongo } from './helpers';

// Real ids (shared/src/card-ids.json): an alternate artwork, and YGOPRODeck's main id that isn't the passcode.
const DARK_MAGICIAN = 46986414, DARK_MAGICIAN_ART = 36996508;
const MONSTER_REBORN = 83764718, MONSTER_REBORN_YGOPRODECK = 83764719;

const card = (id: number, name: string): CardDoc => ({
    _id: id, id, name, type: 'Spell Card', frameType: 'spell', desc: '', race: 'Normal',
    card_sets: [], card_images: [{ id, image_url: 'a', image_url_small: 'b', image_url_cropped: 'c' }],
} as unknown as CardDoc);

let mongo: MongoMemoryReplSet;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
    mongo = await startMongo();
    client = await MongoClient.connect(mongo.getUri());
});
afterAll(async () => {
    await client.close();
    await mongo.stop();
});
beforeEach(() => {
    db = client.db(`ids-${crypto.randomUUID()}`);
});

describe('migrateCardIds', () => {
    it('moves everything stored under another id of a card onto its one id, once', async () => {
        await cardsCollection(db).insertMany([card(MONSTER_REBORN_YGOPRODECK, 'Monster Reborn'), card(DARK_MAGICIAN, 'Dark Magician'), card(DARK_MAGICIAN_ART, 'Dark Magician')]);
        const seriesId = new ObjectId();
        const player = {
            ...blankPlayer(seriesId, new ObjectId()),
            collection: { [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 1, [`${DARK_MAGICIAN_ART}_LOB-005_Ultra Rare`]: 2, [`${MONSTER_REBORN_YGOPRODECK}_LOB-118_Ultra Rare`]: 1 },
            savedDecks: [{ id: 'd', name: 'D', mainDeck: [DARK_MAGICIAN_ART, MONSTER_REBORN_YGOPRODECK], extraDeck: [], sideDeck: [], createdAt: new Date() }],
            marks: [DARK_MAGICIAN, DARK_MAGICIAN_ART],
            rewards: [{ id: 'r', prizeId: 'wildcard-ultra' as const, wonFromPackName: 'LOB', wonFromSetIndex: 0, wonDate: '', status: 'claimed' as const, grantedCardId: MONSTER_REBORN_YGOPRODECK }],
        };
        const untouched = blankPlayer(seriesId, new ObjectId());
        await seriesPlayersCollection(db).insertMany([player, untouched]);
        await seriesCollection(db).insertOne({ _id: seriesId, bannedCardIds: [MONSTER_REBORN_YGOPRODECK, MONSTER_REBORN] } as never);
        const pack = await packSessions(db).insertOne({ packs: [[{ id: DARK_MAGICIAN_ART, rarity: 'Ultra Rare', setCode: 'LOB-005' }]] } as never);
        const duel = await duelsCollection(db).insertOne({ status: 'waiting', challengerDeck: { main: [MONSTER_REBORN_YGOPRODECK], extra: [] } } as never);

        const report = await migrateCardIds(db);
        expect(report).toMatchObject({ skipped: false, cards: 2, players: 1, series: 1, packSessions: 1, duels: 1 });

        const ids = (await cardsCollection(db).find().toArray()).map((c) => [c._id, c.id]).sort((a, b) => a[0]! - b[0]!);
        expect(ids).toEqual([[DARK_MAGICIAN, DARK_MAGICIAN], [MONSTER_REBORN, MONSTER_REBORN]]);

        const p = (await seriesPlayersCollection(db).findOne({ _id: player._id }))!;
        expect(p.collection).toEqual({ [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 3, [`${MONSTER_REBORN}_LOB-118_Ultra Rare`]: 1 });
        expect(p.savedDecks[0]!.mainDeck).toEqual([DARK_MAGICIAN, MONSTER_REBORN]);
        expect(p.marks).toEqual([DARK_MAGICIAN]);
        expect(p.rewards[0]!.grantedCardId).toBe(MONSTER_REBORN);
        expect((await seriesCollection(db).findOne({ _id: seriesId }))!.bannedCardIds).toEqual([MONSTER_REBORN]);
        expect((await packSessions(db).findOne({ _id: pack.insertedId }))!.packs[0]![0]!.id).toBe(DARK_MAGICIAN);
        expect((await duelsCollection(db).findOne({ _id: duel.insertedId }))!.challengerDeck!.main).toEqual([MONSTER_REBORN]);

        // Against the same id table it has nothing more to do.
        expect((await migrateCardIds(db)).skipped).toBe(true);
    });
});
