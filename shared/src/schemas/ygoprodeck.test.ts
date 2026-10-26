import { describe, expect, it } from 'vitest';
import { CardSchema, CardSetSchema } from './ygoprodeck';

// Shapes copied from real /cardinfo.php and /cardsets.php responses.
const decodeTalker = {
    id: 1861629,
    name: 'Decode Talker',
    type: 'Link Monster',
    humanReadableCardType: 'Link Effect Monster',
    frameType: 'link',
    desc: '2+ Effect Monsters',
    race: 'Cyberse',
    atk: 2300,
    def: null,
    level: null,
    attribute: 'DARK',
    archetype: 'Code Talker',
    linkval: 3,
    linkmarkers: ['Top', 'Bottom-Left', 'Bottom-Right'],
    ygoprodeck_url: 'https://ygoprodeck.com/card/decode-talker-1',
    card_sets: [{ set_name: 'Starter Deck: Link Strike', set_code: 'YS17-EN041', set_rarity: 'Common', set_rarity_code: '(C)', set_price: '0.99' }],
    card_images: [{ id: 1861629, image_url: 'a', image_url_small: 'b', image_url_cropped: 'c' }],
    card_prices: [{ tcgplayer_price: '0.10' }],
};

describe('CardSchema', () => {
    it('keeps the game fields and drops prices and URLs', () => {
        const card = CardSchema.parse(decodeTalker);
        expect(card).not.toHaveProperty('card_prices');
        expect(card).not.toHaveProperty('ygoprodeck_url');
        expect(card).not.toHaveProperty('humanReadableCardType');
        expect(card.card_sets?.[0]?.set_code).toBe('YS17-EN041');
    });

    it('turns null stats into absent ones', () => {
        const card = CardSchema.parse(decodeTalker);
        expect(card.def).toBeUndefined();
        expect(card.level).toBeUndefined();
        expect(card.atk).toBe(2300);
    });

    it('accepts cards with no printings', () => {
        const { card_sets: _, ...promo } = decodeTalker;
        expect(CardSchema.parse(promo).card_sets).toBeUndefined();
    });

    it('rejects malformed cards', () => {
        expect(CardSchema.safeParse({ ...decodeTalker, id: 'abc' }).success).toBe(false);
        expect(CardSchema.safeParse({ ...decodeTalker, card_images: undefined }).success).toBe(false);
    });
});

describe('CardSetSchema', () => {
    it('stores a missing release date as empty (undated)', () => {
        const set = CardSetSchema.parse({ set_name: 'Promo', set_code: 'PR', num_of_cards: 3 });
        expect(set.tcg_date).toBe('');
    });

    it('drops the hotlinkable set image', () => {
        const set = CardSetSchema.parse({ set_name: 'LOB', set_code: 'LOB', num_of_cards: 126, tcg_date: '2002-03-08', set_image: 'https://x/y.jpg' });
        expect(set).not.toHaveProperty('set_image');
    });
});
