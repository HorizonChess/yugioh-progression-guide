# Feature: Record Match + Winner's Wheel

## Context

**Why now.** The design-system refactor (`plans/2026-07-13/design-system-responsive-layout-page-naming.md`) is effectively done — tokens, FrameButton, ScaleWrapper re-scoping, Timeline rebuild, and 6/10 page renames all landed. The next thing the app needs is a real, polished **Record Match** experience, and the user wants the **Winner's Wheel** built *together* with it as one feature (they are one moment in the game loop: you finish a duel → you record the result → on a win you spin for a prize).

**What changes from the original plan.** The old Step 3 called for slicing `record_match_ui.png` into textured slabs (`scripts/slice_record_match.*`). **That approach is dropped.** We rebuild Record Match + Winner's Wheel from the existing design-system primitives and the art already in `/public/ui` — no slicing, no hand-measured `LAYOUT` percentages. The slice pipeline is parked (authored, never run), not deleted.

**Intended outcome.** A responsive, token-clean Record Match surface where VICTORY/DEFEAT are real `FrameButton`s (not painted-into-a-PNG coordinates), and — on a win — the record-match modal animates away **like a vortex** while a **Winner's Wheel spin modal** takes its place (a "theater curtains close then open" transition). The whole thing reflows at any width with no fixed-canvas scaling.

### Decisions locked with the user (2026-07-15)
- **Record Match + Winner's Wheel ship together** as one feature.
- **Reuse existing `/public/ui` assets** — no new art. Compose from `frame_gold.svg` (via `FrameButton`), `parchment.svg`, `stone_texture.jpg`, `stats_panel.png`, tokens. Do NOT reference `record_match_ui.png` or its slices.
- **Signature transition:** after a WIN, the record-match modal collapses in a **vortex** animation; in its place the **wheel spin modal** opens — theater-curtain close/open feel.
- **`/rewards` stays untouched** for now. Some temporary duplication of the wheel prize list is acceptable; consolidation happens in the later Rewards-tab task.
- **Loss path:** keep the existing behavior (record → `pendingReward: 'pity'` → the untouched `/rewards` pity-pack flow). Only the WIN path gets the new in-place vortex→wheel modal.
- Still on branch `refactor/design-system`; user commits each step after confirming it works.

### Prerequisite quick-cleanup (from the design-system plan, do first)
Small, mechanical, own commits — clears the deck before the feature:
1. Tokenize `RecordMatch.view.tsx`'s 9 hex (`#8b7355`→`text-wood-border`, `#d4af37`→`text-primary`, `#e6dcc3`→`text-parchment`). (This file is about to be rebuilt anyway, but keep it token-clean in the interim.)
2. Convert the 4 remaining inline routes to thin re-exports + `components/pages/*.controller.tsx`: `app/page.tsx`, `app/start/page.tsx`, `app/onboarding/page.tsx`, `app/rewards/page.tsx`.
3. **Fix the timeline carousel's stray vertical scroll** (bug reported 2026-07-15, visible on laptop: the pack carousel nudges up/down a few px — lift it and it clips at the top, settle it and it looks normal).
   - **Cause:** `.timeline-carousel` (`globals.css:309`) is `overflow-x-auto` + `.hide-scrollbar`. `.hide-scrollbar` only hides the scrollbar's *appearance*; it does not stop Y scrolling. `overflow-x:auto` makes the OTHER axis compute to `auto` (NOT `clip`, despite the misleading comment at `:304-308`), so the few px of vertical overflow from the `scale-125` current tile + the reserved caption padding become silently scrollable.
   - **Fix:** add `overflow-y-hidden` to the `.timeline-carousel` `@apply` (scroll on X only). `clip` also works but `hidden` is safest alongside the negative-margin connectors. Correct the stale comment that claims `overflow-x:auto` forces `overflow-y:clip`.
   - Verify on the laptop width: carousel no longer accepts vertical scroll; captions/connectors of the enlarged current pack still render fully (not clipped).

---

## Current state (what exists to build on)

- **Route:** `/timeline` → `app/timeline/page.tsx` re-exports `components/pages/RecordMatchPage.controller.tsx` (folder name is historical; this is the Record Match screen, `/map` is the visual timeline).
- **Controller** `RecordMatchPage.controller.tsx` already computes **win rate** and **streak** from `matchHistory`, renders `<RecordMatch>`, and on record calls `recordMatch(...)` → `advanceSet()` → `router.push("/map")` after a 2s VICTORY/DEFEAT flourish (`.record-outcome` classes in `globals.css`).
- **View** `components/RecordMatch/RecordMatch.view.tsx` — the file to **replace**. Currently a single PNG background + a `LAYOUT` percentage map + `getStyle()` absolute positioning. This is what we tear out.
- **State machine** `context/ProgressionContext.tsx`:
  - `recordMatch(result)` appends to `matchHistory` AND sets `pendingReward = { type: winner==='player' ? 'wheel' : 'pity', claimed:false }`.
  - `advanceSet()`, `claimReward()` (clears `pendingReward`), `addToCollection(cards)`.
- **Existing wheel logic** lives in `app/rewards/page.tsx`: `WHEEL_PRIZES` (6 text prizes), spin timeout, claim. We **borrow the prize list + claim wiring** into the new modal but leave that file in place.
- **Reusable primitives:** `components/ui/FrameButton.view.tsx` (9-slice gold frame, flex-centered label, `href`/`onClick`, size from outside), `.glass-panel`, `.record-outcome(--victory/--defeat)`, `.custom-scrollbar`, the full color-token set, and `GuideSprite`.

---

## Build steps

Each step = one verified commit on the branch, gated on user confirmation (per working agreement).

### Step 1 — Rebuild the Record Match surface (no slices, no LAYOUT map)
Replace `RecordMatch.view.tsx` with a **CSS-Grid** composition using tokens + existing assets:
- Root: a responsive card (`aspect`-aware but reflowing), framed with the parchment/stone look via existing assets (`parchment.svg` / `stone_texture.jpg` background, token borders) — NOT `record_match_ui.png`.
- **Grid regions** (named areas, `minmax()`/`fr`, `gap` for spacing — per `avoid-magic-numbers-layout`):
  - Opponent label + name (tokens: `text-wood-border` / `text-primary`).
  - Center opponent card slot (keep the `NEXT_PUBLIC_IMAGE_HOST` card image; `object-contain`).
  - Stats row: **Win Rate** and **Streak** (already passed in as props — keep the prop contract `winRate` / `streak`).
  - **VICTORY** and **DEFEAT** as `<FrameButton>` (variant styling via tokens; VICTORY gold, DEFEAT red-tinted). These replace the painted-in buttons — real flex-centered HTML labels.
  - **Back to Dashboard** link (`onCancel`).
- Delete the `LAYOUT` object + `getStyle()`. Keep the `RecordMatchProps` contract (`onRecord`, `onCancel`, `mode`, `opponentName`, `winRate`, `streak`) so the controller needs minimal change.
- **Indicative class names** via `@apply` for repeated sets, inline utilities + naming comment for one-offs (`jsx-readability-apply-convention`).
- Verify at 1920/1366/768/390: reflows, no clipping, no horizontal scrollbar, buttons hit-test correctly.

### Step 2 — Winner's Wheel modal (win only)
New component (e.g. `components/RecordMatch/WinnersWheel.view.tsx`), presentational, driven by props:
- A spinnable wheel built from existing assets/tokens (glass-panel container, gold frame accents, `--primary` gradient). The 6 prizes come from a shared `WHEEL_PRIZES` list (extract to a small module, e.g. `lib/rewards.ts`, and have BOTH the new modal and the untouched `app/rewards/page.tsx` import it — removes the duplication risk without editing `/rewards`' behavior).
- Props: `onSpinComplete(prize)` / `onClaim(prize)`; internal spinning state + result reveal.
- Claiming a prize wires to `ProgressionContext`: reuse `claimReward()` (and `addToCollection` if a prize grants cards). For now text prizes just acknowledge (mirror current `/rewards` behavior).

### Step 3 — The vortex → curtains transition (the signature moment)
Orchestrate in `RecordMatchPage.controller.tsx`:
- On **WIN**: instead of routing away, drive a small state machine: `recording → vortex-out (record-match modal spins/collapses inward) → wheel-in (wheel modal opens like curtains) → claim → advanceSet → router.push('/map')`.
- On **LOSS**: unchanged — play the `.record-outcome--defeat` flourish, `recordMatch` (sets `pendingReward: 'pity'`), `advanceSet`, route to the **untouched** `/rewards` pity flow (or `/map`, matching today).
- Implement the vortex/curtain with CSS keyframes in `globals.css` (token-colored, relational timing) + a transition state in the controller — no library. Respect `prefers-reduced-motion` (fallback: quick cross-fade).
- `recordMatch` currently sets `pendingReward:'wheel'` on a win — with the wheel now shown in-place, decide: either keep `pendingReward` and clear it via `claimReward()` when the modal's prize is claimed (recommended — keeps save-state honest), or stop setting it on win. Recommend: keep setting it, clear on claim, so a mid-spin refresh still knows a wheel is owed.

### Step 4 — Cleanup
- Confirm nothing else imports the old `LAYOUT`/`getStyle`.
- Grep: no `record_match_ui.png` references remain in the new path (asset itself stays in `/public`).
- Token sanity + lint on touched files (don't chase the pre-existing 70).

---

## Files at a glance

**Create:** `components/RecordMatch/WinnersWheel.view.tsx`, `lib/rewards.ts` (shared `WHEEL_PRIZES` + prize types).
**Rewrite:** `components/RecordMatch/RecordMatch.view.tsx` (grid + FrameButtons, no LAYOUT).
**Edit:** `components/pages/RecordMatchPage.controller.tsx` (win→vortex→wheel state machine), `app/globals.css` (vortex/curtain keyframes; reuse `.record-outcome`), `app/rewards/page.tsx` (only to import shared `WHEEL_PRIZES` — no behavior change).
**Reuse (no edit):** `components/ui/FrameButton.view.tsx`, `context/ProgressionContext.tsx` (`recordMatch`/`claimReward`/`advanceSet`/`addToCollection`), `/public/ui/*` assets.
**Do NOT touch:** `scripts/slice_record_match.*` (parked), `/rewards` behavior, the deck-builder ScaleWrapper.

---

## Verification (dev server already running — reuse it)

1. **Record Match surface:** open `/timeline`, resize 1920→390 — regions reflow, no clipping/overlap, no horizontal scrollbar, VICTORY/DEFEAT are real clickable FrameButtons, back link works.
2. **Win path:** click VICTORY → record-match modal vortexes away → wheel modal opens (curtains) → spin → prize → claim → lands on `/map` with the set advanced and `pendingReward` cleared. Refresh mid-spin: state is sane (wheel still owed until claimed).
3. **Loss path:** click DEFEAT → defeat flourish → existing pity/`/rewards` behavior unchanged.
4. **Reduced motion:** with `prefers-reduced-motion`, the vortex/curtain degrades to a quick fade (no jarring spin).
5. **Token sanity:** temporarily change `--primary` — the wheel + VICTORY frame update app-wide (proves no re-hardcoded hex). Revert.
6. **Regression:** `/rewards` still works standalone (it shares `WHEEL_PRIZES` now); win rate + streak math on the record screen still correct against `matchHistory`.
7. Lint only the touched files stay clean; don't chase the 70 pre-existing.

---

## Post-commit touch-ups (agreed 2026-07-15, after the barebones commit `4373c09`)

The feature shipped functional but visually barebones (esp. the wheel). Before further polish, restructure the win moment as a **true in-place modal** — this is the next work item.

### 1. One persistent modal panel (not a phase re-render)
- **Current state (to change):** `RecordMatchPage.controller.tsx` swaps between two *separate* top-level elements via `<AnimatePresence mode="wait">` — the `<RecordMatch>` board (phase `"board"`) and the `<WinnersWheel>` (phase `"wheel"`). That's a full unmount/remount of one surface for the other, not a transition *inside* a container.
- **Wanted:** a **single modal panel** that stays mounted for the whole record→win moment. The **wheel's glass container (`.wheel-modal`) is the good candidate** to promote into that shared panel — size it so BOTH states fit comfortably inside the same box:
  - **Before recording:** the record-match content (opponent heading, Win Rate/Streak scoreboard, VICTORY/DEFEAT buttons, back link) sits inside the panel.
  - **After a win:** the Winner's Wheel (heading, wheel, spin/claim) sits inside the *same* panel.
  - The panel should be sized to hold the larger of the two comfortably (no jump/resize between states — pick dimensions that fit both, or animate the box size smoothly if needed).

### 2. Vortex = an in/out transition WITHIN the box (not a re-render)
- The vortex is a **content swap inside the persistent panel**: the record-match content animates *out* (vortex/collapse inward) and the wheel content animates *in* (curtains), while the **panel box itself stays put** (it does not unmount, re-mount, or route away).
- Implementation direction: keep the panel as the always-mounted shell; put the two *inner* content blocks under `AnimatePresence` so only the **contents** cross-fade/vortex, not the container. The box is the stable stage; the acts change on it.
- Loss path is unaffected (still defeat flourish → `/rewards` pity); only the win moment uses the in-place modal.

### 3. Notes / open questions for the polish pass
- The wheel visuals remain a rough prototype — labels/rim/spin feel are placeholder-grade; revisit after the modal restructure.
- Keep the correct-by-construction sizing (grid rows + `cqmin`, no magic px) and the token/`@apply` conventions when reshaping the panel.
- Recheck reduced-motion + mid-spin refresh after the restructure.
