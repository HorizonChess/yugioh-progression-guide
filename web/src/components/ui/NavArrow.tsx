/** The game's back/forward arrow: a stone-and-gold tablet button with a drawn chevron. */
export default function NavArrow({
    dir,
    label,
    onClick,
    disabled,
    className = "",
}: {
    dir: "prev" | "next";
    label: string;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <button type="button" className={`nav-arrow ${className}`} onClick={onClick} disabled={disabled} aria-label={label}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={dir === "prev" ? "M15 4 7 12l8 8" : "M9 4l8 8-8 8"} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
}
