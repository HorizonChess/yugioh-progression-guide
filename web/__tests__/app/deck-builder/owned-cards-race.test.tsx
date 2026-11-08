import { act, render, screen } from '@testing-library/react';
import DeckBuilderPage from '@/app/deck-builder/page';
import { fetchCardsByIds } from '@/lib/api';

/*
 * Opening the deck builder starts two fetches at once: every owned card (for the
 * search panel) and the cards of the last saved deck (auto-loaded). Whichever
 * landed last used to replace the card list, so a saved deck of 9 cards could
 * shrink a bigger collection to those 9 on most reloads.
 */

const card = (id: number) => ({
    id,
    name: `Card ${id}`,
    type: 'Normal Monster',
    desc: '',
    race: 'Warrior',
    atk: 1000,
    def: 1000,
    level: 4,
    attribute: 'EARTH',
    card_images: [{ id, image_url: '', image_url_small: '', image_url_cropped: '' }],
});

const OWNED = [1, 2, 3, 4, 5];
const DECK = [1, 2];

// One stable value, as the real context gives: a new collection each render would refetch forever.
const mockProgression = {
    collection: Object.fromEntries(OWNED.map((id) => [`${id}_LOB_Common`, 1])),
    saveDeck: jest.fn(),
    savedDecks: [{ id: 'd1', name: 'First pack', mainDeck: DECK, extraDeck: [], sideDeck: [], createdAt: 1 }],
    deleteDeck: jest.fn(),
    bannedCardIds: [],
    marks: new Set(),
};

jest.mock('@/context/ProgressionContext', () => ({
    useProgression: () => mockProgression,
    alertRepoError: jest.fn(),
}));

jest.mock('@/lib/api', () => ({ fetchCardsByIds: jest.fn() }));

jest.mock('@/components/layout/GuideSprite', () => function MockGuideSprite() {
    return null;
});

it('keeps every owned card when the saved deck finishes loading last', async () => {
    let finishDeck: (cards: unknown[]) => void = () => {};
    jest.mocked(fetchCardsByIds).mockImplementation((ids: number[]) => {
        if (ids.length === OWNED.length) return Promise.resolve(OWNED.map(card) as never);
        return new Promise((resolve) => {
            finishDeck = resolve as typeof finishDeck;
        });
    });

    render(<DeckBuilderPage />);
    expect(await screen.findByText('5 yours')).toBeInTheDocument();

    // The saved deck's own fetch lands after the owned cards.
    await act(async () => finishDeck(DECK.map(card)));

    expect(screen.getByText('5 yours')).toBeInTheDocument();
});
