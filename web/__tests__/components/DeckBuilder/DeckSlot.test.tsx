import { render, screen, fireEvent } from '@testing-library/react';
import DeckSlot from '@/components/DeckBuilder/DeckSlot';
import { Card } from '@/lib/api';

const mockCard: Card = {
    id: 12345,
    name: 'Dark Magician',
    type: 'Spellcaster / Effect Monster',
    desc: 'The ultimate wizard',
    card_images: [{ image_url: 'https://example.com/card.jpg' }]
} as Card;

describe('DeckSlot', () => {
    describe('State Management', () => {
        it('should reset isDragging when card changes', () => {
            const onDragStart = jest.fn();

            const { rerender } = render(
                <DeckSlot
                    card={mockCard}
                    index={0}
                    dragContext="deck"
                    onDragStart={onDragStart}
                />
            );

            const img = screen.getByRole('img');
            const slot = img.parentElement!;

            // Start drag on the draggable element (parent div, not img)
            fireEvent.dragStart(slot, {
                dataTransfer: {
                    setData: jest.fn(),
                    effectAllowed: '',
                },
            });

            // Verify opacity-0 is applied (isDragging = true)
            expect(slot).toHaveClass('opacity-0');

            // Change card (should reset states)
            const newCard = { ...mockCard, id: 67890, name: 'Blue-Eyes White Dragon' };
            rerender(
                <DeckSlot
                    card={newCard}
                    index={0}
                    dragContext="deck"
                    onDragStart={onDragStart}
                />
            );

            // Verify opacity-0 is removed (isDragging reset to false)
            const newImg = screen.getByRole('img');
            const newSlot = newImg.parentElement!;
            expect(newSlot).not.toHaveClass('opacity-0');
        });

        it('should cleanup states on unmount', () => {
            const { unmount } = render(
                <DeckSlot
                    card={mockCard}
                    index={0}
                    dragContext="deck"
                />
            );

            // Should not throw on unmount
            expect(() => unmount()).not.toThrow();
        });
    });

    describe('Drag and Drop', () => {
        it('should handle drop errors gracefully', () => {
            const onDropError = jest.fn(() => {
                throw new Error('Drop failed');
            });

            render(
                <DeckSlot
                    card={mockCard}
                    index={0}
                    onDrop={onDropError}
                />
            );

            const slot = screen.getByRole('img').parentElement!;

            // Should not throw when drop handler errors
            expect(() => {
                fireEvent.drop(slot, {
                    dataTransfer: {
                        getData: () => JSON.stringify({ cardId: 12345 }),
                    },
                });
            }).not.toThrow();
        });

        it('should reset isDragOver after drop', () => {
            const onDrop = jest.fn();

            const { container } = render(
                <DeckSlot
                    card={undefined}
                    index={0}
                    onDrop={onDrop}
                />
            );

            // Find the inner slot div (has aspect ratio and handles drag events)
            const slot = container.querySelector('[class*="aspect-"]') as HTMLElement;
            expect(slot).toBeInTheDocument();

            // Trigger dragOver
            fireEvent.dragOver(slot, {
                dataTransfer: {},
            });

            // Should have isDragOver styles
            expect(slot).toHaveClass('ring-4');

            // Trigger drop
            fireEvent.drop(slot, {
                dataTransfer: {
                    getData: () => JSON.stringify({ cardId: 12345 }),
                },
            });

            // isDragOver should be reset
            expect(slot).not.toHaveClass('ring-4');
        });
    });

    describe('Visual States', () => {
        it('should apply opacity-0 when dragging from deck', () => {
            render(
                <DeckSlot
                    card={mockCard}
                    index={0}
                    dragContext="deck"
                    onDragStart={jest.fn()}
                />
            );

            const img = screen.getByRole('img');
            const slot = img.parentElement!;

            fireEvent.dragStart(slot, {
                dataTransfer: {
                    setData: jest.fn(),
                    effectAllowed: '',
                },
            });

            expect(slot).toHaveClass('opacity-0');
        });

        it('should NOT apply opacity-0 when dragging from search', () => {
            render(
                <DeckSlot
                    card={mockCard}
                    index={0}
                    dragContext="search"
                    onDragStart={jest.fn()}
                />
            );

            const img = screen.getByRole('img');
            const slot = img.parentElement!;

            fireEvent.dragStart(slot, {
                dataTransfer: {
                    setData: jest.fn(),
                    effectAllowed: '',
                },
            });

            expect(slot).not.toHaveClass('opacity-0');
        });
    });
});
