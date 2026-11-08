import { loadPersistedState } from '@/lib/storage';
import { readDeckDraft } from '@/lib/deck-draft';
import { parseYDK, parseYDKWithSections } from '@/lib/ydk-parser';

// Real ids (shared/src/card-ids.json): Dark Magician and one of its alternate artworks,
// Monster Reborn's passcode and the id YGOPRODeck lists it under.
const DM = 46986414, DM_ART = 36996508;
const REBORN = 83764718, REBORN_YGOPRODECK = 83764719;

beforeEach(() => localStorage.clear());

describe('one id per card in what this browser kept', () => {
    it('moves an older guest save onto the one ids', () => {
        localStorage.setItem('yugioh-progression-saves-v2', JSON.stringify({
            activeSaveId: 's1',
            saves: [{
                id: 's1',
                collection: { [`${DM}_LOB-005_Ultra Rare`]: 1, [`${DM_ART}_LOB-005_Ultra Rare`]: 1, [`${REBORN_YGOPRODECK}_LOB-118_Ultra Rare`]: 2 },
                bannedCardIds: [REBORN_YGOPRODECK, REBORN],
                marks: [DM_ART],
                rewards: [{ id: 'r', prizeId: 'wildcard-ultra', wonFromPackName: 'LOB', wonFromSetIndex: 0, wonDate: '', status: 'claimed', grantedCardId: DM_ART }],
                savedDecks: [{ id: 'd', name: 'D', mainDeck: [DM_ART, REBORN_YGOPRODECK], extraDeck: [], sideDeck: [] }],
            }],
        }));
        const save = loadPersistedState().saves[0]!;
        expect(save.collection).toEqual({ [`${DM}_LOB-005_Ultra Rare`]: 2, [`${REBORN}_LOB-118_Ultra Rare`]: 2 });
        expect(save.bannedCardIds).toEqual([REBORN]);
        expect(save.marks).toEqual([DM]);
        expect(save.rewards[0]!.grantedCardId).toBe(DM);
        expect(save.savedDecks[0]!.mainDeck).toEqual([DM, REBORN]);
    });

    it('moves a deck draft onto the one ids', () => {
        localStorage.setItem('deckDraft:s1', JSON.stringify({ name: 'D', mainDeck: [DM_ART], extraDeck: [], sideDeck: [REBORN_YGOPRODECK] }));
        expect(readDeckDraft('s1')).toEqual({ name: 'D', mainDeck: [DM], extraDeck: [], sideDeck: [REBORN] });
    });

    it('reads a YDK file onto the one ids', () => {
        const ydk = `#main\n${DM_ART}\n${REBORN_YGOPRODECK}\n#extra\n!side\n${DM}\n`;
        expect(parseYDK(ydk)).toEqual([DM, REBORN, DM]);
        expect(parseYDKWithSections(ydk)).toEqual({ main: [DM, REBORN], extra: [], side: [DM] });
    });
});
