# Yu-Gi-Oh! Progression Series Web App

A Next.js application designed to track and simulate a "Progression Series" style journey through Yu-Gi-Oh! history. Players start from the first set (or a custom starting point), open packs, build decks, and advance through the timeline by winning matches.

## Core Gameplay Loop

1.  **Open Packs**: Open booster packs from the current set.
2.  **Build Deck**: Use collected cards to build a deck (external to this app currently, or managed via collection view).
3.  **Duel**: Play a match against an opponent (using external simulators like EDOPro or DuelingBook).
4.  **Record Result**:
    *   **Victory**: Advance to the **Winner's Circle**. Spin the Reward Wheel for prizes (Bonus Cards, Bans, Unbans, Redoer Tokens).
    *   **Defeat**: Go to the **Loser's Circle**. Open 3 "Pity Packs" (Tournament Packs from the era) to bolster your collection.
5.  **Advance**: Unlock the next set in the timeline.

## Tech Stack

-   **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Animations**:
    -   [Framer Motion](https://www.framer.com/motion/): Handles smooth page transitions (fade/slide effects) in `template.tsx`.
    -   **Tailwind Animate**: Used for micro-interactions (pulse, spin, bounce) and UI feedback.
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **State Management**: React Context API (`ProgressionContext`)
-   **Data Persistence**: LocalStorage (Save slots, Collection, History)

## Design System

The application follows a strict **"Ancient Egyptian / Stone & Parchment"** aesthetic to evoke the classic Yu-Gi-Oh! feel.

### Global Styles (`globals.css`)
We use CSS variables to define the theme:
-   **Colors**:
    -   `--primary`: `#d4af37` (Metallic Gold)
    -   `--secondary`: `#4a148c` (Deep Purple)
    -   `--card-bg`: `#1a1a1a` (Dark Card Background)
-   **Utility Classes**:
    -   `.stone-panel`: The core container style. Features a dark stone texture, 3D beveled borders (using `border-color` tricks), and deep drop shadows.
    -   `.parchment-bg`: Used for inputs and buttons. Features a paper texture and serif typography.

### Typography
-   **Headings**: `Russo One` (Google Fonts) - Bold, techno/industrial feel, used for titles.
-   **Body**: `Outfit` (Google Fonts) - Clean, modern sans-serif.
-   **Parchment**: `Times New Roman` - Used within parchment elements for authenticity.

### Guide Sprite
A reactive character helper (Yugi) implemented in `src/components/GuideSprite.tsx`.
-   **States**: Neutral, Happy, Sad, Action.
-   **Interaction**: Reacts to game events (opening packs, winning/losing) with speech bubbles.

## Data & APIs

### Card Data
-   **Source**: [YGOPRODeck API](https://db.ygoprodeck.com/api/v7/cardinfo.php).
-   **Filtering Logic** (`src/lib/api.ts`):
    -   **Era Cutoff**: Sets released before August 2017 (Pre-Link Era).
    -   **Inclusions**: Core Booster Sets and **Reprint Sets** (e.g., *Dark Beginnings*, *Mega Packs*) are included to allow players to catch up on older cards.
    -   **Exclusions**: Specific side products like Structure Decks, Starter Decks, Tins, and Duelist Packs are filtered out to maintain a "Progression" challenge.

### Images
-   **Hosting**: Images are hosted on **Cloudflare R2** to ensure fast delivery and avoid hotlinking.
-   **Pack Art**: High-quality booster pack images are scraped from Yugipedia using `generate_image_map.js` to ensure they match the correct resolution and aspect ratio.

## Asset Pipeline

We use a suite of custom scripts to maintain assets and data integrity:

### Python Tools
-   **`generate_buttons.py`**: Composites text onto blank button templates using `PIL`. Applies "engraved" text effects (inner shadow, highlight) for a 3D look.
-   **`remove_bg.py`**: Removes solid background colors from sprite assets.

### Node.js Scripts (`web/scripts/`)
-   **`generate_image_map.js`**: Fetches the list of sets, filters them, and then scrapes Yugipedia for the highest quality booster pack image, handling redirects and file format variations (.jpg/.png).
-   **`migrate_images.js`**: Batch downloads card images and uploads them to Cloudflare R2.
-   **`check_missing_sets.js`**: Validates that all sets in the timeline have associated images and data.

## Architecture Overview

### `src/app` (Routes)
-   **`/menu`**: Save slot management.
-   **`/map`**: Timeline visualization of unlocked sets.
-   **`/timeline`**: Match recording interface.
-   **`/packs`**: Pack opening simulator with 3D flip animations.
    -   **No-Scroll Design**: Optimized layout to fit all cards within the viewport on various screen sizes.
    -   **Summary View**: Displays a "Finished Opening" summary where cards are grouped by rarity (Common -> Secret Rare) and sorted alphabetically, matching the Set Details view.
    -   **Tooltips**: Hovering over flipped cards (or cards in the summary) reveals detailed card information.
-   **`/collection`**: Comprehensive collection manager.
    -   **Filtering**: Advanced filters for Set, Rarity, Card Type, Attribute, Level/Rank/Link, Scale, and ATK/DEF stats.
    -   **Import/Export**: Supports importing and exporting collections via **.YDK** files (compatible with EDOPro/DuelingBook).
    -   **Pagination**: Client-side pagination for performance with large collections.
    -   **Layout**: Responsive grid that adapts to screen size (up to 9 columns on large screens).
    -   **Hover Details**: Hovering over a card displays a high-resolution tooltip with card effects and stats.

### `src/context`
-   **`ProgressionContext`**: Global state manager.
    -   **Saves**: Handles multiple save files.
    -   **Collection**: Tracks card ownership counts.
    -   **History**: Logs match results (Winner, Date, Set).

## Future Roadmap

-   **[ ] Loser's Circle**: Implement the "Pity Pack" opening flow for defeated players.
-   **[ ] Winner's Circle**: Implement the Reward Wheel (Spin animation, prize logic).
-   **[ ] Deck Builder**: Basic in-app deck construction using collected cards.
-   **[ ] Mobile Optimization**: Improve touch targets and layout for phone users.

## Development

### Setup
```bash
npm install
npm run dev
```

### Adding New Features
1.  **Update Documentation**: If you add a feature, update this README.
2.  **Follow Design**: Use existing `StonePanel` and `ParchmentButton` components.
3.  **Verify Assets**: Ensure new images are optimized and follow the naming convention.
