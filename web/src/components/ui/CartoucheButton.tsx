import Link from "next/link";
import { ReactNode } from "react";
import { asset } from "@/lib/utils";

const IMAGE = `url('${asset("/ui/buttons/cartouche.webp")}')`;
const FACE = { backgroundImage: IMAGE };
// The hover shine is cut to the cartouche's own outline, not the button's box.
const SHAPE = { maskImage: IMAGE, WebkitMaskImage: IMAGE };

/**
 * The gold cartouche button: ONE painted image (never sliced or stretched out of
 * shape), so size it by width only and its height follows the picture. `next`
 * pulses it as the step the game is pointing at. The remastered square button
 * in /ui/buttons/remaster-alt.webp is kept for a future visual-options setting.
 */
export default function CartoucheButton({
    children,
    href,
    onClick,
    className = "",
    next = false,
    "aria-label": ariaLabel,
}: {
    children: ReactNode;
    href?: string;
    onClick?: () => void;
    className?: string;
    next?: boolean;
    "aria-label"?: string;
}) {
    const cls = `cartouche-btn ${next ? "cartouche-btn--next" : ""} ${className}`;
    const label = (
        <>
            <span className="cartouche-btn__glint" style={SHAPE} aria-hidden="true" />
            <span className="cartouche-btn__label">{children}</span>
        </>
    );
    return href ? (
        <Link href={href} onClick={onClick} className={cls} style={FACE} aria-label={ariaLabel}>{label}</Link>
    ) : (
        <button type="button" onClick={onClick} className={cls} style={FACE} aria-label={ariaLabel}>{label}</button>
    );
}
