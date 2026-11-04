# Multiplayer Backend, Accounts & Duelist Kingdom Onboarding

## Context

Today the app is a static Next.js export on GitHub Pages. Every rule lives in the browser: pack RNG (`pack-logic.ts:661,722`), the wheel spin (`WinnersWheel.tsx:56`), set gating (`packs/page.tsx:47-49` only locks *later* sets; `?set=0` works and pack count is unbounded), reward claims (`claimRewardEntry` doesn't check status), and `importCollection` (an unchecked YDK cheat path). State is one localStorage blob (`lib/storage.ts`), and there's no identity beyond a global `duelistName`.

**Goal:** a secure, server-authoritative backend (MongoDB) with user and admin roles.

- Players progress under enforced limits.
- A player can play **solo** or **invite one rival** (by duelist name or link) into a shared series. The two players share the set progression; each keeps their own collection, decks and rewards.
- A match result needs the rival's **async approval**. The app keeps working while it waits, and the set advances automatically once it's confirmed.
- The ugly `/onboarding` page is replaced by a **Duelist Kingdom invitation** sign-up and sign-in, opened in place from the existing main menu. The menu itself stays as it is.

## Decisions locked with the user (2026-10-26)

**Hosting and stack**
- **One Render web service (free tier to start)** serves everything from one origin: the Next static build, `/api/*` and `/ws`.
  - Same origin gives httpOnly `SameSite=Lax` cookies, with no CORS and no domain needed.
  - The free tier sleeps after 15 idle minutes, so the first request takes about 30s. That's accepted for now.
  - The GitHub Pages deploy is retired. GitHub Actions keeps running CI.
- **Stack:** Fastify, the official `mongodb` driver and **zod** schemas shared between web and API.
  - MongoDB is on Atlas. The user is logged in on the web and needs to create a cluster and a DB user.
  - The "CLI from npm" they asked about is the `mongodb` driver package that the API imports. The Atlas CLI isn't on npm.

**Auth and admin**
- Email and password (argon2id, with email verification and password reset) **plus Google sign-in** (changed from Discord on 2026-10-28).
  - Google uses the server-side OAuth code flow with PKCE, in our own module (not Supabase), written as a self-contained folder so it can be copied into the user's other Node apps.
  - Google's OAuth client can only be created by hand in the Cloud Console; there's no API or gcloud command for standard web clients.
- Email is sent through **Gmail SMTP with an app password** (nodemailer), because there's no domain.
- **Admin = dev mode** for the developer: a toggle that bypasses game rules for testing (edit rules, grant items, set the set index, override results). It's not a tool for moderating users. Every dev-mode action is audit-logged.

**Series rules**
- A series is **solo or 2 players**. An account can be in many series.
- Invites work **by duelist name** (in-app notification) **and by shareable link** (`/join?code=…`).
- The creator picks the rules at creation: **packs per set 12, 24 or 30** and the starting set.
- After creation, only **admin dev mode** can change the rules.

**Pack opening**
- **One pack session per player per set**, in three stages:
  1. "Open packs" (allowed once per set).
  2. Flip. Progress is persisted server-side, so a refresh resumes where you were.
  3. Review: **save to collection**, or **spend a Redoer Ticket** to reroll **all N packs** of the session.
- Earlier sets are reachable **only through rewards** (pity and tournament packs).

**Redoer Ticket** is a new wheel prize.

**Match results**
- **Only VICTORY or DEFEAT needs confirmation.**
  - Either player can report.
  - The rival approves or rejects via a notification.
  - A rejection voids the report and either player can re-report.
  - A confirmation automatically advances the set and creates the rewards: a **wheel spin** entry for the winner and **pity packs** for the loser.
- **Reporting is blocked until both players have saved their opening for the current set.**
- In solo, results apply immediately.

**Rival-facing rewards**
- **Ban and unban apply to the whole series** (a shared banlist).
- **Snatch-steal** lets you pick any card from the rival's binder. One copy *moves* to you, and the rival gets a notification (no confirmation).

**Leaving:** if a rival stops playing, the series simply **pauses**. Dev mode can fix it.

**Notifications** are persisted in Mongo and pushed live over **WebSocket** when the user is online, so anything sent while they were offline is waiting at login.

**Collection YDK import**
- When a series starts from a set other than the first, each player can import a collection YDK **once**: the creator at creation, the invitee when joining.
- After that, collection import is **solo-only**.
- Deck `.ydk` import and export stay for everyone, filtered to cards you own.

**Guests and old saves**
- **Guest solo mode stays** and keeps saving to localStorage.
- **Local saves get a one-time import** after sign-up or sign-in. Each becomes a solo series flagged `legacy`.

**Onboarding**
- **Duelist Kingdom invitation** concept, **in place in the menu's left column**. The Yugi art, grid and glow stay put.
- Sign-up asks for **email, password and a unique duelist name** (which is also the invite handle), with an optional **import local saves** step.
- Players land **back on the main menu**, signed in.

**Process**
- **Foundation first.**
- Small, meaningful, verified commits on a branch per phase.
- Test everything (unit, API, Playwright drivers).
- Check in with the user at the end of each phase before merging to `main`.

## Architecture

### Repo layout (npm workspaces at the root)

```
package.json                 # workspaces: ["shared", "api", "web"]
shared/  (@ygo/shared)       # pure TS, no DOM/Node APIs
  pack-logic.ts              # moved from web/src/lib, RNG injected
  rewards.ts collection.ts   # moved from web/src/lib (+ redoer-ticket prize)
  rules.ts                   # canOpenPacks, canReport, PACKS_PER_SET_OPTIONS = [12,24,30]
  schemas/*.ts               # zod: User, Series, SeriesPlayer, PackSession, MatchReport, RewardEntry, API bodies
api/  (Fastify)
  src/server.ts              # helmet, rate-limit, cookie, static (web/out), websocket
  src/plugins/{db,auth,ws}.ts
  src/middleware/{requireAuth,requireAdmin,requireSeriesMember}.ts
  src/routes/{auth,series,packs,matches,rewards,decks,notifications,dev}.ts
  src/services/*.ts          # all game mutations; Mongo transactions
  scripts/sync-cards.ts      # YGOPRODeck → Mongo `cardSets`/`cards`
  scripts/promote-admin.ts
web/                         # existing Next app, still `output: 'export'`
render.yaml                  # build shared+web+api, start api
```

**Reuse.** These move into `shared/` unchanged, apart from RNG injection:
- `generateBoosterPack(setCards, setInfo)` (`web/src/lib/pack-logic.ts:68`) gains a final `rng: () => number` parameter, defaulting to `Math.random` for guest mode. The server passes a `crypto.randomInt`-backed RNG.
- `WHEEL_PRIZES`, `PITY_PRIZE`, `resolvePrizeKind`, `wildcardRarityFloor` and `isRarityAtOrBelow` (`web/src/lib/rewards.ts`).
- `collectionKey`, `ownedCountsById` and `parseCollectionKey` (`web/src/lib/collection.ts`).
- `parseYDK` and `parseYDKWithSections` (`web/src/lib/ydk-parser.ts`).

The `web/src/lib/*` files become re-exports so imports don't churn.

**Card data on the server.** `scripts/sync-cards.ts` mirrors `/cardsets.php` and the per-set card lists into Mongo, applying the same filters as `fetchAllSets` (`api.ts:140`: cutoff, `EXCLUDE_KEYWORDS`, more than 20 cards) and the tournament set list (`api.ts:180`).
- The server rolls packs and validates set indexes, rarities and date gates (`existedByCutoff`, `earliestPrintingDate`, `api.ts:253,267`) against this data.
- This follows YGOPRODeck's "cache locally, don't hammer" policy.
- The browser keeps calling YGOPRODeck directly for display-only data (card search and details).

### MongoDB collections

| Collection | Key fields | Indexes |
|---|---|---|
| `users` | email, emailVerified, passwordHash?, discordId?, duelistName, role `user\|admin` | unique email; unique duelistName (case-insensitive collation); unique sparse discordId |
| `sessions` | `_id` = sha256(token), userId, expiresAt | TTL on expiresAt |
| `authTokens` | sha256(token), userId, kind `verify\|reset`, expiresAt | TTL |
| `series` | name, mode `solo\|duo`, ownerId, memberIds, status `awaiting_rival\|active\|paused`, rules {startSetIndex, packsPerSet}, currentSetIndex, bannedCardIds, matchHistory, legacy?, version | memberIds |
| `seriesPlayers` | seriesId, userId, collection, savedDecks, rewards (ledger), ydkImportUsed | unique (seriesId, userId) |
| `packSessions` | seriesId, userId, setIndex, source `set\|pity\|tournament`, rewardId?, packs (card ids + rarity + set code), flipped, stage `opening\|review\|saved\|rerolled` | unique (seriesId, userId, setIndex, source=`set`, stage≠rerolled) |
| `matchReports` | seriesId, setIndex, reporterId, winnerId, status `pending\|confirmed\|rejected` | unique pending per series |
| `invites` | seriesId, fromUserId, toUserId?, codeHash?, status, expiresAt | TTL; codeHash |
| `notifications` | userId, type, payload, readAt | (userId, createdAt) |
| `auditLog` | actorId, action, target, before/after, at | |
| `cardSets`, `cards` | synced data | set_name, set_code, id |

Multi-document mutations (confirming a result, snatch-steal, saving a session, a reroll) run in **Mongo transactions** with a `version` check, which makes double-clicks and races safe.

### Security baseline
- **Passwords and tokens**
  - argon2id password hashes.
  - 32-byte random session tokens. Only their sha256 is stored.
  - Cookie flags: `httpOnly; Secure; SameSite=Lax; Path=/`, with a 30-day sliding expiry.
  - Logout deletes the session row.
- **CSRF:** SameSite=Lax, plus an `Origin` check on every non-GET request and on the WS upgrade.
- **Rate limits:** `@fastify/rate-limit` globally, and stricter on login, signup, reset and the duelist-name check.
- **No account enumeration:** reset and verify always return 200.
- **Input validation:** every body, param and query is parsed with zod, and unknown keys are rejected.
- **Middleware chain:** `requireAuth`, then `requireSeriesMember` (loads the series and checks membership), then the handler.
  - `requireAdmin` guards `/api/dev/*`.
  - The client never sends outcomes, only *intents*: "open packs", "spin", "claim reward X with choice Y". The server computes the results.
- **Headers:** `@fastify/helmet` with a CSP that allows only self, the R2 image host and the YGOPRODeck API.
- **Secrets** (Mongo URI, Google client secret, SMTP app password) live only in Render env and a gitignored `api/.env`.
- Atlas network access is `0.0.0.0/0`, because Render free has no static IP. That's mitigated by a strong DB user password and a least-privilege role.

### Game flow (server-authoritative)
1. **Open packs.** Requires that no `set` session exists yet for this player and the current set index. The server rolls N packs, stores them, and returns them.
2. **Flip.** Flips are persisted with a debounced batch (`PATCH …/flips`). On reload, `GET /active-session` resumes.
3. **Review.**
   - *Save* applies `addToCollection` and sets stage `saved`.
   - *Reroll* consumes one available `redoer-ticket` reward, marks the session `rerolled` and rolls a fresh session.
4. **Report.** Requires both members to have a `saved` set session for the current set and no pending report.
   - Solo: applied immediately.
   - Duo: a `pending` report is created and the rival gets a notification and WS push.
5. **Confirm.**
   - The match is appended to history and `currentSetIndex` goes up by one.
   - The winner gets a `wheel-spin` reward entry and the loser gets `pity-packs`.
   - Both players get a notification.
6. **Spin.** `POST /rewards/:id/spin` makes the server pick the prize. The client's `WinnersWheel` animates to the *given* prize instead of rolling its own; the change is at `WinnersWheel.tsx:56`, keeping the cosmetic jitter.
7. **Claims.**
   - Wildcard, starlight, tournament and pity reuse the existing modals, but each now calls an API that validates the eligibility the client used to compute.
   - Pity and tournament open a `packSession` with `source=pity|tournament`, so they get the same resume and save flow.
   - Ban and unban edit `series.bannedCardIds`.
   - Snatch-steal moves one copy from the rival's collection and notifies them.
   - A Redoer Ticket stays `available` until it's spent on a review.

### Client
- **Repository interface.** `GameRepository` (`web/src/lib/repo/`) has two implementations:
  - `RemoteRepo` (fetch to `/api`, credentials included) for signed-in users.
  - `LocalRepo` (wraps the existing `storage.ts` and runs the same shared rules client-side) for guests.
- **Context changes.** `ProgressionContext` switches from direct mutations to async commands with a `series` and `me` state: `openPacks`, `flip`, `saveOpening`, `reroll`, `reportMatch`, `respondToReport`, `spin`, `claimReward`, `saveDeck` and so on. The existing `updateActiveSave` mutators become the `LocalRepo` implementation.
- **New contexts.** `AuthContext` covers `me`, sign in/up/out and dev-mode state. `NotificationsContext` combines the WS client, the inbox and the AppNav bell badge with approve/reject actions.
- **Menu** (`web/src/app/menu/page.tsx`): the visuals are untouched and only the item list changes.
  - Signed out: SIGN IN, SIGN UP, PLAY AS GUEST, EXIT.
  - Signed in: CAMPAIGN MODE (series list with solo/duo badges, pending invites, a "New Series" wizard with mode, start set, packs 12/24/30, invite by name or copy link, and an optional YDK import if the start isn't the first set), CARD COLLECTION, OPTIONS, DEV MODE (admins only), SIGN OUT.
- **Removals.** `/onboarding`, `duelistName` in localStorage and the duplicate name input in `SaveSlotList` are removed. The root `/` goes straight to `/menu`.
- **Join links.** `/join?code=…` uses a query param because static export can't do dynamic segments. Signed out, it shows the invitation and then sign-in or sign-up, then joins.

### Duelist Kingdom onboarding (in-place in the menu)
- **Where it renders.** The left column of the menu swaps its `MenuItem` list for the onboarding panel using the existing Framer Motion slide. The Yugi art, `.menu-grid-bg` and gold glow stay exactly as they are.
- **Sign-up**
  1. A sealed envelope with a wax seal. Clicking cracks the seal.
  2. The letter unfolds into a parchment form ("YOU ARE CORDIALLY INVITED TO DUELIST KINGDOM").
  3. Fields: **duelist name** (debounced live availability check), **email** and **password** (with a strength meter).
  4. Four **star chips** act as the step indicators and light up as each field validates.
  5. **ACCEPT THE INVITATION** sends the chips flying into a duelist glove.
  6. A "check your email" verification notice, then the **import local saves** step if any local saves exist, then back to the menu signed in.
- **Sign-in:** "PRESENT YOUR INVITATION". A parchment card with email and password, a Google button and a forgot-password link.
  - A first-time Google sign-in gets one extra step to claim a duelist name.
- **Art and motion**
  - All art is built from SVG and CSS on the existing tokens: `.parchment-bg`, `--primary`, `--wood-*` and FrameButton.
  - This follows the `WheelDecor` precedent, so no new raster asset pipeline is needed.
  - It respects `prefers-reduced-motion`.
  - Components live in `web/src/components/onboarding/` (`InvitationEnvelope`, `InvitationForm`, `StarChips`, `SignInCard`, `ClaimDuelistName`, `ImportLocalSaves`).

## Phases (each on its own branch, small verified commits, user check-in before merge)

1. **`feat/backend-foundation`**
   - Set up the workspaces.
   - Move the shared modules and inject the RNG (web still uses `Math.random`, so behaviour is unchanged).
   - Build the Fastify skeleton: health check, db plugin, helmet, rate limit, static serving of `web/out`.
   - Write the zod schemas and the card sync script.
   - Add `render.yaml` and a CI workflow (lint, typecheck and tests for every workspace), and retire the Pages deploy.
   - Install `mongodb`, `fastify` and the `@fastify/*` plugins, plus `zod`, `argon2`, `nodemailer`, `mongodb-memory-server` (dev) and an OAuth helper (`arctic`).
2. **`feat/auth`**
   - Users and sessions, signup, login and logout, email verify and reset over Gmail SMTP, Google sign-in.
   - The `requireAuth` and `requireAdmin` middleware and the `promote-admin` script.
   - Ships with a *plain* sign-in/up form for testing; the redesign lands in phase 5.
3. **`feat/server-solo-series`**
   - Solo series CRUD and creation rules.
   - Pack sessions with all three stages and reroll.
   - Server-side report and wheel spin, every reward claim, server-side deck save and validation, and the creation-time and solo YDK collection import.
   - Wire `RemoteRepo` and the context refactor.
   - Add Redoer Ticket to `WHEEL_PRIZES`.
3b. **`feat/dev-mode`**
   - The `/api/dev/*` routes (set index, rules, grant cards/rewards/tickets, reset sessions, force or void results), with an audit log.
   - A dev panel toggle in the UI, shown to admins only.
4. **`feat/duo-series`**
   - Invites by name and link, `/join`, `requireSeriesMember`.
   - Pending reports with approve and reject, and the reporting gate.
   - The notifications collection, the WS plugin and client, and the AppNav bell.
   - The series-wide banlist and snatch-steal.
5. **`feat/duelist-kingdom-onboarding`**
   - The invitation sign-up and sign-in in place in the menu.
   - The signed-in and signed-out menu items.
   - Remove `/onboarding` and `duelistName`.
6. **`feat/guest-and-import`**
   - `LocalRepo` guest mode under the new context.
   - One-time import of local saves as `legacy` solo series.
   - Fix the stray `admin@ygoprog.com` line in `pack_opening_rules.md`.
   - Update the READMEs per `.agent/rules/documentation.md`.
7. **`feat/mobile-redesign`** (added 2026-10-28)
   - The mobile version looks bad and barely works (packs can't even be opened on a phone).
   - Redesign it so every flow works on a phone, with great UX that keeps the app's 90s Yu-Gi-Oh! look and feel. This includes the parked items: GuideSprite overlapping the VICTORY/DEFEAT buttons, and the mobile deck builder.
   - Verify every route and flow at phone widths with the Playwright drivers.

The plan also gets copied into the repo at `plans/2026-10-26/multiplayer-backend.md`, per the plans convention.

## User setup tasks (I'll prompt for these when each phase needs them)
- **Atlas:** create an M0 cluster and a DB user, allow network access from `0.0.0.0/0`, and give me the connection string. It goes in `api/.env` and Render env.
- **Gmail:** create an app password, which needs 2FA on the account.
- **Google Cloud Console:** create a project, set up the OAuth consent screen, and create a "Web application" OAuth client with redirects `http://localhost:4000/api/auth/google/callback` and `https://<render-app>.onrender.com/api/auth/google/callback`. The client ID and secret go in `api/.env` and Render env.
- **Render:** create the web service from `render.yaml` and paste the env vars.

## Verification
- **Unit (Jest, `shared/`)**
  - Pack logic with a seeded RNG gives deterministic pulls.
  - `rules.ts` gates: open once per set, the report gate, packs per set limited to {12, 24, 30}.
  - Reward resolution, including the Redoer Ticket.
- **API (Fastify `inject` and `mongodb-memory-server` as a replica set, for transactions)**
  - Auth: signup, verify, login and logout, reset, rate limit, no enumeration.
  - Authorization: a non-member gets 403 on a series, a non-admin gets 403 on `/api/dev`.
  - Abuse cases:
    - Opening packs twice.
    - Opening an earlier set.
    - Claiming a reward twice.
    - Forging a prize id.
    - Rerolling without a ticket.
    - Reporting before both players have saved.
    - Confirming your own report.
    - Snatching more copies than the rival owns.
    - Collection import in a duo series after creation.
- **Playwright drivers** (extend `web/scripts/drivers/`; `_lib.mjs` gains `signUp`/`signIn` helpers and an API seeding helper)
  - `auth.mjs`: invitation sign-up through to the menu signed in, then sign out and sign in.
  - `duo-series.mjs`: two browser contexts. A invites B by name and B accepts. Both open packs, refresh mid-flip to check resume, and save. A reports a win, B sees a live notification and approves. Both see the set advance, A spins (server prize), B claims pity. Also covers a reject and re-report.
  - `pack-session.mjs`: resume after reload, then a reroll that consumes a ticket.
  - `guest-import.mjs`: play as a guest, sign up, import, and the legacy series appears.
  - Update `smoke.mjs`: the onboarding redirect changes and routes need auth.
  - Check the dev "issues" console badge, per `.agent/rules/testing-rules.md`.
- **End to end:** run `npm run dev` (Next on :3000, API on :4000; localhost ports are same-site, so the cookies work), then deploy to the Render free tier and run the duo flow against the live URL.

## Progress log

### Phase 1: backend foundation (done 2026-10-26, branch `feat/backend-foundation`)
- npm workspaces (`shared`, `api`, `web`). The root lockfile was seeded from web's old one, so no resolved version changed.
- `@ygo/shared` holds the types, set filters, collection and reward rules, pack logic (with an injectable RNG) and the YGOPRODeck zod schemas. The `web/src/lib/*` files re-export from it.
- The Fastify API has zod env config, a MongoDB connection, `/api/health`, helmet and CSP, rate limits on `/api` only, and same-origin static serving of `web/out`.
- `npm run sync-cards -w @ygo/api` mirrors YGOPRODeck into Atlas: 1035 sets and 8068 pre-cutoff cards, with guards against broken or shrinking responses.
- CI (`ci.yml`) runs lint, typecheck, test and build for every workspace. `deploy.yml` keeps publishing to GitHub Pages after CI passes, until Render is live. `render.yaml` is ready; it was rehearsed locally against Atlas, but the service isn't created yet.

**Deviations from the plan above**
- Shared and API tests use **Vitest** (ESM-native); web keeps Jest.
- The **domain schemas** (User, Series, PackSession, …) move into the phases that use them (2 and 3) rather than being designed up front.
- The **GitHub Pages deploy is kept** until the Render service is verified, instead of being retired in Phase 1.

**Found along the way**
- Next 16's static export writes segment prefetches as `__next.<seg>/__PAGE__.txt`, but the router requests `__next.<seg>.__PAGE__.txt`. On GitHub Pages every client navigation 404s its prefetch and falls back to a full page reload. The API fixes this with a URL rewrite.
- Playwright drivers could have their seeded save wiped by the app's own mount effect. They now seed from `/favicon.ico`.
- Known, not yet fixed: `/bg/fabric_pattern.png` (deck builder grid background) was never committed, and `npm audit` flags the image-tooling dependencies. Both go on a housekeeping branch.
- `crypto.randomInt` caps its range below 2^48. The server's crypto RNG (Phase 3) must respect that.

**Before Phase 2:** the user creates the Render service from `render.yaml` (region close to the Atlas cluster), plus the Gmail app password and Google OAuth client when auth needs them.

Merged into `main` with `chore/housekeeping` (the dead `fabric_pattern.png` reference) on 2026-10-28 and pushed by the user; CI and the Pages deploy passed. Atlas is in Frankfurt, matching `render.yaml`.

### Decisions 2026-10-28
- Google sign-in replaces Discord. Accounts keep email (for self-service resets).
- Auth is our own module, not Supabase like Lesson Manager (that app has no server auth code to reuse).
- Mobile redesign added as Phase 7.
- GitHub's built-in "pages build and deployment" (Jekyll) job fails on every push. That predates this project and doesn't affect the site, which is published by `deploy.yml`; switching the repo's Pages source to "GitHub Actions" stops it.

### Phase 2: auth (done 2026-11-04, branch `feat/auth`)
Done:
- Shared account input rules (`@ygo/shared` `schemas/auth.ts`).
- Storage: argon2id passwords with a timing-equalising dummy check, users unique by email / duelist name / Google id, hashed-token sessions with a sliding 30-day expiry and TTL index.
- `/api/auth/{signup,login,logout,me,duelist-name-available}`. Login takes an email or a duelist name and gives one identical 401 for every failure. Signup and login are limited to 10 per minute per IP, the name check to 30.
- Session cookie: `sid`, `httpOnly`, `SameSite=Lax`, `Secure` in production, 30 days.
- `requireAuth` / `requireAdmin` middleware and an `Origin` check on every non-GET `/api` request (own origin plus `ALLOWED_ORIGINS`).

- Google sign-in (`api/src/auth/google/`, self-contained): authorization-code flow with PKCE, a browser-bound `state`, a nonce and single-use flow records. A returning Google account signs in, a verified matching email is linked, and a first-time account claims a duelist name. Linking onto an unverified pre-registered email drops that password and ends its sessions.
- Email verification and password reset over SMTP (Gmail app password). Links carry a one-time token to `/menu/?verify=…` or `?reset=…`; only hashes are stored, links expire (24 h / 1 h), and a new link cancels the old. Resetting signs out every session. Mail is sent in the background so "forgot password" answers identically, and as fast, for unknown emails.

- `npm run promote-admin -w @ygo/api -- <email or duelist name> [--demote] [--allow-unverified]` is the only way to become an admin (no HTTP route). It refuses unconfirmed emails unless told otherwise and writes each change to `auditLog`.

- Plain test page at `/dev/auth/` (web), which is also where email links and the Google redirect land (`AUTH_PAGE_PATH` in `api/src/auth/landing.ts`; Phase 5 moves it to `/menu/`). `ALLOWED_ORIGINS` also enables CORS for the Next dev server.
- `npm run test-server -w @ygo/api` runs the API on an in-memory database with captured email, and `web/scripts/drivers/auth.mjs` drives sign-up, confirmation, sign-in, and reset through it in a real browser.
- Verified: lint, typecheck, 27 shared + 70 API + 36 web tests, the build, the auth driver (26 checks) and the existing smoke driver. A real test email was accepted by Gmail.

Verified by hand on 2026-11-04 against Atlas and real Google: Google sign-in with the duelist-name step, Gmail delivery, and `promote-admin` (the account `HorizonDev` is the user's admin test account; keep it). Before inviting other players: publish the Google app out of Testing mode, since only listed test users can sign in until then.

Known: sign-up answers 409 for a taken email, so it can reveal that an email is registered. Reset and verify will not.

### Phase 3: server solo series (in progress, branch `feat/server-solo-series`)
Broken into small commits, each tested on its own:
1. **Shared rules and series input** (`shared/src/rules.ts`, `schemas/series.ts`): packs per set {12, 24, 30}, the series-creation rules, and the "can these packs be opened" gate.
2. **Card catalog on the server**: the timeline and tournament sets computed from the synced `cardSets` (the same `timelineSets` the web uses, so set indexes match), cards by set, and a crypto RNG (48 random bits per draw, under `crypto.randomInt`'s cap).
3. **Solo series**: create, list and read your own series; `requireSeriesMember`. Each series stores its rules, set index, banlist and match history; each player's collection, decks and reward ledger live in `seriesPlayers`.
4. **Pack sessions**: open once for the current set, persist flips, resume after a reload, save into the collection (transaction), and reroll with a Redoer Ticket.
5. **Match results and the wheel**: solo reports apply at once, and only after the current set's opening is saved. A win creates a wheel-spin reward and a loss creates pity packs, and the set advances. `POST /rewards/:id/spin` picks the prize on the server. Redoer Ticket joins the wheel here.
6. **Reward claims**: wildcard, starlight, tournament and pity (as pack sessions), ban and unban, Redoer Ticket. Every eligibility rule the browser used to check is re-checked on the server.
7. **Decks and YDK import**: server-side deck save and validation (owned cards only), and the collection import at creation, or anytime in solo.
8. **Web**: a `GameRepository` with `LocalRepo` (today's localStorage behaviour, for guests) and `RemoteRepo`; `ProgressionContext` becomes async commands; the pages call it; `WinnersWheel` lands on the server's prize. Playwright `pack-session.mjs`, and `smoke.mjs` updated.

Decided with the user (2026-11-04):
- Snatch Steal is left off the wheel in solo series; there's no rival to steal from. The wheel the server spins depends on the series mode (step 5).
- A saved position keeps the set's name as well as its index, on series (server) and guest saves (web), and the name wins when the two disagree. Guest saves written before this are translated once using the old date-only order, so they stay on the set they meant.
- The 50-series cap is per player (how many runs one account can have), a guard against scripted creation; reads aren't limited beyond the normal rate limit.
