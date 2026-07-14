import Link from "next/link";
import { ReactNode } from "react";

interface FrameButtonProps {
    children: ReactNode;
    onClick?: () => void;
    href?: string;
    className?: string;
    /** Extra classes for the inner text (size, tracking, etc.) */
    textClassName?: string;
    "aria-label"?: string;
}

/**
 * FrameButton — an image-framed button whose ornate border is an SVG rendered
 * via CSS `border-image` (9-slice). Corners stay fixed while flat edges stretch,
 * so the frame never distorts at any width/height — unlike the old GoldButton,
 * which stretched a square PNG and drifted its %-pinned text.
 *
 * The label is real flow content centered by flexbox (no magic offsets), so it
 * stays correctly positioned regardless of button size.
 *
 * Size the button from the OUTSIDE (width/height utility classes on `className`),
 * e.g. <FrameButton className="w-64 h-16 text-lg">OPEN PACKS</FrameButton>.
 */
export default function FrameButton({
    children,
    onClick,
    href,
    className = "",
    textClassName = "",
    "aria-label": ariaLabel,
}: FrameButtonProps) {
    // Single continuous fill + a frame ring on top, so there is no seam:
    //  - CSS stone gradient fills the WHOLE box (background-clip: border-box),
    //    extending under the frame — no transparent gap ring.
    //  - border-image draws ONLY the gold frame (slice WITHOUT `fill`, so it
    //    does not paint the SVG's transparent center over the fill).
    //  - `round` tiles the edge meander cleanly (no smear, no gaps).
    const frameStyle = {
        borderStyle: "solid" as const,
        borderWidth: "clamp(0.6rem, 1.2vw, 0.9rem)",
        borderImageSource: "url('/ui/frame_gold.svg')",
        borderImageSlice: "58", // no `fill` — frame only, CSS supplies the center
        borderImageRepeat: "round",
        borderImageWidth: "1",
        boxSizing: "border-box" as const,
        outline: "none",
        // Stone fill under everything (border-box => reaches under the frame).
        backgroundColor: "var(--gold-stone)",
        backgroundImage: "radial-gradient(circle at 50% 42%, var(--gold-stone-light) 0%, var(--gold-stone) 60%, var(--gold-stone-dark) 100%)",
        backgroundClip: "border-box" as const,
        // GPU layer so hover scale never re-rasterizes / re-tiles the frame.
        willChange: "transform" as const,
        backfaceVisibility: "hidden" as const,
    };

    const base =
        "relative inline-flex items-center justify-center select-none outline-none " +
        "transform-gpu transition-transform duration-150 hover:scale-105 active:scale-100 drop-shadow-2xl " +
        className;

    // Uniform font size across ALL FrameButtons (responsive but consistent).
    // textClassName can still tweak tracking/weight but should NOT set size.
    const label = (
        <span
            className={`text-ink font-black uppercase tracking-wide whitespace-nowrap text-center leading-none text-[clamp(0.8rem,1.6vh,1.05rem)] ${textClassName}`}
            style={{ fontFamily: "var(--font-techno)", textShadow: "0 1px 1px rgba(255,255,255,0.5)" }}
        >
            {children}
        </span>
    );

    if (href) {
        return (
            <Link href={href} className={base} style={frameStyle} aria-label={ariaLabel}>
                {label}
            </Link>
        );
    }

    return (
        <button onClick={onClick} className={base} style={frameStyle} aria-label={ariaLabel}>
            {label}
        </button>
    );
}
