import localFont from "next/font/local";

/*
 * The game's fonts, kept in the repo (latin subset, from Google Fonts) instead of
 * fetched by next/font/google at build time: Google sometimes answers the build
 * server with a font URL that Turbopack can't resolve, which fails the deploy.
 * Cinzel, Inter and Outfit are variable fonts, so one file covers every weight.
 */
export const inter = localFont({ src: "./inter.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
export const outfit = localFont({ src: "./outfit.woff2", weight: "100 900", variable: "--font-outfit", display: "swap" });
export const russo = localFont({ src: "./russo-one.woff2", weight: "400", variable: "--font-russo", display: "swap" });
export const cinzel = localFont({ src: "./cinzel.woff2", weight: "400 900", variable: "--font-cinzel", display: "swap" });
export const fell = localFont({
    src: [
        { path: "./im-fell-english.woff2", weight: "400", style: "normal" },
        { path: "./im-fell-english-italic.woff2", weight: "400", style: "italic" },
    ],
    variable: "--font-fell-face",
    display: "swap",
});
/** The onboarding letter's own names for IM Fell English and its script hand. */
export const fellLetter = localFont({
    src: [
        { path: "./im-fell-english.woff2", weight: "400", style: "normal" },
        { path: "./im-fell-english-italic.woff2", weight: "400", style: "italic" },
    ],
    variable: "--font-fell",
    display: "swap",
});
export const script = localFont({ src: "./felipa.woff2", weight: "400", variable: "--font-script", display: "swap" });
