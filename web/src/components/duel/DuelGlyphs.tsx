/*
 * Glyphs carved into the duel menu's stone slabs: line drawings in the board's
 * pale inlay (currentColor), cut in by the CSS (a dark groove, a light lip).
 */

const glyph = { viewBox: "0 0 64 52", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** The bot: a 90s computer, its screen showing a card. */
export function BotGlyph() {
    return (
        <svg {...glyph}>
            {/* the monitor, its screen, and a card on it */}
            <path d="M12 4h40a3 3 0 0 1 3 3v26a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" />
            <path d="M15 9h34v21H15z" />
            <path d="M28 12h8v15h-8z" />
            <path d="M30 15h4v4h-4z" />
            {/* the stand and the keyboard */}
            <path d="M27 36l-2 5h14l-2-5" />
            <path d="M10 44h44l4 5H6z" />
            <path d="M13 46.5h38" strokeWidth={1.4} strokeDasharray="2.2 2.2" />
        </svg>
    );
}

/** Solo: a hand of three cards, fanned. */
export function HandGlyph() {
    return (
        <svg {...glyph}>
            {/* filled with the slab's stone, so a card in front hides the ones behind it */}
            <g transform="rotate(-18 32 48)"><rect x="22" y="8" width="20" height="30" rx="2" fill="#7d796f" /></g>
            <g transform="rotate(18 32 48)"><rect x="22" y="8" width="20" height="30" rx="2" fill="#7d796f" /></g>
            <rect x="22" y="6" width="20" height="30" rx="2" fill="#827e74" />
            <path d="M26 10h12v10H26z" />
            <path d="M26 24h12M26 28h9" strokeWidth={1.6} />
        </svg>
    );
}

/** The rival: two crossed swords. */
export function SwordsGlyph() {
    return (
        <svg {...glyph}>
            {/* blades, cross-guards, grips and pommels, mirrored */}
            <path d="M10 6L38 34M54 6L26 34" />
            <path d="M33 39l10-10M31 39L21 29" />
            <path d="M38 34l7 7M26 34l-7 7" strokeWidth={3.4} />
            <circle cx="47" cy="43" r="2" />
            <circle cx="17" cy="43" r="2" />
        </svg>
    );
}
