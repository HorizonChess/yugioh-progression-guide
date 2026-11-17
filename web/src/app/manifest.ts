import type { MetadataRoute } from "next";

// The game as an app: "Add to Home Screen" / "Install app" gives an icon that opens it full
// screen, with no address bar. (Icons: scripts/images/app-icons.mjs.)
export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Yu-Gi-Oh! Progression Series",
        short_name: "YGO Series",
        description: "Open packs set by set, build decks and duel through the game's history.",
        id: `${base}/`,
        start_url: `${base}/`,
        scope: `${base}/`,
        display: "standalone",
        background_color: "#0c0914",
        theme_color: "#0c0914",
        icons: [
            { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
