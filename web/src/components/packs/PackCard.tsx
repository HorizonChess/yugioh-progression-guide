import { Card } from "@/lib/api";

interface PackCardProps {
    card: Card;
    isFlipped: boolean;
    onClick: () => void;
    rarity: string;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
}

/**
 * A single pulled card in the pack-opening reveal. Sizes itself to fill its
 * grid cell: an invisible "sizer" image (native aspect ratio, capped at the
 * cell's height/width) dictates the box, and the flip faces are absolutely
 * positioned over it — so the card is as large as the cell allows while
 * ALWAYS preserving its aspect ratio (no stretch). The name/rarity label sits
 * beneath the card in normal flow (no fixed offset). All spacing/sizing comes
 * from the parent `.pack-grid` — this component sets no magic numbers.
 */
export default function PackCard({ card, isFlipped, onClick, rarity, onMouseEnter, onMouseLeave }: PackCardProps) {
    return (
        <div
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className="pack-card group"
        >
            {/* Card box — height-driven; sizer keeps aspect ratio */}
            <div className="pack-card__box">
                <img
                    src={card.card_images[0]?.image_url}
                    alt="Sizer"
                    className="pack-card__sizer"
                />

                {/* 3D flip container over the sizer */}
                <div className={`absolute inset-0 w-full h-full transform-style-3d transition-transform duration-500 ${isFlipped ? "rotate-y-180" : ""}`}>
                    <div className="absolute inset-0 backface-hidden rounded-lg overflow-hidden shadow-xl border border-white/10">
                        <img
                            src={`${process.env.NEXT_PUBLIC_IMAGE_HOST}/cards/back_high.jpg`}
                            alt="Card Back"
                            className="w-full h-full object-cover"
                            style={{ imageRendering: "auto" }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-white/10 transition-colors" />
                    </div>
                    <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-lg overflow-hidden shadow-xl border border-white/10">
                        <img
                            src={card.card_images[0]?.image_url}
                            alt={card.name}
                            className="w-full h-full object-cover"
                            style={{ transform: "translateZ(0)" }}
                        />
                    </div>
                </div>
            </div>

            {/* Name + rarity — revealed once flipped */}
            <div className={`pack-card__label ${isFlipped ? "opacity-100" : "opacity-0"}`}>
                <p className="text-white font-bold text-xs leading-tight line-clamp-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] px-1 truncate antialiased">
                    {card.name}
                </p>
                <p className="text-primary text-[10px] font-bold uppercase tracking-wider drop-shadow-md antialiased">
                    {rarity}
                </p>
            </div>
        </div>
    );
}
