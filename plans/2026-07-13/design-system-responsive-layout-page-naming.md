# Refactor: Design System, Responsive Layout & Page Naming

## Context

Before expanding the Yu-Gi-Oh Progression app, its foundations need cleanup so future pages are consistent and maintainable. Three problems today:

1. **Ad-hoc responsive strategy.** Two pages (`map`, `deck-builder`) render inside `ScaleWrapper` — a `position: fixed` canvas hardcoded to `DESIGN_WIDTH = 1920` that `transform: scale()`s the whole page to fit the viewport. Combined with `position: absolute` + pixel offsets, this is not a real responsive layout and is a poor fit for a PWA. Other pages (`menu`, `start`) already use proper responsive flex — those are the target pattern.
2. **No color token discipline.** A partial set of CSS variables exists in `globals.css` (`--primary: #d4af37`, etc.), but the same hex values are also hardcoded ~125 times across pages/components (e.g. `#d4af37`, `#f5c542`, and an untokenized parchment/wood palette `#1a120b #8b7355 #e6dcc3 #2d2414 #6b543a`). Changing a theme color means editing many files.
3. **Confusing file names & image-buttons.** Every route is `page.tsx` (Next.js App Router requires this), so editor tabs are ambiguous. And "image as button" is done three inconsistent ways, the worst being `RecordMatch.tsx`'s hand-measured `LAYOUT` percentages baked to one specific PNG — not reproducible.

**Intended outcome:** a documented design-token system (colors as variables), truly responsive layouts with no `ScaleWrapper`/fixed positioning, one reusable frame-based image button, and page code that lives in clearly-named components — all while **preserving the hand-tuned aesthetic** already built.

### Decisions locked with the user
- **Image buttons → Frame + HTML content** (one `<FrameButton>`; art is a frame, text/children are real flex-centered HTML). No per-image coordinate maps.
- **Naming → thin `page.tsx` re-exports** a named component (e.g. `Timeline.tsx`) living in `components/pages/`.
- **Claude Design MCP → skip.** This is architectural refactoring of existing code; the MCP is for greenfield mockups and would not help *preserve* the current look. Not set up, not needed here.
- **CSS Grid is the project-wide layout primitive** — prefer `grid` over flex for structural layout. `deck-builder` is the most sensitive page: `ScaleWrapper` was originally adopted there *because* naive responsive layout gave bad results (gaps too small/large, info panel broke on resize). It gets a careful grid-first rebuild, migrated last.
- **RecordMatch texture is preserved by slicing, not discarding.** The single `record_match_ui.png` is a deliberate custom-textured module with buttons painted into the art. It will be cut into per-region textured slabs (pipeline already exists) and those slabs placed responsively — the painted look is kept exactly; only positioning becomes real HTML.
- **Work on a dedicated branch**, created before any change. **Commit after each main step, gated on user confirmation** it functions properly.
- **Preserving the aesthetic is the #1 risk** — the plan is built around a screenshot-baseline, page-by-page migration (see below).

### Workflow rule (applies to every step below)
After completing a main step: run the migrated surface in the browser, **ask the user to confirm it looks/works right**, and only then `git commit` that step on the branch. Do not batch multiple steps into one commit. The dev server is **already running** — do not start a new one.

---

## Preserving the aesthetic (the core safeguard)

The user's hard-won manual look must survive the removal of `ScaleWrapper` and fixed positioning. Approach:

1. **Capture a visual baseline FIRST**, before touching layout. Run the app on `main`'s current code and screenshot every route at a few widths (e.g. 1920, 1366, 768, 390). Save these as reference images in `web/visual-baseline/` (gitignored or committed to the branch).
2. **Change nothing visual by intent.** Same fonts (Inter/Outfit/Russo), same art assets, same colors, same spacing feel. The refactor changes *how* elements are positioned (flow/flex/grid instead of scaled absolute), not *what* they look like.
3. **Migrate one page at a time**, re-screenshot at the same widths, and diff against the baseline. Adjust until it matches. `menu/page.tsx` and `start/page.tsx` are the proven reference for the responsive idiom (`min-h-screen flex items-center justify-center`, `max-w-*`, `hidden lg:block`).
4. Because `map` and `deck-builder` are the only two pages inside `ScaleWrapper`, the visual risk is concentrated in exactly two pages — everything else is a lower-risk token swap.

---

## Step 0 — Branch

```
git checkout -b refactor/design-system
```
All work happens here. (Currently on `main`; only untracked `scripts/record_match_*` files are dirty — leave them.)

---

## Step 1 — Color / design-token system

**Goal:** every reused color is a variable; changing it in one place changes the whole app.

1. **Extend `:root` in [globals.css](web/src/app/globals.css)** to cover the currently-untokenized palette. Add semantic + raw tokens, e.g.:
   - Keep existing `--primary`, `--primary-hover`, `--secondary`, `--accent`.
   - Add the parchment/wood set: `--parchment: #e6dcc3`, `--wood-dark: #1a120b`, `--wood: #2d2414`, `--wood-light: #6b543a`, `--wood-border: #8b7355`, `--ink: #2c1810`.
   - Add semantic aliases used by UI (e.g. `--win: <green>`, `--loss: <red>`, `--panel-label-win`, `--panel-label-loss`) to replace inline `#aaffaa`/`#ffaaaa`/`text-green-400`/`text-red-500`.
2. **Expose tokens to Tailwind** in [tailwind.config.js](web/tailwind.config.js) so classes like `text-primary`, `bg-wood`, `border-wood-border` work instead of arbitrary `text-[#d4af37]`. Map each new `--var` under `theme.extend.colors` (same way `background`/`foreground` are already mapped). This lets us replace both `var(--x)` usages AND `#hex` arbitrary values with clean named classes.
3. **Replace hardcoded hex with tokens** across the ~125 occurrences. Highest-density files first: [RecordMatch.tsx](web/src/components/RecordMatch.tsx), [QuantitySelector.tsx](web/src/components/QuantitySelector.tsx), [CollectionFilters.tsx](web/src/components/Collection/CollectionFilters.tsx), [CardSearchPanel.tsx](web/src/components/DeckBuilder/CardSearchPanel.tsx), [packs/page.tsx](web/src/app/packs/page.tsx), [collection/page.tsx](web/src/app/collection/page.tsx), [deck-builder/page.tsx](web/src/app/deck-builder/page.tsx), [GoldButton.tsx](web/src/components/GoldButton.tsx). This is a mechanical find-and-replace per palette value — verify visually per file.
4. **Delete the stale boilerplate** [page.module.css](web/src/app/page.module.css) (unused Next starter that redefines `--background`/`--foreground` to light-theme values and can cause confusion). Confirm it's imported nowhere before removing.

Document the token list with a short comment block at the top of `:root` so future pages know what's available.

---

## Step 2 — Kill ScaleWrapper, make layouts responsive

**Goal:** no `position: fixed` layout canvas, no `transform: scale` page scaling, no absolute pixel-offset placement. Fluid layouts that reflow.

1. **`map/page.tsx` (the timeline — highest priority).** Rebuild without `ScaleWrapper`:
   - Root becomes a page-level **CSS Grid** (`min-h-screen` with `grid-template-rows` for header / timeline / footer) rather than absolute-positioned bands — this replaces the `absolute bottom-40` / `absolute bottom-4` pinning with real grid rows. (Grid is the project default; flex only inside a cell where it's the natural fit.)
   - Timeline row stays a horizontal scroll (`overflow-x-auto`) but tiles size with responsive/`clamp()` widths instead of `w-36` inside a 1920 canvas; `px-[50vw]` centering padding can remain (it's viewport-relative, already responsive) or become scroll-snap.
   - Convert the absolute-positioned HUD (`absolute bottom-40`, `absolute bottom-4`, the `w-[300px] h-[120px]` stats panel with `left-[56px]`/`right-[56px]` pins) into normal flow: a header/`TopBar`, a centered timeline region, and a footer bar using flex — no bottom-pinned absolutes. Keep the same art (`stats_panel_cropped.png`) but let its text sit via flex inside the frame rather than pixel offsets.
   - Fix `object-fill` → `object-contain` (or `object-cover`) on pack art so images aren't stretched (part of "clean and reproducible").
   - Extract the tile into a `TimelineNode`/`PackTile` component (the `components/Timeline/` folder is currently empty — this is where it goes) so the timeline is data-driven end-to-end.
2. **`deck-builder/page.tsx` — migrate LAST, most sensitive.** `ScaleWrapper` was originally used here precisely because naive responsive layout broke (gaps wrong, info panel collapsed on resize). Rebuild with **CSS Grid**, not flex:
   - Define the whole page as a grid with **explicit named columns/areas** (`grid-template-columns` using `minmax()` + `fr`, e.g. a fixed-ish search column, a fluid deck column, a fixed-ish info column) so panels can't collapse and gaps stay proportional — this directly targets the failures that pushed you to ScaleWrapper.
   - Replace fixed pixel widths (`w-[300px]`, `w-[240px]`, `w-[280px]`) with grid track sizing + `min-width` guards so the info panel keeps a sane minimum instead of breaking.
   - Use `gap` on the grid (not per-item margins) so spacing scales cleanly.
   - Add breakpoints where needed (e.g. stack/collapse a column below a width) rather than scaling everything down uniformly.
   - Preserve panel styling via the new tokens. Because this is the risk hotspot, screenshot-diff it at all four widths and get explicit user sign-off before committing.
3. **`GlobalBackground.tsx`.** `fixed inset-0` here is a legitimate full-screen backdrop, not a layout hack — keep it, but it's fine as-is. (Modals/tooltips using `fixed`/`position: fixed` — `CardTooltip`, `CardDetailModal`, `LoadDeckModal`, `DragPreview`, `GuideSprite` — are overlays and stay.)
4. **Delete `ScaleWrapper.tsx`** once both consumers are migrated and verified. Confirm zero remaining imports.

---

## Step 3 — Frame-based image button (`FrameButton`)

**Goal:** one reusable image button; text is real HTML, no baked-in coordinates.

1. Create `components/FrameButton.tsx`: a container whose art is applied via **CSS `border-image` (9-slice) or a transparent frame PNG background**, with `children` centered by flexbox. Props: `variant` (e.g. `'gold'`), `href?`, `onClick?`, `size`/`className`. Color via tokens (`text-wood`, etc.), not `#2d2414`.
2. Replace **`GoldButton`** usages (map's "Prepare Your Deck", "OPEN PACKS", "RECORD MATCH", "Bonus Matches") with `FrameButton`. Remove the magic `inset-x-[22%]`.
3. **`RecordMatch.tsx` — preserve the textured look via slicing (do NOT discard the art).** The single `record_match_ui.png` is intentional: a custom textured module with buttons painted into the art. The goal is to keep that exact painted look while making it responsive. You already built the pipeline for this:
   - `scripts/slice_record_match.py` + `record_match_slices.json` + `record_match_layout.json` cut the master PNG into **8 named textured slabs**: `left_header_slab`, `left_card_slab`, `left_stats_slab`, `victory_tablet_slab`, `defeat_tablet_slab`, `victory_button_slab`, `defeat_button_slab`, `back_button_slab`. Output dir `web/public/assets/record match/slices/` **does not exist yet** — the slices haven't been generated.
   - **Step:** run the slice script to produce the slab PNGs, eyeball the `_debug_slices.png` overlay to confirm the cuts are clean, adjust the JSON boxes if a cut clips a button, re-run.
   - **Then** compose the screen as a **CSS Grid** whose cells are the sliced slabs: each textured slab is the background/frame of its region, and the real content (opponent name, card image, win-rate/streak, VICTORY/DEFEAT, back link) sits inside via grid/flex. VICTORY/DEFEAT become interactive using the `victory_button_slab` / `defeat_button_slab` textures as `FrameButton` art — so the buttons still look painted into the module, because they *are* the painted art, now as real reflowing elements.
   - Net effect: identical texture and "buttons live in the image" feel, but no hand-measured `LAYOUT` percentages and no breakage when the window resizes. Delete the `LAYOUT` map + `getStyle` once migrated.
   - The `scripts/record_match_*` files are currently untracked — commit them as part of this step so the pipeline is preserved.
4. Once nothing imports `GoldButton`, delete it.

---

## Step 4 — Page naming (thin re-exports)

**Goal:** editor tabs/search show meaningful names; route files stay minimal.

1. Create `components/pages/` (name TBD — could also be `views/`).
2. For each route, move the real component out of `app/<route>/page.tsx` into `components/pages/<Name>.tsx` with a descriptive name — critically **`Timeline.tsx`** for `app/map/page.tsx` (its loading text already says "LOADING TIMELINE"), plus `DeckBuilder.tsx`, `RecordMatchPage.tsx` (`app/timeline/page.tsx`), `Collection.tsx`, `Packs.tsx`, `Menu.tsx`, etc.
3. Each `page.tsx` becomes a one-liner:
   ```tsx
   export { default } from "@/components/pages/Timeline";
   ```
   (Keep `"use client"` on the named component where needed.)
4. Do this incrementally alongside each page's layout migration to avoid a giant mechanical churn commit.

> Note on the `map` vs `timeline` route confusion: `app/timeline/` is actually the *Record Match* screen and `app/map/` is the *visual timeline*. Renaming the folders would change URLs — out of scope here; the named-component step (`Timeline.tsx` vs `RecordMatchPage.tsx`) already removes the day-to-day confusion. Flag folder-rename as a possible follow-up.

---

## Step 5 — PWA groundwork (optional, low-risk; confirm scope)

Not required by the three problems above, but the user framed the target as a PWA. If in scope, add minimally: `app/manifest.ts` (name, icons, `theme_color`, `display: standalone`), PWA icons in `public/`, and viewport/theme metadata in [layout.tsx](web/src/app/layout.tsx). A service worker (via `@ducanh2912/next-pwa` or Serwist) is a larger add — recommend deferring to its own task. **This step is gated on user confirmation.**

---

## Files at a glance

**Create:** `components/FrameButton.tsx`, `components/Timeline/TimelineNode.tsx`, `components/pages/*.tsx`, (optional) `app/manifest.ts`, `web/visual-baseline/` refs.
**Heavily edit:** `app/globals.css`, `tailwind.config.js`, `app/map/page.tsx`, `app/deck-builder/page.tsx`, `components/RecordMatch.tsx`.
**Token-swap edits (mechanical):** `packs/page.tsx`, `collection/page.tsx`, `QuantitySelector.tsx`, `Collection/CollectionFilters.tsx`, `DeckBuilder/CardSearchPanel.tsx`, `DeckBuilder/CardInfoPanel.tsx`, and the other ~hex-bearing files.
**Delete (after verifying no imports):** `components/ScaleWrapper.tsx`, `components/GoldButton.tsx`, `app/page.module.css`.

---

## Verification

Run end-to-end after each page migration, not just at the end. **The dev server is already running — use it; do not start a new one.** Each main step ends with: verify → get user confirmation → commit on the branch.

1. **Baseline first:** with the running dev server, screenshot every route at 1920/1366/768/390 → `web/visual-baseline/`.
2. **Per page:** re-screenshot the migrated route at the same widths and compare to its baseline; the look should match. Resize the browser to confirm it reflows fluidly (no clipped/overlapping elements, no horizontal scrollbar, grid gaps stay proportional, no collapsed panels) — the thing `ScaleWrapper` used to fake, now done for real. **deck-builder gets extra scrutiny** at every width (it was the original ScaleWrapper reason).
3. **Interactions:** timeline horizontal scroll + arrows + auto-scroll to current set; OPEN PACKS / RECORD MATCH / Prepare Your Deck navigation; RecordMatch VICTORY/DEFEAT/back; deck-builder columns.
4. **Token sanity:** temporarily change `--primary` in `globals.css` and confirm gold updates app-wide (proves hardcoded hex are gone). Revert.
5. `cd web && npm run lint` and `npm test` clean. Optionally add Playwright later to automate the screenshot diffs (not currently a dependency).
6. Grep for regressions: no remaining `ScaleWrapper`/`GoldButton` imports; no `#d4af37`/`#f5c542`/parchment hex left in `src/`.

---

## Progress log & next steps (living section — update as work continues)

Branch: `refactor/design-system`. Steps 1–4 already landed in earlier commits (design tokens, ScaleWrapper removed on /map, FrameButton, page rename to `*.controller.tsx` / `*.view.tsx`). The `/deck-builder` page still renders via `ScaleWrapper` and is the most sensitive migration — do it last.

### Done in the session ending 2026-07-14
- **Timeline connector alignment (fixed + verified).** Chain connectors on `/map` were ~28px below the pack-art center. Cause: the connector was `items-center`-centered against the *whole tile* (art + caption). Fix in `TimelineNode.view.tsx` + `globals.css`: caption is now `position:absolute` so the tile's laid-out height == art height, and the connector (kept OUTSIDE the scaled `.timeline-node`, so `scale-125` never distorts it) centers on the art. Measured: art-center and connector-center both Y=379.5, offset 0.
- **Current pack name was invisible (fixed + verified).** Cause was NOT stacking/coverage — the horizontal scroller uses `overflow-x:auto`, which forces `overflow-y` to CLIP; the absolute caption (which doesn't add to content height) of the enlarged `scale-125` current pack fell below the scroller's clip line. Fix: `.timeline-carousel` reserves relational bottom padding; caption anchored to art via `top: calc(var(--art-h) + var(--art-h) * 0.04)`. `--art-h` is now the single source of truth for pack-art height (used by `.timeline-node__art` and the caption). Captions scale with the node (matches hover-grow), per user preference.
- **Indicative class names (partial — Timeline only).** `TimelineNode.view.tsx` raw-property strings replaced with `.timeline-link`, `.timeline-link__connector`, `.timeline-node__art-inner`, `.timeline-node__img`, `.timeline-node__caption`, `.timeline-node__name(--current/--other)`, `.timeline-node__date`, `.timeline-carousel` etc. in `globals.css`.

### NEXT — pick up here after context clear
1. **Show the tcg_date on the SELECTED (current) pack too** (user's explicit next ask). Today `TimelineNode.view.tsx` renders `set.tcg_date` only when `!current`. Make the date show for the current pack as well as the name. Keep it inside `.timeline-node__caption` so it stays unclipped (the reserved scroller padding already accounts for name+date height on non-current packs; re-verify the current pack's name+date both fit within `.timeline-carousel`'s `pb` at scale-125, bump the `pb` clamp if needed). Verify with a Playwright screenshot of `/map` (seed localStorage `yugioh-progression-saves-v2` with a save at `currentSetIndex:3` + a few `matchHistory` entries whose `packName` == the set_name, viewport ~1728×900).
2. **Comprehensive indicative-class-name cleanup — DeckBuilder INCLUDED** (user confirmed scope = whole app incl. deck-builder; "I want to at least know what the div represents"). Replace `className="<list of raw CSS-property utilities>"` with indicative `@apply` component classes in `globals.css`. Swap hardcoded hex → design tokens (tokens live in `globals.css :root` + `tailwind.config.js`); **add new named tokens when a color has no exact token, but DON'T create two tokens for the same value (DRY)**. Highest-density offenders: `DeckBuilder/*` (esp. `DeckControls.view.tsx` `buttonClass`, `CardSearchPanel.view.tsx`), `RecordMatch/RecordMatch.view.tsx` (9 hardcoded hex + inline soup), `shell/TopBar.view.tsx`. Merge duplicate class-sets into one class where identical. NOTE: `/deck-builder` is slated for a mobile redesign (see memory `mobile-deck-builder-feature`) — restyle via tokens/naming only, don't rework its layout structure.

### Working agreements (from user, see memory)
- Commit only after the user approves each step; never revert commits already made (`commit-only-after-approval`).
- Correct-by-construction CSS; relational magic numbers OK (e.g. "half of `--art-h`"), absolute px like `54px` NOT OK (`avoid-magic-numbers-layout`).
- `@apply` indicative class names, not long inline Tailwind (`jsx-readability-apply-convention`).
- Dev server is already running — reuse it; verify changes with real screenshots before claiming done.
