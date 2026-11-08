import { act, fireEvent, render, screen } from '@testing-library/react';
import DeckBuilderPage from '@/app/deck-builder/page';
import { fetchCardsByIds } from '@/lib/api';

/*
 * Opening the deck builder starts two fetches at once: every owned card (for the
 * search panel) and the cards of the deck you left (restored from its draft).
 * Whichever landed last used to replace the card list, so a deck of 9 cards could
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
const DRAFT_KEY = 'deckDraft:s1';

// One stable value, as the real context gives: a new collection each render would refetch forever.
const mockProgression = {
    activeSeriesId: 's1',
    collection: Object.fromEntries(OWNED.map((id) => [`${id}_LOB_Common`, 1])),
    saveDeck: jest.fn(),
    savedDecks: [],
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

beforeEach(() => localStorage.clear());

it('keeps every owned card when the deck finishes loading last', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: 'First pack', mainDeck: DECK, extraDeck: [], sideDeck: [] }));
    let finishDeck: (cards: unknown[]) => void = () => {};
    jest.mocked(fetchCardsByIds).mockImplementation((ids: number[]) => {
        if (ids.length === OWNED.length) return Promise.resolve(OWNED.map(card) as never);
        return new Promise((resolve) => {
            finishDeck = resolve as typeof finishDeck;
        });
    });

    render(<DeckBuilderPage />);
    expect(await screen.findByText('5 yours')).toBeInTheDocument();

    // The deck's own fetch lands after the owned cards.
    await act(async () => finishDeck(DECK.map(card)));

    expect(screen.getByText('5 yours')).toBeInTheDocument();
});

it('reopens the deck as you left it, and keeps your changes as you go', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: 'Work in progress', mainDeck: DECK, extraDeck: [], sideDeck: [] }));
    jest.mocked(fetchCardsByIds).mockImplementation((ids: number[]) => Promise.resolve(ids.map(card) as never));

    render(<DeckBuilderPage />);
    const name = (await screen.findByDisplayValue('Work in progress')) as HTMLInputElement;
    await act(async () => {});
    const saved = () => JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    // Restoring doesn't clobber the draft with the empty starting deck.
    expect(saved()).toEqual({ name: 'Work in progress', mainDeck: DECK, extraDeck: [], sideDeck: [] });

    fireEvent.change(name, { target: { value: 'Renamed' } });
    expect(saved().name).toBe('Renamed');
    expect(saved().mainDeck).toEqual(DECK);
});

it('starts a new deck when there is no draft', async () => {
    jest.mocked(fetchCardsByIds).mockImplementation((ids: number[]) => Promise.resolve(ids.map(card) as never));
    render(<DeckBuilderPage />);
    expect(await screen.findByDisplayValue('New Deck')).toBeInTheDocument();
    await act(async () => {});
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')).toEqual({ name: 'New Deck', mainDeck: [], extraDeck: [], sideDeck: [] });
});
