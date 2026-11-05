import Link from "next/link";
import { ReactNode } from "react";
import { asset } from "@/lib/utils";

const FACE = { backgroundImage: `url('${asset("/ui/buttons/cartouche.webp")}')` };

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
    const label = <span className="cartouche-btn__label">{children}</span>;
    return href ? (
        <Link href={href} className={cls} style={FACE} aria-label={ariaLabel}>{label}</Link>
    ) : (
        <button type="button" onClick={onClick} className={cls} style={FACE} aria-label={ariaLabel}>{label}</button>
    );
}
