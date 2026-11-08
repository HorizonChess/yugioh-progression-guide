import { describe, expect, it } from 'vitest';
import {
    CardIdSchema,
    canonicalCard,
    canonicalCardId,
    canonicalCards,
    canonicalCollection,
    canonicalRewardIds,
} from './card-ids';
import { GuestSaveBodySchema } from './schemas/series';

// Real ids, from the engine data and YGOPRODeck (see api/scripts/build-card-ids.ts).
const DARK_MAGICIAN = 46986414, DARK_MAGICIAN_ART = 36996508;
const MONSTER_REBORN = 83764718, MONSTER_REBORN_YGOPRODECK = 83764719;
const HARPIE_LADY_1 = 91932350; // "always treated as Harpie Lady", but its own card
const BLUE_EYES = 89631139, BLUE_EYES_ART = 89631140;

describe('canonicalCardId', () => {
    it('moves an alternate artwork onto the card', () => {
        expect(canonicalCardId(DARK_MAGICIAN_ART)).toBe(DARK_MAGICIAN);
        expect(canonicalCardId(BLUE_EYES_ART)).toBe(BLUE_EYES);
    });

    it("moves YGOPRODeck's main id onto the passcode where they differ", () => {
        expect(canonicalCardId(MONSTER_REBORN_YGOPRODECK)).toBe(MONSTER_REBORN);
    });

    it('leaves a card that the rules treat as another its own id', () => {
        expect(canonicalCardId(HARPIE_LADY_1)).toBe(HARPIE_LADY_1);
    });

    it('leaves one ids and unknown ids alone', () => {
        expect(canonicalCardId(DARK_MAGICIAN)).toBe(DARK_MAGICIAN);
        expect(canonicalCardId(123)).toBe(123);
    });
});

describe('canonicalCard(s)', () => {
    const art = { id: DARK_MAGICIAN_ART, name: 'Dark Magician', card_images: [{ id: DARK_MAGICIAN_ART }] };

    it('gives the card its one id and keeps its artwork', () => {
        expect(canonicalCard(art)).toEqual({ ...art, id: DARK_MAGICIAN });
    });

    it('keeps the first of two entries that are the same card', () => {
        const list = canonicalCards([art, { ...art, id: DARK_MAGICIAN, card_images: [{ id: DARK_MAGICIAN }] }, { id: 5, name: 'x', card_images: [] }]);
        expect(list.map((c) => c.id)).toEqual([DARK_MAGICIAN, 5]);
        expect(list[0]!.card_images[0]!.id).toBe(DARK_MAGICIAN_ART);
    });
});

describe('canonicalCollection', () => {
    it('adds copies of one printing held under two ids together', () => {
        const before = {
            [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 1,
            [`${DARK_MAGICIAN_ART}_LOB-005_Ultra Rare`]: 2,
            [`${DARK_MAGICIAN_ART}_SDY-006_Common`]: 1,
            [`${MONSTER_REBORN_YGOPRODECK}_Unknown_Common`]: 1,
        };
        expect(canonicalCollection(before)).toEqual({
            [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 3,
            [`${DARK_MAGICIAN}_SDY-006_Common`]: 1,
            [`${MONSTER_REBORN}_Unknown_Common`]: 1,
        });
    });

    it('hands back the same object when nothing moves', () => {
        const c = { [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 1 };
        expect(canonicalCollection(c)).toBe(c);
    });
});

describe('canonicalRewardIds', () => {
    it('moves every card id a reward names', () => {
        const entry = { id: 'r', grantedCardId: DARK_MAGICIAN_ART, grantedCardIds: [MONSTER_REBORN_YGOPRODECK, 7], bannedCardId: BLUE_EYES_ART };
        expect(canonicalRewardIds(entry)).toEqual({ id: 'r', grantedCardId: DARK_MAGICIAN, grantedCardIds: [MONSTER_REBORN, 7], bannedCardId: BLUE_EYES });
    });
});

describe('request bodies', () => {
    it('read a card id as its one id', () => {
        expect(CardIdSchema.parse(DARK_MAGICIAN_ART)).toBe(DARK_MAGICIAN);
        expect(CardIdSchema.safeParse(0).success).toBe(false);
    });

    it('move a guest save onto the one ids', () => {
        const save = GuestSaveBodySchema.parse({
            saveId: 's1', name: 'Run', startSetIndex: 0, currentSetIndex: 0, packsPerSet: 24,
            collection: { [`${DARK_MAGICIAN_ART}_LOB-005_Ultra Rare`]: 1, [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 1 },
            matchHistory: [], rewards: [], bannedCardIds: [MONSTER_REBORN_YGOPRODECK],
            savedDecks: [{ id: 'd', name: 'D', mainDeck: [BLUE_EYES_ART], extraDeck: [], sideDeck: [], createdAt: 0 }],
        });
        expect(save.collection).toEqual({ [`${DARK_MAGICIAN}_LOB-005_Ultra Rare`]: 2 });
        expect(save.bannedCardIds).toEqual([MONSTER_REBORN]);
        expect(save.savedDecks[0]!.mainDeck).toEqual([BLUE_EYES]);
    });
});
