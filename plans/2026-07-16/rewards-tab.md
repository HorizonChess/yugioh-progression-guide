# Rewards Tab — Implementation Plan

## Context

The record-match feature is built: winning vortexes the board away and spins the **Winner's Wheel**
in the same panel; losing runs a throwaway full-screen "DEFEAT / claiming pity packs" flourish. But
**wheel prizes are never actually granted** — every prize is text-only and the code just
"acknowledges" it (`claimReward()` merely nulls `pendingReward`). The README's roadmap still lists
**"Winner's Circle — implement the reward wheel prize logic"** as open.

This project completes that loop by turning the ephemeral one-shot reward into a persisted
**Rewards ledger tab** (in the nav, next to MENU) with two sections — **Available Rewards** and
**Claimed Rewards** — where each prize type is claimed through its own flow. Both record-match
outcomes now funnel into this tab through the **same in-panel vortex** (the full-screen defeat
flourish is retired): **win** vortexes → wheel → claim; **loss** vortexes → a **Defeat notice** in
the same panel. Both outcomes advance the set on record and offer a route onward.

**Outcome:** a real reward economy — wildcards, tournament packs, ban/unban, starlight search —
resolved on the player's own time from one persistent ledger, built entirely with existing
design-system primitives and existing pack/card infrastructure (DRY).

### Decisions locked with the user
- **Pity (loss) reward = 3 boosters of the just-finished CORE set** (`sets[currentSetIndex-1]`) —
  keep today's behavior; do NOT use tournament packs for the loss path.
- **All prizes land in "Available"** (uniform) — even simple ones become ledger entries.
- **Wildcard = player picks any card of that rarity _or below_** from the won pack.
- **Ban is cosmetic**: only mark banned cards in the deck builder and gray them out / block the
  add attempt. No blocking of saves/imports, no retroactive stripping of saved decks.
- **Starlight** searches a **full card catalog** (metadata from YGOPRODeck's full DB, art from the
  R2 bucket which holds every card printed in a set dated ≤ 2016 — incl. structure decks), gated to
  cards with a printing **released before the won pack**. Not limited to the app's timeline sets.
- **Tournament packs**: build fully now (bypass the set filter, placeholder art if missing).
- **Sequencing**: finalize this plan, build **Phase 1** end-to-end, verify, then check in before the
  complex claim flows.
- **Loss path mirrors the win path visually** (per user): board **vortexes** away → the **Defeat
  notice** curtains into the *same* `.win-panel` (no full-screen flourish), showing two
  `FrameButton`s — **"Claim Pity Packs"** (→ `/rewards`) and **"Back to Campaign"** (→ `/map`). The
  **win path** likewise, after the wheel claim, offers **"Back to Campaign"** (→ `/map`) alongside
  going to `/rewards`. Both outcomes call `advanceSet()` on record.
- **Commits**: commit between steps **only after the user approves** each change; never revert
  commits already made.
- **Plan storage**: keep this plan in the repo's `/plans/<creation-date>/` folder per convention —
  i.e. `plans/2026-07-16/rewards-tab.md`.

### Key ground-truth facts (verified while exploring)
- App rooted at `web/`. Routes are thin re-exports → `*.controller.tsx` in `src/components/pages/`;
  presentational = `*.view.tsx` per feature. Design tokens: StonePanel / ParchmentButton /
  FrameButton / `--primary` gold.
- State: single localStorage store `src/context/ProgressionContext.tsx`, key
  `yugioh-progression-saves-v2`. `SaveSlot` (lines 27-45). `currentSetIndex` is an **index** into
  the ascending-by-date `fetchAllSets()` array. Mutations go through `updateActiveSave(updater)`,
  which already normalizes `savedDecks || []` — the pattern new fields piggyback on.
- Prizes: `src/lib/rewards.ts` — `WheelPrize {id,label,short}` + `WHEEL_PRIZES` (ids:
  `wildcard-common/rare/super/ultra/ultimate-secret/starlight`, `tournament-packs`, `ban`, `unban`,
  `snatch-steal`). File comment already designates it the home for prize resolution.
- `fetchAllSets()` (`src/lib/api.ts`) filters OUT tournament packs (`EXCLUDE_KEYWORDS`) and sets
  `>= 2017-08-01`, sorted ascending by `tcg_date`. `fetchCardsInSet(setName)` / `fetchCardsByIds`
  exist. A card's `card_sets[]` has NO dates. Images rewritten to R2 via `transformCardImages`.
- R2 bucket `yugioh-cards` (host `NEXT_PUBLIC_IMAGE_HOST`) stores **images only**, keyed
  `cards/<imageId>.jpg`, for every card in any set dated ≤ 2016 (see `scripts/images/migrate_images.js`).
- The app already uses **several modals** (e.g. `src/components/card/CardDetailModal.view.tsx`,
  `src/components/DeckBuilder/LoadDeckModal.view.tsx`) — but each hand-rolls the same `fixed inset-0
  z-50 … bg-black/80` overlay shell; there's no single shared primitive. `CardDetailModal` is the
  most complete (Escape, scroll-lock, backdrop close, fade/zoom) and is the one to extract from.
  Pack "details" is inline `renderDetails()` in `Packs.controller.tsx`. Pack-opener orchestration
  lives in `Packs.controller.tsx` (state + `handleOpenPacks`/`handleNextPack`/`handleOpenAll`); the
  view `PackOpeningView` renders one pack.
- Deck-builder add paths: `DeckBuilder.controller.tsx` `handleDrop` (~line 352) and
  `handleDoubleClick` (~line 404), beside the `getCopiesInAllDecks >= 3` check. `CardSearchPanel`/
  `DeckSlot` already have an `isUnavailable`/`count===0` gray-out pattern to extend.

---

## Data model — the rewards ledger

Add to `src/lib/rewards.ts` (keep prize resolution co-located with the prize list):

```ts
export type RewardStatus = 'available' | 'claimed';

export interface RewardEntry {
  id: string;                 // crypto.randomUUID() — key + ledger identity
  prizeId: string;            // WheelPrize.id
  wonFromPackName: string;    // CardSet.set_name recorded on the match
  wonFromSetIndex: number;    // currentSetIndex at time of win — anchor for date gates
  wonDate: string;            // ISO
  status: RewardStatus;
  claimedDate?: string;
  // per-type payloads (only the relevant one set on claim):
  grantedCardId?: number;     // wildcard / starlight
  grantedCardIds?: number[];  // tournament-packs / pity (the opened contents)
  bannedCardId?: number;      // ban / unban target
}

// Drives the ledger UI + claim routing:
export type PrizeKind =
  'wildcard' | 'starlight' | 'tournament' | 'pity' | 'ban' | 'unban' | 'snatch' | 'text';
export function resolvePrizeKind(prizeId: string): PrizeKind { /* map by id */ }

// Wildcard rarity parsing + "this rarity or below" helper (uses pack-logic RARITY_HIERARCHY):
export function wildcardRarityFloor(prizeId: string): string /* e.g. 'Super Rare' */;
```

New `SaveSlot` fields (both **optional** for back-compat with existing saves):
```ts
rewards?: RewardEntry[];      // the ledger (available + claimed)
bannedCardIds?: number[];     // cosmetic ban list, read by deck builder
```

- **Pity** gets its own prize id `pity-packs` (added to nowhere on the wheel — it's loss-only) so
  its claim flow (3 boosters of the finished CORE set) is distinct from the wheel's
  `tournament-packs` (3 real tournament packs). `resolvePrizeKind('pity-packs') → 'pity'`.
- **Migration:** do NOT bump the storage key. Normalize once in `updateActiveSave`
  (`rewards: updated.rewards || []`, `bannedCardIds: updated.bannedCardIds || []`), add empties to
  `createSave`, the legacy-migration object, and `resetProgress`. Context accessors default to `[]`.
- **`pendingReward` is replaced.** Phase 1 leaves the field/type in place (nothing else breaks) but
  stops using it — `recordMatch` no longer writes it and the rewritten `Rewards.controller` no
  longer reads it. Final cleanup (Phase 6) removes `RewardState` / `pendingReward` / `claimReward`
  once grep-clean.

---

## Context actions (`ProgressionContext.tsx`)

New, all via `updateActiveSave`:
```ts
addReward: (e: Omit<RewardEntry,'id'|'status'|'wonDate'>) => void;   // push 'available'
claimRewardEntry: (rewardId: string, payload?: Partial<RewardEntry>) => void; // → 'claimed' + merge + claimedDate
banCard: (cardId: number) => void;    // dedupe into bannedCardIds
unbanCard: (cardId: number) => void;
```
Reuse `addToCollection(cards)` unchanged for wildcard/starlight/tournament/pity grants. Expose the
new state + actions on `ProgressionContextType` and the provider value.

**Reward is created at claim-of-wheel, not in `recordMatch`** (the prize isn't known until the spin
settles). `recordMatch` becomes "append MatchResult" only.

---

## Phase 1 — Foundation (build now, then check in)

Delivers: the ledger data model, nav tab, record-match win/loss both routing into the tab, the
in-panel **Defeat vortex**, and a working Rewards tab that can claim the **simple** rewards
(pity packs + any text-only prizes). Complex modals are shown as "Available" with their claim
buttons wired to placeholders (or hidden behind a "coming soon" until their phase).

**Files modified**
- `src/lib/rewards.ts` — add `RewardEntry`/`RewardStatus`/`PrizeKind`, `resolvePrizeKind`,
  `wildcardRarityFloor`, and a `pity-packs` prize descriptor.
- `src/context/ProgressionContext.tsx` — `rewards`/`bannedCardIds` on `SaveSlot`; normalization;
  `addReward`/`claimRewardEntry`/`banCard`/`unbanCard`; accessors; `recordMatch` → append-only.
- `src/components/shell/AppNav.view.tsx` — add `/rewards` to `NAV_ROUTES` (line 17) and a
  `{ href:"/rewards", label:"REWARDS" }` entry in `NAV_LINKS` immediately before MENU.
- `src/components/pages/RecordMatchPage.controller.tsx`:
  - `Stage = "board" | "wheel" | "defeat"`; **delete the `defeat` boolean state + the full-screen
    flourish branch (lines 37, 107-116) + its `setTimeout`** — the loss now uses the same in-panel
    vortex as the win.
  - Loss → `recordMatch` (advances nothing yet) → `setStage("defeat")`. Add a third
    `<motion.div key="defeat">` act inside the existing `<AnimatePresence>`, using the same
    `curtainsInitial/curtainsAnimate` as the wheel act, so the board **vortexes** out and the defeat
    notice **curtains** into the *same* persistent `.win-panel`.
  - **Win claim** `handleClaimPrize(prize)`: `addReward({ prizeId: prize.id, wonFromPackName:
    currentSet.set_name, wonFromSetIndex: currentSetIndex })` → `advanceSet()`. Two exits offered on
    the claimed wheel: go to `/rewards`, or **"Back to Campaign"** → `/map`. (Set is advanced either
    way, on claim.)
  - **Defeat act** buttons: **"Claim Pity Packs"** → `addReward({ prizeId:'pity-packs', … })` →
    `advanceSet()` → `router.push('/rewards')`; **"Back to Campaign"** → `advanceSet()` (record it
    even if skipping the reward) → `router.push('/map')`. Both advance the set.
- `src/components/pages/Rewards.controller.tsx` — **full rewrite** into the ledger tab: reads
  `rewards`; renders two `StonePanel` sections (Available / Claimed); delegates each entry to
  `RewardCard.view`. Simple prizes claim inline via `claimRewardEntry`; pity claims via the pity
  pack flow (reuse the existing 3× `generateBoosterPack(setCards, sets[currentSetIndex-1])` loop +
  `addToCollection`, but write it back as `claimRewardEntry(id, { grantedCardIds })`).

**Files created**
- `src/components/RecordMatch/DefeatAct.view.tsx` — mirrors `WinnersWheel.view.tsx` structure
  (record-eyebrow + heading "Defeat — 3 Pity Packs" + a body line), with **two `FrameButton`s**:
  `onClaimPity` ("Claim Pity Packs") and `onBackToCampaign` ("Back to Campaign"). Reuses the
  `record-outcome--defeat` styling (moved in from the retired flourish).
- `src/components/Rewards/RewardCard.view.tsx` — one ledger row/card: prize label (`WHEEL_PRIZES`
  lookup), `wonFromPackName`, date, and a claim affordance chosen by `resolvePrizeKind`.

Also: `WinnersWheel.view.tsx` gains a **"Back to Campaign"** affordance next to "Claim Prize" (or
the controller renders it around the wheel act) so the win path offers the same exit as defeat.

**Reuse:** `StonePanel`, `FrameButton`, `ParchmentButton`, `WHEEL_PRIZES`, the existing `.win-panel`
/ `.win-panel__act` CSS + `AnimatePresence` machinery, `generateBoosterPack`, `addToCollection`.

**Verify Phase 1** (dev server is already running — just exercise it in the browser): play a match →
**win** → board vortexes → wheel spins → Claim → set advanced and lands on `/rewards` with the prize
in **Available**; the wheel also offers **Back to Campaign** → `/map`. Claim a text prize → moves to
**Claimed**. **Lose** a match → board vortexes into the **in-panel Defeat notice** (identical panel,
no full-screen flourish) → **Claim Pity Packs** → `/rewards` with a pity entry → open 3 pity packs
(of the just-finished core set) → cards added to collection, entry moves to Claimed; the Defeat
notice's **Back to Campaign** instead advances the set and goes to `/map`. Refresh mid-way: ledger
persists (localStorage). Confirm the REWARDS nav item shows and the bar renders on `/rewards`.

---

## Phase 2 — Shared primitives (DRY groundwork)

- **`src/components/ui/Modal.view.tsx`** — the shared overlay the app's modals currently hand-roll,
  extracted from `CardDetailModal.view.tsx` (Escape, scroll-lock, backdrop close, fade/zoom).
  `CardDetailModal` reimplemented over it (public API kept); `LoadDeckModal` can adopt it later.
  New reward dialogs all host inside it.
- **`src/components/PackOpener/PackDetails.view.tsx`** — extracted from `Packs.controller.renderDetails()`
  (StonePanel header + `RarityCardGrid` via `processCardsForRarityGrid(cards, set.set_code)`). Props
  `{ set, cards, onCardClick?, onHover?, onLeave?, selectableRarities? }`. `Packs.controller` reuses it.
- **`src/hooks/usePackOpening.ts`** — extract pack-opener orchestration from `Packs.controller`
  (`packsToOpen`/`currentPackIndex`/`flippedCards`/`allOpenedCards`/`showSummary` +
  `handleOpenPacks`/`handleCardClick`/`handleFlipAll`/`handleNextPack`/`handleOpenAll`/
  `isPackFullyOpened`). `Packs.controller` refactored to consume it (low-risk: only consumer);
  the tournament-packs modal reuses it. **Verify /packs still opens packs unchanged.**

## Phase 3 — Tournament packs claim

- `src/lib/api.ts`: extract an internal cached raw `/cardsets.php` fetch shared by
  `fetchAllSets`; add **`fetchTournamentSets()`** (keep only tournament-family names dropped by
  `EXCLUDE_KEYWORDS`, sorted by date). Consumer picks the latest with
  `tcg_date < sets[entry.wonFromSetIndex].tcg_date`.
- `src/components/Rewards/TournamentPacksModal.view.tsx` — `<Modal>` hosting `PackOpeningView`
  driven by `usePackOpening` for 3 packs (`generateBoosterPack` is already tournament-aware via
  `determinePackType`). On finish: `addToCollection(all)` + `claimRewardEntry(id,{grantedCardIds})`.
  Placeholder art when a tournament set isn't in `booster_images.json`.

## Phase 4 — Wildcard claim

- `src/components/Rewards/WildcardModal.view.tsx` — `<Modal>` + `PackDetails` showing
  `fetchCardsInSet(sets[entry.wonFromSetIndex].set_name)`, with cards of the reward's rarity **or
  below** selectable (`wildcardRarityFloor` + pack-logic rarity hierarchy). Pick → `addToCollection`
  + `claimRewardEntry(id,{grantedCardId})`. Starlight (`wildcard-starlight`) routes to Phase 6.

## Phase 5 — Ban / Unban (cosmetic) + deck-builder marking

- `src/lib/api.ts`: `searchCardsByName(query)` (YGOPRODeck `cardinfo.php?fname=`, `transformCardImages`).
- `src/components/Rewards/BanInput.view.tsx` — parchment typeahead in `<Modal>`. Ban: pick from
  full DB → `banCard(id)` + `claimRewardEntry(id,{bannedCardId})`. Unban: pick from `bannedCardIds`
  (`fetchCardsByIds`) → `unbanCard(id)` + `claimRewardEntry`.
- `src/components/pages/DeckBuilder.controller.tsx` — read `bannedCardIds`; in `handleDrop` (~352)
  and `handleDoubleClick` (~404), if banned, block the add (alert). Pass a `bannedIds` set to the
  search panel.
- `src/components/DeckBuilder/CardSearchPanel.view.tsx` / `DeckSlot.view.tsx` — extend the existing
  `isUnavailable` gray-out with a `banned` visual (grayed + marker), cosmetic only.

## Phase 6 — Starlight search + cleanup

- `src/lib/api.ts`: `fetchSetDateMap()` — one unfiltered `/cardsets.php` fetch reduced to
  `{ set_name/set_code → tcg_date }` (module-cached), for the "released prior to this pack" gate.
- `src/components/Rewards/StarlightSearchModal.view.tsx` — `<Modal>` full-DB typeahead
  (`searchCardsByName`), eligible iff the card has any printing with `tcg_date <
  sets[entry.wonFromSetIndex].tcg_date`. Pick → `addToCollection` + `claimRewardEntry`. Art comes
  from R2 for ≤2016 cards (placeholder otherwise).
- **Snatch-steal**: ledger renders it Available-but-locked ("Requires multiplayer — coming soon"),
  no claim path.
- **Cleanup**: remove `RewardState` / `pendingReward` / `claimReward` once grep confirms no readers.

---

## Reuse decisions (DRY)
- `Modal` hosts every reward dialog. `PackDetails` shared by `/packs` + wildcard. `usePackOpening`
  shared by `/packs` + tournament modal. Prize kind/rarity/resolution logic lives in `rewards.ts`.
  The wheel only **reveals**; the ledger **resolves** (grants). Reward creation lives in the win/
  defeat claim handlers, not `recordMatch`.

## End-to-end verification (per phase — dev server is already running)
Drive the real flow each phase in the browser: record win/loss → ledger entry → claim via its modal
→ collection updated + entry moves to Claimed + persists across refresh. Phase 5 additionally: ban a
card → deck-builder grays it + blocks the add; unban → restored. Phase 6: starlight search surfaces
an off-timeline card (e.g. a structure-deck card) dated before the pack and grants it.

## Process notes
- **Commit cadence**: after each phase/step is verified, **commit only once the user approves** it;
  do not revert commits already made. Work on the current `feature/record-match-winners-wheel`
  branch (or a follow-on branch if the user prefers).
- **This plan lives in-repo** at `plans/2026-07-16/rewards-tab.md` (creation-date subfolder, per the
  plans convention) in addition to the working plan file.
