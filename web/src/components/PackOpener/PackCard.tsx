import { Card } from "@/lib/api";

interface PackCardProps {
    card: Card;
    isFlipped: boolean;
    onClick: () => void;
    rarity: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onMouseMove?: (e: React.MouseEvent) => void;
    width?: string;
}

export default function PackCard({ card, isFlipped, onClick, rarity, onMouseEnter, onMouseLeave, onMouseMove, width = '19%' }: PackCardProps) {
    return (
        <div
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onMouseMove={onMouseMove}
            className="flex flex-col items-center justify-center cursor-pointer group mb-8"
            style={{
                // Grid Cell Sizing
                // We reserve 19% width for the grid column (default) or custom width
                flexBasis: width,
                maxWidth: width,
                // We don't set fixed height here, we let the content drive it up to a limit
                position: 'relative',
                zIndex: 1,
            }}
        >
            {/* Inner Wrapper - Constrains the card size */}
            <div className="relative">
                {/* Sizer Image - Invisible but dictates the size */}
                {/* This ensures the container is exactly the size of the image, respecting max-height and max-width */}
                <img
                    src={card.card_images[0].image_url}
                    alt="Sizer"
                    className="opacity-0 pointer-events-none"
                    style={{
                        maxHeight: '26vh', // Increased to 26vh as a middle ground
                        width: 'auto',     // Maintain aspect ratio
                        maxWidth: '100%',  // Don't overflow the 19% parent width
                        display: 'block',  // Remove inline spacing
                    }}
                />

                {/* 3D Flip Container - Absolutely positioned over the sizer */}
                <div className={`absolute inset-0 w-full h-full transform-style-3d transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`}>
                    {/* Card Back */}
                    <div className="absolute inset-0 backface-hidden rounded-lg overflow-hidden shadow-xl border border-white/10">
                        <img
                            src={`${process.env.NEXT_PUBLIC_IMAGE_HOST}/cards/back_high.jpg`}
                            alt="Card Back"
                            className="w-full h-full object-cover"
                            style={{ imageRendering: 'auto' }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-white/10 transition-colors"></div>
                    </div>

                    {/* Card Front */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-lg overflow-hidden shadow-xl border border-white/10">
                        <img
                            src={card.card_images[0].image_url}
                            alt={card.name}
                            className="w-full h-full object-cover"
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                </div>

                {/* Text Label - Outside the 3D context but aligned to the card */}
                <div className={`absolute -bottom-10 left-1/2 -translate-x-1/2 w-[140%] text-center transition-opacity duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0'} pointer-events-none z-10`}>
                    <p className="text-white font-bold text-xs leading-tight line-clamp-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] px-1 truncate antialiased">
                        {card.name}
                    </p>
                    <p className="text-[#d4af37] text-[10px] font-bold uppercase tracking-wider mt-0.5 drop-shadow-md antialiased">
                        {rarity}
                    </p>
                </div>
            </div>
        </div>
    );
}
