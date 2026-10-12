import { render, screen } from '@testing-library/react';
import SideExtraDeckGrid from '@/components/deck-builder/SideExtraDeckGrid';
import { Card } from '@/lib/api';

const mockCard: Card = {
    id: 12345,
    name: 'Dark Magician',
    type: 'Spellcaster / Effect Monster',
    card_images: [{ image_url: 'https://example.com/card.jpg' }]
} as Card;

describe('SideExtraDeckGrid', () => {
    const mockProps = {
        sideDeck: [],
        extraDeck: [],
        onHover: jest.fn(),
        onDragStart: jest.fn(),
        onDrag: jest.fn(),
        onDragEnd: jest.fn(),
        onDrop: jest.fn(),
        onRightClick: jest.fn(),
    };

    describe('Slot Rendering', () => {
        it('should render all 15 side deck slots even when empty', () => {
            const { container } = render(
                <SideExtraDeckGrid {...mockProps} sideDeck={[]} />
            );

            // Side deck section should have 15 slots (look for the wrapper divs with w-[calc(...)])
            const sideDeckContainer = container.querySelector('.flex-wrap');
            const sideSlots = sideDeckContainer?.querySelectorAll('[class*="w-[calc(25%-1.5px)]"]');
            expect(sideSlots).toHaveLength(15);
        });

        it('should render all 15 extra deck slots even when empty', () => {
            const { container } = render(
                <SideExtraDeckGrid {...mockProps} extraDeck={[]} />
            );

            // Both side and extra sections
            const allContainers = container.querySelectorAll('.flex-wrap');
            const extraDeckContainer = allContainers[1]; // Second grid
            const extraSlots = extraDeckContainer?.querySelectorAll('[class*="w-[calc(25%-1.5px)]"]');
            expect(extraSlots).toHaveLength(15);
        });

        it('should render first slot when only one card exists', () => {
            const { container } = render(
                <SideExtraDeckGrid
                    {...mockProps}
                    extraDeck={[mockCard]}
                />
            );

            const allContainers = container.querySelectorAll('.flex-wrap');
            const extraDeckContainer = allContainers[1];
            const extraSlots = extraDeckContainer?.querySelectorAll('[class*="w-[calc(25%-1.5px)]"]');

            // Should still render all 15 slots
            expect(extraSlots).toHaveLength(15);

            // First slot should have the card (check for image in the container)
            const images = extraDeckContainer?.querySelectorAll('img');
            expect(images?.length).toBeGreaterThan(0);
        });

        it('should render with mixed filled and empty slots', () => {
            const cards = [mockCard, mockCard, mockCard]; // 3 cards

            const { container } = render(
                <SideExtraDeckGrid
                    {...mockProps}
                    extraDeck={cards}
                />
            );

            const allContainers = container.querySelectorAll('.flex-wrap');
            const extraDeckContainer = allContainers[1];
            const extraSlots = extraDeckContainer?.querySelectorAll('[class*="w-[calc(25%-1.5px)]"]');

            expect(extraSlots).toHaveLength(15);

            // First 3 should have images
            const images = extraDeckContainer?.querySelectorAll('img');
            expect(images).toHaveLength(3);
        });
    });

    describe('Deck Counters', () => {
        it('should display correct side deck count', () => {
            const cards = Array(5).fill(mockCard);
            render(
                <SideExtraDeckGrid
                    {...mockProps}
                    sideDeck={cards}
                />
            );

            expect(screen.getByText(/SIDE DECK.*5.*15/i)).toBeInTheDocument();
        });

        it('should display correct extra deck count', () => {
            const cards = Array(8).fill(mockCard);
            render(
                <SideExtraDeckGrid
                    {...mockProps}
                    extraDeck={cards}
                />
            );

            expect(screen.getByText(/EXTRA DECK.*8.*15/i)).toBeInTheDocument();
        });
    });
});
