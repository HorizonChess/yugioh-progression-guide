/** @type {import('tailwindcss').Config} */

// Design tokens — keep in sync with the :root block in src/app/globals.css.
// Defined as hex here (not var()) so Tailwind opacity modifiers work,
// e.g. bg-wood-border/20, text-ink/70.
const tokens = {
    // Brand — Gold
    primary: "#d4af37",
    "primary-hover": "#f5c542",
    "gold-dark": "#b8860b",

    // Brand — Secondary / Accent
    secondary: "#4a148c",
    "secondary-hover": "#7c43bd",
    accent: "#d32f2f",

    // Parchment / Wood
    parchment: "#e6dcc3",
    "parchment-light": "#f0e6d2",
    "wood-dark": "#1a120b",
    wood: "#2d2414",
    "wood-light": "#6b543a",
    "wood-mid": "#6b5b45",
    "wood-border": "#8b7355",
    ink: "#2c1810",

    // Deck-builder — Lime / Olive
    lime: "#99cc00",
    "lime-bright": "#b3e619",
    "lime-pale": "#dbea7b",
    olive: "#666600",
    "olive-mid": "#999900",
    "olive-bright": "#cccc00",

    // Status — Win / Loss
    win: "#aaffaa",
    loss: "#ffaaaa",

    // Surfaces
    "card-bg": "#1a1a1a",
};

module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                ...tokens,
            },
        },
    },
    plugins: [],
}
