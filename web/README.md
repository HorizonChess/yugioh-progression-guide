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
A reactive character helper (Yugi) implemented in `src/components/layout/GuideSprite.tsx`.
-   **States**: Neutral, Happy, Sad, Action.
-   **Interaction**: Reacts to game events (opening packs, winning/losing) with speech bubbles.

## Data & APIs

### Card Data
-   **Source**: [YGOPRODeck API](https://db.ygoprodeck.com/api/v7/cardinfo.php).
-   **Filtering Logic** ([src/lib/api.ts](src/lib/api.ts)):
    -   **Era Cutoff**: Sets released before August 2017 (Pre-Link Era).
    -   **Inclusions**: Core Booster Sets and **Reprint Sets** (e.g., *Dark Beginnings*, *Mega Packs*) are included to allow players to catch up on older cards.
    -   **Exclusions**: Specific side products like Structure Decks, Starter Decks, Tins, and Duelist Packs are filtered out to maintain a "Progression" challenge.

### Pack Opening Logic
One of the most complex and carefully researched aspects of this application is the **pack opening simulation** ([src/lib/pack-logic.ts](src/lib/pack-logic.ts)).

#### Implementation Highlights
-   **Accurate Rarity Ratios**: We've extensively researched pack ratios from forum discussions, unboxing videos (shoutout to Ruxin34), and official sources to replicate authentic pull rates.
-   **Era-Based Configurations**: 8+ distinct eras from *Legend of Blue Eyes White Dragon* (2002) to *Eternity Code* (2020+), each with historically accurate ratios.
-   **"Hat" Method**: Uses LCM (Least Common Multiple) of ratios to create a fair probability distribution. For example, LOB with ratios 1:6 Super, 1:12 Ultra, 1:31 Secret creates a "hat" of 372 possibilities.
-   **Premium Gold Card Ranges**: Implements variant-specific card number filtering for Premium Gold sets (original, Return of the Bling, Infinite Gold).
-   **Smart Fallback Logic**: When a rolled rarity has no available cards, cascades through rarity hierarchy instead of defaulting to common.
-   **Pack Validation**: Warns and auto-fills when sets have insufficient cards for expected pack composition.

#### Supported Pack Types
| Pack Type | Card Count | Examples |
|-----------|------------|----------|
| **Core Sets** | 9 cards | LOB, IOC, POTE (7-8 commons, 1 rare, 1 foil slot) |
| **Tournament Packs** | 3 cards | TP, CP, TU, AP, OTS (2 commons, 1 variable) |
| **Duelist Packs** | 5 cards | Jaden, Yusei, Kaiba (3 commons, 1 rare, 1 foil) |
| **Reprint Packs** | 12 or 9 cards | Dark Beginning/Revelation (12), Retro Pack (9) |
| **Premium Gold** | 5 cards | 2 Gold Secrets, 3 Gold Rares with card # ranges |

**Full Documentation**: See [src/data/pack_opening_rules.md](src/data/pack_opening_rules.md) for complete ratio breakdowns and sources.

### Images
-   **Hosting**: Images are hosted on **Cloudflare R2** to ensure fast delivery and avoid hotlinking.
-   **Pack Art**: High-quality booster pack images are scraped from Yugipedia using `scripts/images/generate_image_map.js` to ensure they match the correct resolution and aspect ratio.

## Asset Pipeline

We use a suite of custom scripts to maintain assets and data integrity:

### Python Tools (`tools/` at repo root)
-   **`generate_buttons.py`**: Composites text onto blank button templates using `PIL`. Applies "engraved" text effects (inner shadow, highlight) for a 3D look.
-   **`remove_bg.py`**: Removes solid background colors from sprite assets.
-   **`crop_stats_panel.py`**: Crops images down to their non-transparent content bounds.

### Node.js Scripts

**Image & data pipeline (`web/scripts/images/`)**
-   **`generate_image_map.js`**: Fetches the list of sets, filters them, and then scrapes Yugipedia for the highest quality booster pack image, handling redirects and file format variations (.jpg/.png).
-   **`migrate_images.js`**: Batch downloads card images and uploads them to Cloudflare R2.
-   **`migrate_missing_artworks.js`**: Uploads alternate card artworks to Cloudflare R2.
-   **`optimize_images.js`**: Generates and uploads multiple pre-optimized image sizes (sm/md/lg) to R2.
-   **`check_missing_sets.js`**: Validates that all sets in the timeline have associated images and data.
-   **`process_sprites.js`**: Removes solid backgrounds from Guide sprite PNGs in `public/`.

**Button/UI asset generation (`web/scripts/buttons/`)**
-   **`generate_wide_button.js`** / **`generate_wide_button_v3.js`**: Stretch button templates into wide variants.
-   **`process_button_transparency.js`**: Applies transparency processing to button assets.

## Architecture Overview

### Persistent Navigation: AppNav

The nav bar is the app's persistent chrome — like a browser's address bar, it must
look and sit **identically** on every page and never re-mount or animate on
navigation. It is a single self-gating component, [src/components/layout/AppNav.tsx](src/components/layout/AppNav.tsx),
rendered **once** in [src/app/layout.tsx](src/app/layout.tsx) — never inside a page.

-   **Allow-list, not per-page:** AppNav uses `usePathname()` to render only on the
    "app main zone" routes (`/timeline`, `/collection`, `/deck-builder`, `/packs`,
    `/record-match`, `/rewards`) and returns `null` everywhere else (menu,
    onboarding, root have no nav). To put the nav on a new page, add its route to the
    allow-list — do **not** render a bar in the page.
-   **Layout frame:** `<body>` is `h-screen grid grid-rows-[auto_1fr]`. AppNav is the
    `auto` row; the routed page fills the `1fr` content row inside
    `<main className="relative min-h-0 min-w-0">`. Because the nav lives above (and
    outside) `template.tsx`, it sits below the page-transition animation and stays
    put. `template.tsx`'s motion wrapper carries `h-full` so the height chain reaches
    each page (without it, inner `.custom-scrollbar` containers lose their bounded
    height).
-   **Pages fill the content row:** in-scope pages use `h-full` (not `h-screen` /
    `min-h-screen`), including their loading / empty / Suspense states, so they sit
    exactly below the nav.
-   **Prop-less, links-only:** the bar is the standard variant everywhere (there is no
    per-page back-arrow/title bar). It can still vary by route from within — e.g. the
    current page's link is highlighted gold (`.topbar-nav-link--active`). A back
    affordance, if needed, belongs in the page content, not the nav.

### Layout Scaling: ScaleWrapper

The `ScaleWrapper` component ensures the deck-builder's fixed 1920px-wide desktop
layout maintains exact horizontal proportions on any screen.

#### Currently using ScaleWrapper:
- `/deck-builder` - DuelingBook-style deck constructor (the only page that uses it)

#### How it works:
ScaleWrapper scales relative to its **container** (not the viewport). It's
`position: absolute; inset: 0`, so it fills whatever `relative` box it's placed in —
in practice the layout's `1fr` content row **below** the persistent nav — and watches
that box with a `ResizeObserver` rather than `window` resize. This keeps the nav
unscaled and above the scaled board.

1. **Width-based scaling:** `scale = containerWidth / 1920`
2. **Adaptive height:** `designHeight = containerHeight / scale`
3. **Result:** Content always fills its container exactly, no margins, no clipping

The math ensures that in ANY container:
- Scaled width = container width (fills exactly)
- Scaled height = container height (fills exactly)

#### Requirements for content inside ScaleWrapper:

| Do | Don't |
|----|-------|
| `h-full` | `h-screen` or `min-h-screen` |
| `absolute` positioning | `fixed` positioning |
| Flexbox with `flex-1` | Hardcoded pixel heights |
| `w-full` on containers | Viewport units (`vw`, `vh`) |

**Why no `fixed` positioning?** CSS `transform` creates a new containing block, so `fixed` elements inside are positioned relative to the transformed container, not the viewport. Use `absolute` instead - it achieves the same effect.

#### Example usage:
```tsx
import ScaleWrapper from "@/components/deck-builder/ScaleWrapper";

export default function MyPage() {
    return (
        // Use backgroundColor="transparent" to show global background
        <ScaleWrapper backgroundColor="transparent">
            <div className="h-full w-full relative">
                {/* Use absolute instead of fixed */}
                <div className="absolute top-4 left-4">...</div>
                <div className="absolute bottom-4 right-4">...</div>
            </div>
        </ScaleWrapper>
    );
}
```

#### Props:
- `backgroundColor` (optional): Background color of outer container. Default: `#0f172a`. Use `"transparent"` to show global app background.

**Full technical documentation**: See [Fixed_app_scale_progress.md](Fixed_app_scale_progress.md) for the complete 14-attempt development history and mathematical rationale.

### Project layout
-   `src/app/<route>/page.tsx`: each route's page component (state, data loading, handlers).
-   `src/components/<feature>/`: components for one feature (`deck-builder`, `packs`, `rewards`, ...); `ui/`, `card/` and `layout/` are shared.
-   `src/lib/`: pure logic and API access; `src/hooks/`: shared hooks; `src/context/`: the save-state provider.

### `src/app` (Routes)
-   **`/menu`**: Save slot management.
-   **`/timeline`**: Timeline visualization of unlocked sets.
-   **`/record-match`**: Match recording interface.
-   **`/rewards`**: Reward ledger (claim wheel prizes and pity packs).
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
-   **`/deck-builder`**: DuelingBook-style Deck Constructor.
    -   **Unified Deck View**: Single view managing Main (60), Extra (15), and Side (15) decks with drag-and-drop support.
    -   **Advanced Search**: Granular filtering (Name, Desc, Race, Attribute, Stats) matching the DuelingBook aesthetic.
    -   **Deck Management**: Save/Load/Delete functionality persisted via `ProgressionContext`.
    -   **Card Info Panel**: Left-side panel displaying full card image and scrollable description text for long card effects.
    -   **Double-Click to Add**: Quickly add cards to deck by double-clicking in the search panel.

### `src/context`
-   **`ProgressionContext`**: Global state manager.
    -   **Saves**: Handles multiple save files.
    -   **Collection**: Tracks card ownership counts.
    -   **History**: Logs match results (Winner, Date, Set).

## Recent Improvements

### Deck Builder Polish (December 2025)
-   **[✓] Card Info Panel Layout**: Removed black bars from card images, optimized space allocation
-   **[✓] Fixed Button Panel**: Button controls stay fixed at bottom, don't shift with card content
-   **[✓] Scrollable Descriptions**: Large card descriptions now scroll instead of pushing buttons off-screen
-   **[✓] Save/Load Deck Fix**: Fixed critical bug where decks weren't persisting to localStorage
-   **[✓] TopBar Consistency**: Fixed font styling differences between deck builder and other pages
-   **[✓] Text Clipping Fix**: Resolved "PROGRESSION" text being truncated at screen edge
-   **[✓] Lint Cleanup**: Fixed unused imports, `let` to `const`, added `rank` property to Card interface

### Pack Logic Validation & Enhancements (December 2025)
-   **[✓] Pack Logic Audit**: Comprehensive validation of pack opening ratios against documented rules
-   **[✓] Premium Gold Implementation**: Added card number range filtering for all Premium Gold variants
-   **[✓] Smart Fallback System**: Improved foil slot logic to cascade through rarity hierarchy
-   **[✓] Pack Validation**: Added underflow detection and auto-fill for incomplete packs
-   **[✓] Inline Documentation**: Added extensive comments linking code to pack_opening_rules.md
-   **[✓] Type Safety**: Fixed rewards page type errors (CardSet vs string)
-   **[✓] Suspense Boundaries**: Resolved Next.js static generation issues with useSearchParams
-   **[✓] Custom Hook Refactor**: Extracted card tooltip logic into reusable `useCardTooltip` hook ([src/hooks/useCardTooltip.ts](src/hooks/useCardTooltip.ts))

### Drag and Drop Optimization & Testing (December 2025)
-   **[✓] Performance Optimization**: Refactored drag preview to use `useRef` + `requestAnimationFrame` + CSS `translate3d()` for GPU-accelerated rendering (eliminates re-renders on mouse move)
-   **[✓] Ghost Image Fix**: Preloaded empty drag image to prevent native browser ghost appearing on first few drags after page reload
-   **[✓] State Management**: Added defensive cleanup via `useEffect` in DeckSlot component to prevent stuck "midair" cards
-   **[✓] Error Handling**: Wrapped drop handlers in try-catch-finally blocks ensuring drag state always resets
-   **[✓] Testing Infrastructure**: Implemented Jest + React Testing Library with full Next.js support
    -   Created 15 automated tests covering DeckSlot state management, grid rendering, and integration
    -   All tests passing with proper mocking of context, API, and components
    -   Added npm scripts: `npm test`, `npm test:watch`, `npm test:coverage`
-   **[✓] Build Verification**: Confirmed all changes compile successfully with TypeScript and Next.js build

### Deck Builder Import/Export & Usability (December 2025)
-   **[✓] YDK Import**: Import decks from `.ydk` files (EDOPro/DuelingBook format) with proper main/extra/side separation
-   **[✓] YDK Export**: Export current deck to `.ydk` file with File System Access API support and fallback
-   **[✓] Cross-Grid Drag**: Fixed drag-and-drop between main/extra/side grids - cards can now be moved freely between zones
-   **[✓] Drag-to-Remove**: Drag a card outside any grid to remove it from the deck
-   **[✓] Deck Loading Fix**: Fixed bug where loading saved decks showed empty grids - now fetches missing card data automatically
-   **[✓] Sort Function**: New Sort button organizes cards by type (Monsters → Spells → Traps), alphabetically within each category
-   **[✓] Map Integration**: "Prepare Your Deck" button on campaign map now navigates to deck builder
-   **[✓] Alternate Artworks**: Migration script ([migrate_missing_artworks.js](scripts/images/migrate_missing_artworks.js)) to upload alternate card artworks to Cloudflare R2

## Future Roadmap

-   **[✓] Loser's Circle**: ~~Implement the "Pity Pack" opening flow for defeated players~~ (Completed)
-   **[ ] Winner's Circle**: Implement the Reward Wheel (Spin animation, prize logic).
-   **[✓] Deck Builder**: Integrated DuelingBook-style deck constructor with Drag-and-Drop, card details on hover and basic filtering.
-   **[ ] Mobile Optimization**: Improve touch targets and layout for phone users.
-   **[ ] Box Opening Mode**: Simulate opening full boxes with guaranteed distribution (4 Supers, 2 Ultras per LOB box, etc.).

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
