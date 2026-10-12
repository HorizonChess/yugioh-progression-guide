import { render, screen, waitFor } from '@testing-library/react';
import DeckBuilderPage from '@/app/deck-builder/page';

// Mock the context
jest.mock('@/context/ProgressionContext', () => ({
    useProgression: () => ({
        collection: {},
        saveDeck: jest.fn(),
        savedDecks: [],
        deleteDeck: jest.fn(),
    }),
}));

// Mock API
jest.mock('@/lib/api', () => ({
    fetchCardsByIds: jest.fn().mockResolvedValue([]),
}));

// Mock GuideSprite. (The nav — AppNav — is rendered by the root layout, not by
// the DeckBuilder page under test, so there's nothing to mock for it here.)
jest.mock('@/components/layout/GuideSprite', () => {
    return function MockGuideSprite() {
        return <div data-testid="guide-sprite">GuideSprite</div>;
    };
});

describe('Drag and Drop Integration', () => {
    describe('Component Mounting', () => {
        it('should mount without errors', () => {
            const { container } = render(<DeckBuilderPage />);

            // Verify the component rendered by checking for key UI elements
            expect(container.querySelector('input[placeholder="Deck Name"]')).toBeInTheDocument();
            expect(screen.getByText('Save Deck')).toBeInTheDocument();
            expect(screen.getByText('Clear Deck')).toBeInTheDocument();
        });

        it('should render deck management buttons', () => {
            render(<DeckBuilderPage />);

            expect(screen.getByText('Save Deck')).toBeInTheDocument();
            expect(screen.getByText('Load Deck')).toBeInTheDocument();
            expect(screen.getByText('Clear Deck')).toBeInTheDocument();
            expect(screen.getByText('Export')).toBeInTheDocument();
        });
    });

    describe('Initial State', () => {
        it('should have default deck name', () => {
            render(<DeckBuilderPage />);

            const deckNameInput = screen.getByPlaceholderText('Deck Name') as HTMLInputElement;
            expect(deckNameInput.value).toBe('New Deck');
        });
    });

    // Note: Full drag/drop integration tests would require actual card data
    // and more complex setup with drag event simulation. These tests verify
    // the basic structure and mounting behavior.
});
