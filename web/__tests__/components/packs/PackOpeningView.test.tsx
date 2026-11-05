import { render } from "@testing-library/react";
import PackOpeningView from "@/components/packs/PackOpeningView";
import type { CardSet, PulledCard } from "@/lib/api";

const set = { set_name: "Legend of Blue Eyes White Dragon", set_code: "LOB" } as CardSet;
const card = (id: number) => ({ id, name: `Card ${id}`, card_images: [{ image_url: `${id}.jpg` }], card_sets: [] }) as unknown as PulledCard;

const view = (packIndex: number, pack: PulledCard[], flipped: number[]) => (
    <PackOpeningView
        set={set}
        pack={pack}
        packIndex={packIndex}
        packCount={3}
        flippedCards={new Set(flipped)}
        fullyOpened={flipped.length === pack.length}
        onCardClick={jest.fn()}
        onFlipAll={jest.fn()}
        onNextPack={jest.fn()}
        onOpenAll={jest.fn()}
        onBack={jest.fn()}
        onHover={jest.fn()}
        onLeave={jest.fn()}
    />
);

it("starts the next pack's cards fresh, even where it repeats a card in the same slot", () => {
    const { container, rerender } = render(view(0, [card(1), card(2)], [0, 1]));
    const faceUp = container.querySelector(".pack-card");

    rerender(view(1, [card(1), card(3)], []));

    // A reused element would animate from face up to face down, flashing the old card.
    expect(container.querySelector(".pack-card")).not.toBe(faceUp);
    expect(container.querySelector(".rotate-y-180.transform-style-3d")).toBeNull();
});
