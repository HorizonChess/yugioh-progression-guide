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
- **Snatch-steal** lets you pick any card from the rival's binder. You get a copy and the rival keeps theirs (changed 2026-11-05: the point is gaining the card, not the rival losing it); the rival gets a notification (no confirmation).

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
   - Snatch-steal copies a card from the rival's collection (they keep it) and notifies them.
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

### Duelist Kingdom onboarding (its own scene, at `/`)
Revised with the user on 2026-11-04: the onboarding has its own look, unlike the menu, and the letter theme runs through all of it. The first version (panels in the menu's left column) was replaced.
- **Title screen (`/`).** A candlelit desk with the logo and PRESS START. Signed in, it greets the duelist and goes to the menu. EXIT GAME and the menu's SIGN IN come back here (signing out stays on the menu, since 2026-11-05), and email links and the Google redirect land here (`AUTH_PAGE_PATH = '/'`).
- **Sign-up**
  1. A sealed envelope lands on the desk front up and writes "Welcome to the Yu-Gi-Oh! Progression Series" on itself, then turns over.
  2. Breaking the wax seal shatters it into pieces that skid across the desk. The flap opens and the letter slides out and unfolds (tri-fold).
  3. The letter: "You are cordially invited to Duelist Kingdom", duelist name (live check), email, password with a strength meter, and four star chips that light up as each validates.
  4. ACCEPT THE INVITATION drops the chips into a leather cuff, says to check email, then ENTER THE KINGDOM goes to the menu. The **import local saves** step slots in here in Phase 6.
- **Sign-in:** "I already have an invitation" brings the letter up as "Present your invitation", with Google and forgot password. A first-time Google sign-in claims a duelist name on the letter. "Play as a guest" goes to the menu, whose guest list adds SIGN IN.
- **How it's made (2.5D):** GSAP timelines, real CSS 3D for the flip, flap and folds, SVG filter lighting for the paper, wood, leather and wax, and a canvas for the dust and the seal's shards. It honours `prefers-reduced-motion` (every animation jumps to its end). Code in `web/src/components/onboarding/` with its own `onboarding.css` and fonts, loaded only on `/`.

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
3b. **`feat/dev-mode`** (skipped 2026-11-04; may come back later if it's needed. Admins can already open any set's packs, from Phase 3.)
   - The `/api/dev/*` routes (set index, rules, grant cards/rewards/tickets, reset sessions, force or void results), with an audit log.
   - A dev panel toggle in the UI, shown to admins only.
4. **`feat/duo-series`**
   - Invites by name and link, `/join`, `requireSeriesMember`.
   - Pending reports with approve and reject, and the reporting gate.
   - The notifications collection, the WS plugin and client, and the AppNav bell.
   - The series-wide banlist and snatch-steal.
5. **`feat/duelist-kingdom-onboarding`**
   - The title screen and onboarding scene at `/`: the invitation sign-up, sign-in, reset and Google name claim, written on the letter.
   - The signed-in and signed-out menu items.
   - Remove `/onboarding` and `duelistName`.
6. **`feat/guest-and-import`**
   - `LocalRepo` guest mode under the new context.
   - One-time import of local saves as `legacy` solo series.
   - Fix the stray `admin@ygoprog.com` line in `pack_opening_rules.md`.
   - Update the READMEs per `.agent/rules/documentation.md`.
7. **`feat/mobile-redesign`** (added 2026-10-28; the UI do-over below happens in this phase)
   - The mobile version looks bad and barely works (packs can't even be opened on a phone).
   - Redesign it so every flow works on a phone, with great UX that keeps the app's 90s Yu-Gi-Oh! look and feel. This includes the parked items: GuideSprite overlapping the VICTORY/DEFEAT buttons, and the mobile deck builder.
   - Verify every route and flow at phone widths with the Playwright drivers.

**UI do-over (decided 2026-11-04):** the whole app gets a UI do-over: art, animation and layout on every screen, keeping the 90s Yu-Gi-Oh! vibe. It's done together with Phase 7, since both touch every screen. The onboarding scene (Phase 5) is the first piece in the new style. The physics chains (`feat/physics-chain`) wait on their branch and go in with the do-over. Until then, new screens in Phases 4 and 6 stay plain and functional.

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

- Plain test page at `/dev/auth/` (web), which is also where email links and the Google redirect land (`AUTH_PAGE_PATH` in `api/src/auth/landing.ts`; Phase 5 moves it to `/`). `ALLOWED_ORIGINS` also enables CORS for the Next dev server.
- `npm run test-server -w @ygo/api` runs the API on an in-memory database with captured email, and `web/scripts/drivers/auth.mjs` drives sign-up, confirmation, sign-in, and reset through it in a real browser.
- Verified: lint, typecheck, 27 shared + 70 API + 36 web tests, the build, the auth driver (26 checks) and the existing smoke driver. A real test email was accepted by Gmail.

Verified by hand on 2026-11-04 against Atlas and real Google: Google sign-in with the duelist-name step, Gmail delivery, and `promote-admin` (the account `HorizonDev` is the user's admin test account; keep it). Before inviting other players: publish the Google app out of Testing mode, since only listed test users can sign in until then.

Known: sign-up answers 409 for a taken email, so it can reveal that an email is registered. Reset and verify will not.

### Phase 3: server solo series (done 2026-11-04, branch `feat/server-solo-series`)
Broken into small commits, each tested on its own:
1. **Shared rules and series input** (`shared/src/rules.ts`, `schemas/series.ts`): packs per set {12, 24, 30}, the series-creation rules, and the "can these packs be opened" gate.
2. **Card catalog on the server**: the timeline and tournament sets computed from the synced `cardSets` (the same `timelineSets` the web uses, so set indexes match), cards by set, and a crypto RNG (48 random bits per draw, under `crypto.randomInt`'s cap).
3. **Solo series**: create, list and read your own series; `requireSeriesMember`. Each series stores its rules, set index, banlist and match history; each player's collection, decks and reward ledger live in `seriesPlayers`.
4. **Pack sessions**: open once for the current set, persist flips, resume after a reload, save into the collection (transaction), and reroll with a Redoer Ticket.
5. **Match results and the wheel**: solo reports apply at once, and only after the current set's opening is saved. A win creates a wheel-spin reward and a loss creates pity packs, and the set advances. `POST /rewards/:id/spin` picks the prize on the server. Redoer Ticket joins the wheel here.
6. **Reward claims**: wildcard, starlight, tournament and pity (as pack sessions), ban and unban, Redoer Ticket. Every eligibility rule the browser used to check is re-checked on the server.
7. **Decks and YDK import**: server-side deck save and validation (owned cards only), and the collection import at creation, or anytime in solo.
8. **Web**: a `GameRepository` with `LocalRepo` (today's localStorage behaviour, for guests) and `RemoteRepo`; `ProgressionContext` becomes async commands; the pages call it; `WinnersWheel` lands on the server's prize. Playwright `pack-session.mjs`, and `smoke.mjs` updated.

Step 8 as built:
- `web/src/lib/repo/` holds `GameRepository` (types.ts), `RemoteRepo` and `LocalRepo`. `reportMatch` already returns `applied | pending`, so duo reports (Phase 4) fit without changing callers; Snatch Steal will be one more `claimReward` kind.
- `AuthContext` (user, loading, refresh) picks the repo. Phase 5 adds sign-in and sign-out to it.
- `ProgressionContext` exposes `series` / `me` and async commands; refusals are `RepoError`s that pages show with `alertRepoError`.
- Until Phase 5's campaign menu, the existing save list is the series picker (signed in, it lists server series).
- Guests keep free pack opening (any count, earlier sets), now through `LocalRepo`. A won match books a wheel spin that can be spun later from Rewards (`/record-match?spin=<id>`), for guests too.
- Reward-claim rules live in `@ygo/shared` `claims.ts`, used by the server and `LocalRepo`.
- Server additions: `DELETE /api/series/:id` (solo), `GET …/packs/active?kind=set|reward`, an empty collection replace clears it, and `GET /api/auth/me` answers `{ user: null }` for guests instead of 401.
- `npm run test-server -w @ygo/api` copies the card data (read-only) from api/.env's database. `web/scripts/drivers/pack-session.mjs` covers create, open, reload-resume, save, the once-per-set refusal, and win → server spin.

Merged into `main` on 2026-11-04 after the user tested it by hand; not pushed.

### Phase 5: Duelist Kingdom onboarding (done 2026-11-04, branch `feat/duelist-kingdom-onboarding`)
Moved ahead of Phase 4 by the user (2026-11-04): signing in and out from the menu matters for all further testing.
- First version: the account flows in the menu's left column. The user found its art and motion too plain and wanted the onboarding as its own scene, so it was rebuilt as described under "Duelist Kingdom onboarding" above.
- Menu items follow the account: CAMPAIGN MODE / CARD COLLECTION / OPTIONS, then signed in DEV MODE (admins; a disabled "Coming soon" placeholder while 3b is skipped) / SIGN OUT, or for guests SIGN IN, then EXIT GAME. SIGN OUT and EXIT GAME return to the title screen.
- `/onboarding`, the stored `duelistName` and `/dev/auth` are gone. Guests are named "Guest" in the nav.
- The "import local saves" step waits for Phase 6.
- `auth.mjs` drives all of it through the title screen (31 checks); `smoke.mjs` covers the guest path and EXIT GAME.
- Visual makeover of the rest of the app: done with Phase 7 (mobile redesign), since both touch every screen. The first piece, physics chains between timeline packs, is on `feat/physics-chain` and merges with that work.

Merged into `main` on 2026-11-04 after the user's go-ahead; not pushed. Phase 3b was skipped at the same time, so Phase 4 is next.

Decided with the user (2026-11-04):
- Snatch Steal is left off the wheel in solo series; there's no rival to steal from. The wheel the server spins depends on the series mode (step 5).
- A saved position keeps the set's name as well as its index, on series (server) and guest saves (web), and the name wins when the two disagree. Guest saves written before this are translated once using the old date-only order, so they stay on the set they meant.
- The 50-series cap is per player (how many runs one account can have), a guard against scripted creation; reads aren't limited beyond the normal rate limit.

### Phase 4: duo series (built 2026-11-05, branch `feat/duo-series`)
Small commits, each tested:
1. **Notifications**: stored in `notifications` (kept 60 days) and pushed live over a WebSocket at `/api/notifications/live` (`@fastify/websocket`; session cookie, and the `Origin` check now covers upgrades). `GET /api/notifications`, `POST /api/notifications/read`. Sending happens in the background after the change commits, so a failed notification never fails the move.
2. **Duo series and invites**: `POST /api/series` takes `mode: 'duo'`; the series waits (`awaiting_rival`) until the rival joins. The owner invites by duelist name (the rival gets a notification) or gets a link code (`/join?code=`, stored hashed). A new invite of either kind replaces the old one; invites expire after 14 days. `/api/invites` lists, previews (no sign-in needed for a link), accepts and declines. Series now show their members by name.
3. **Results**: in duo, `POST /matches` creates a pending report (one per series, enforced by a unique index) and tells the rival; the rival confirms (the set advances, the winner gets a wheel spin and the loser pity packs, in one transaction) or rejects (either player reports again). Reporting needs both players' openings saved for the current set, with separate messages for "you" and "your rival". `GET /series/:id` adds `pendingReport` and `openingsSaved`.
4. **Snatch Steal**: `GET /rival-binder` (only while holding an unclaimed Snatch Steal) and a claim by printing (`id_setCode_rarity`) that moves one copy in a transaction. The rival is told about steals and about bans or unbans on the shared banlist.
5. **Leaving**: deleting a duo series leaves it. The leaver's cards and openings go, a pending report is voided, the series pauses for the rival (who is told), and it's deleted once nobody is left.
6. **Web**: plain and functional until the UI do-over. Duo mode and an optional rival name in the new-series form, the invite link to copy, invites at the top of the series list, duo status lines, `/join` (signed out, the code is kept through sign-in and the menu brings the player back), a bell in the nav with live notifications, the pending-result panel on Record Match (wait, or confirm/reject), and the Snatch Steal binder picker on Rewards. `NotificationsContext` refreshes the active series when a rival's move arrives.

Verified: lint, typecheck, 112 API + 34 web tests, both builds, and the drivers: `duo.mjs` (18 checks, two browsers: invite by name and by link, live bell, the saved-packs gate, confirm, rewards, Snatch Steal, leaving), `auth.mjs`, `pack-session.mjs`, `smoke.mjs` and the reward drivers. The test API gained `POST /__test/reward` so drivers can claim prizes the wheel only gives at random.

Not covered yet: a collection import prompt on joining (the Collection page's import already allows one import in a duo series that skips early sets), and two real players on two machines. That needs the Render deploy, plus the Google app out of Testing mode for Google sign-in.

Changes after the user's review (2026-11-05):
- The bell's list also closes on a click outside it, or Escape.
- SIGN OUT stays on the menu, which then offers SIGN IN; EXIT GAME goes to the title screen.
- DEV MODE is gone from the menu while 3b is skipped.
- A stolen card may stay in the rival's saved decks: what matters is that the thief gains it.

Merged into `main` on 2026-11-05; not pushed. Real two-player testing waits for the deploy.

### Phase 6: guests and import (built 2026-11-05, branch `feat/guest-and-import`)
- Guest mode under the new context was already done in Phase 3 (`LocalRepo`); nothing more was needed.
- `POST /api/series/import` moves one guest save into the account as a solo series flagged `legacy`. The server places it on today's timeline by set name, leaves cards outside its catalog behind (and says how many), gives rewards fresh ids, and keeps the binder, decks, banlist, rewards and match history. Each save moves in once: a unique index on (owner, save id) makes a second try return the series it already became.
- "One-time import" is per save, not per account: a save moves rather than copies, leaving the browser once it's in the account. So there's nothing to import twice, and saves from another device can still come in.
- Web: the sign-up letter offers the device's guest saves (ticked by default) before ENTER THE KINGDOM; the Campaign list offers any that are left to a signed-in player (covering password and Google sign-in), with NOT NOW for the session.
- `pack_opening_rules.md` (internal notes, taken from the site it came from) lost its "Reporting Incorrect Ratios" section with the stray `admin@ygoprog.com` line. Root and web READMEs are brought up to date (accounts, duo series, routes, contexts; `/dev/auth` is gone).
- After the user's review (2026-11-05): Snatch Steal now copies the card (the rival keeps theirs), and the menu footer reads "VERSION 0.6 ALPHA" (a placeholder until the UI do-over). The menu's SIGN IN opens a plain sign-in box (with Google and forgot password) in the menu itself instead of going to the title screen; EXIT GAME is now BACK TO TITLE, the way to the onboarding and sign-up.
- Also fixed: a shared test still expected duo series to be refused (stale since Phase 4, fixed on `main`), and `pack-session.mjs` could log an aborted set-list fetch when it left the timeline too early.

Verified: lint, typecheck, 53 shared + 115 API + 34 web tests, and the drivers: `guest-import.mjs` (13 checks: the letter, the Campaign offer with NOT NOW, set placement by name, unknown cards dropped, decks and history kept, the saves leaving the browser), `auth.mjs`, `duo.mjs`, `pack-session.mjs`, `smoke.mjs` and the reward drivers.

### Release plan (decided 2026-11-05)
After Phase 6, the app is deployed to Render as **0.6 alpha**, before Phase 7's mobile redesign and UI do-over. The user and a friend test the duo flow on two machines there.

Prepared 2026-11-05 (branch `chore/alpha-deploy`, merged into `main`):
- `render.yaml` asks for `PUBLIC_URL`, the Google and SMTP settings as well as `MONGODB_URI`.
- A local rehearsal of the Render build (production mode, one origin, the real CSP) found that Yugipedia now redirects pack art from `ms.yugipedia.com` to `img.yugipedia.com`, which the CSP blocked. Fixed: the CSP allows both and the art list points at `img.` directly. `smoke.mjs` then passed against the production build.
- The deployed service uses the same Atlas database as local development, so existing accounts (HorizonDev) and card data carry over.
- GitHub Pages keeps deploying on each push until Render is verified; signed-out guest play still works there, accounts don't.

Steps for the user: Atlas network access `0.0.0.0/0`; push `main`; Render → New → Blueprint on this repo; fill the env vars (`PUBLIC_URL` = the service's URL); add `<PUBLIC_URL>/api/auth/google/callback` to the Google OAuth client; add the friend as a Google test user (or they sign up with email).

Deployed 2026-11-05 at https://ygo-progression.onrender.com. `smoke.mjs` against it found pages loading blank after a prefetch: Next 16 prefetches each linked page with `Range: bytes=0-63`, Render's Cloudflare compressed the 206, and Chrome cached that as the whole page. The static server now ignores ranges (`acceptRanges: false`). The GitHub Pages site was replaced by a note linking to Render (`pages-note/`, also served as its 404 page), and CI runs on `main` by itself.

### Phase 7: audit (2026-11-05, branch `feat/mobile-redesign`)
The user's brief: every screen should feel like a game; fix the fonts and the generic effects; the rewards screen gets a full redesign; the pack opener gets a do-over (the user picks from options); hunt deck builder bugs, keeping its careful layout.

Fixed first, on their own branches off `main`:
- Pack opener: a card sometimes flipped face up and back down at the start of a pack, showing the last pack's card. Cards were keyed by card id and slot, so a card repeated in the same slot reused the face-up element. They're now keyed by pack (`fix/pack-card-flash`, merged).
- Deck builder: quick drops sometimes don't land (user report). Not reproduced: Playwright's drags (`deck-builder-drops.mjs`, centres, slot boundaries, gaps and corners, released on arrival, CPU slowed 8×) all land, but Playwright fires drag events in strict order, so it can't produce a real-input race. Found instead: a deck card dropped on the main grid's 1px border is deleted (it counts as a drag-out). The deck builder runs on native HTML5 drag-and-drop, which is unreliable for quick drops on Windows and doesn't work on touch at all, so Phase 7 needs pointer-event dragging there anyway (same look, same preview).

Audit, from `screens.mjs` (every screen at 1440×900 and 390×844):
- Fonts: the body is Arial, parchment buttons are Times New Roman, and Inter, Outfit, Russo One, Cinzel, IM Fell, a script and a comic face are all in use, plus 13 monospace spots (dates, IDs, the rewards subtitle). Headings are plain heavy sans with drop shadows.
- Generic effects: white hover overlays, plain drop shadows and the same gold-ticket button everywhere; nothing reacts like a game (no press, glow or sound).
- Phone: the deck builder is the desktop board scaled to 390px, unreadable and undraggable. The pack opener's title wraps one word per line over the Back/Open All buttons and the cards overlap. Rewards truncates every name ("Wh…"). The GuideSprite covers buttons on the timeline, rewards and record-match screens.
- Desktop: the collection and rewards screens are lists on parchment with no sense of reward; the pack summary is a plain grid with no rarity moment.

Pack opener direction (decided 2026-11-05, from the prototypes in `web/scripts/prototypes/pack-opener/`, published as a private claude.ai page): on phones, tear the pack by swiping its top strip (A), then the cards spiral out of the torn pack into a carousel you swipe through and tap to reveal (C's ring, without the altar). On desktop, the duel table (B): cards dealt onto a mat, tap to flip, the rare gets a dimmed close-up beat. Shared: the rare's back glows its rarity colour first, foil and glare on revealed rares, the whole pack laid out at the end. Still to settle with the user: card hover and card details during and after the reveal.

Card details in the opener (prototyped 2026-11-05, for the user to review): on desktop, resting the mouse on a face-up card lifts it and opens a details panel beside it after 200 ms (as the current tooltip does). Clicking a face-up card, or tapping it on a phone, flies it up into a close-up: details beside it on desktop, in a bottom sheet on phones. This replaces the current detail modal. Details show name, rarity, set code, attribute, type, level, ATK/DEF, card text, and either NEW (first copy) or the count you now own; NEW cards also carry a ribbon on their face.

Card details restyled (2026-11-05, user request): the hover panel and close-up now look like the card itself, with a frame in the card type's colour, a name plate (silver lettering for Rares, gold for Ultras, as printed), the attribute disc, level stars and a parchment text box.

Timeline prototype (2026-11-05, `web/scripts/prototypes/timeline/`, its own private claude.ai page). It is the first screen of the do-over, in the order the user set: timeline, then the pack screen, pack details and the opened-packs overview, then the collection. It covers:
- The new app bar, with avatar, series and the bell, plus a bottom tab bar on phones.
- The road of packs: cleared sets carry WON or LOST wax seals, the current set is spotlit, and later sets are dark, chained and padlocked. The chain is a placeholder for `feat/physics-chain`.
- A history track with year markers, filled to the current set.
- Stage objectives replacing the floating buttons: open packs, prepare deck, duel and record, with done, next and waiting-on-rival states.
- A record panel with the rival in duo mode.
- Yugi in his own corner with a contextual tip; on smaller screens he becomes a portrait beside the tip.

Timeline feedback (user, 2026-11-05): the first prototype replaced the app's look with generic dark panels and buttons, and the user rejected that. The do-over stays loyal to the source assets and improves them in place, as the physics chain does for the chain: the hieroglyph wall, the gold `FrameButton`, the painted scoreboard (`stats_panel_cropped.png`, styled with care), the full Yugi sprite with its moods and the speech bubble. The guide giving step-by-step direction is good and becomes a general pattern, but through the full Yugi sprite, never cropped, not a small avatar. Pack spacing must be even. Replacing the wall or the buttons with better-quality versions is allowed, and outside assets can be looked up as needed.

Timeline options on the original assets (same page):
- A, faithful: today's layout with even gaps (a fixed slot per pack, the current one larger by height rather than a transform), the physics chain ported from `feat/physics-chain`, a padlock on locked sets, and Yugi with a tip that changes mood and words with the stage.
- B, steps on the buttons: Open Packs, Prepare Deck and Record Match become numbered steps on the same frame buttons, with done ticks, notes underneath, a pulse on the next step and a waiting state in duo.
- C, B plus living assets: the wall at full sharpness under flickering torchlight, a gold glint across the frame buttons on hover with a pressed state, glowing scoreboard gems, and WON/LOST as inked stamps.
A wall photo that's sharper than `bg-stone.png` (1024 px) is still to find: candidates on Wikimedia Commons had stray labels or the wrong mood.

Timeline decision (user, 2026-11-05): option C's living assets on option A's faithful layout, without B's steps. Chain feedback: it must visibly connect pack to pack, and when a set is finished its chain straightens and glows. The prototype now sizes each chain to the real gap between pack arts, with the ends tucked under them. Finished chains hang taut and gold with a soft pulse. Finishing a set (the "Victory confirmed" state) turns the next chain gold, pulls it straight with a flare, and breaks the next set's padlock. For `feat/physics-chain`: take the pins from the neighbouring arts and animate the slack to 1.0 on finish. Asset generation with Google's Nano Banana image model is being set up with the user.

Fixes on `main` (2026-11-05, pushed):
- Phone loading (`fix/phone-loading`): pack art is now served as 480 px WebP copies in `web/public/packs` (made by `scripts/images/pack-art.mjs`) instead of Yugipedia's full-size PNGs. The wall, scoreboard, texture and sprites are WebP. Build files are cached for a year and images for a week, and pages revalidate. A warm base sits under the wall and pack frames shimmer while loading. On a simulated 4G phone the timeline went from 23.8 MB and 21.7 s to the current pack to 3.0 MB and 2.5 s.
- Envelope seal: the five-pointed star became the Seal of Orichalcos shape, a unicursal hexagram in a ring of rune marks (corrected after the user pointed out a first, two-triangle version).

Phase 7 order and guide (user, 2026-11-05): first make every page look good on desktop and phone (timeline, pack screen, pack details, opened-packs overview, collection, then the rest). The Yugi walkthrough details come after that. Direction for the guide: today's `GuideSprite` is fixed-position and overlaps the page; it becomes a character who slides in from the left edge when the game has something to say, like old games, overlays briefly with the speech bubble, then leaves. The buttons should get a higher-quality version of the same gold frame.

Buttons (user, 2026-11-05): option A, the gold cartouche made with Nano Banana 2, becomes the app's button. Each button is one whole painted image, never sliced. The Gemini remaster of today's square button is kept as a future alternative for a visual-options setting. Sources live in `web/scripts/prototypes/buttons/src` (gitignored), and `cutout.mjs` removes the magenta background.

Phone (user, 2026-11-05): the app is unusable on a phone. Before this round of the timeline is finished, it must work at phone size. Phone layout options are being prototyped.

Phone timeline (user, 2026-11-05): the Road layout. Sets zigzag down a vertical path joined by the same physics chain as desktop: taut, glowing gold up to the current set and sagging iron beyond. The top bar gets a gold meander trim and Yugi's portrait, with the painted scoreboard hanging from its right edge. Cartouche buttons are smaller on the phone (two side by side, at most 142 px each) above the tab bar.

Next steps (user, 2026-11-06): finish the do-over with a desktop top bar and a phone tab bar in the phone bar's lacquer style (prototype options first), then the guide.
- Yugi's look: on phones he takes too much room (mid-screen, a big bubble, a random line on every page); on desktop he looks clunky (a white comic bubble that ignores the stone and gold look, floating with nothing under him). Prototype fixes for both.
- Desktop layout rule: no element moves to make room for Yugi, so a page looks right when he's away. He overlays briefly and leaves.
- Phone: Yugi always slides in to speak, smaller and lower than today. The random "hello" on every page goes.
- Guide logic: screens send events (pack details opened, card viewed, pack finished, match won or lost). A queue with priority and cooldowns keeps him from talking too much, and he never repeats a line.
- Lines are written ahead of time and kept in the repo, not generated live. Solo and duo have their own lines (duo can mention the rival).
- What he says: per-set notes (what the set adds to the game, cards to look out for, one-line tips on key cards as you view them), comments worked out from your pulls (a watch-list card, a third copy, synergy with what you own, a banlist card, an empty pack) and reactions to wins and losses. Each line stays under about 140 characters. Written for the first 8–10 sets first, to settle the tone, then era by era.
- Pack details is `SetCardList` (already in the new look). `PackDetails.tsx` is unused and goes.
- To do (user, 2026-11-06): look for other dead components like `PackDetails.tsx` (files nothing imports, exports nothing uses) and remove them.

Guide look and lines (user, 2026-11-06): the stone tablet (option C of `web/scripts/prototypes/guide/`), with all three moods cropped to one shared frame. The lines must:
- Sound like Yugi talking to a friend, not like an AI reading out card facts: short, warm, in his voice.
- Be accurate to what both duelists can have at that point in the series, which is the sets unlocked so far, not the whole game. Example from the user: Monster Reborn isn't in these early sets, so warning that the opponent might Reborn something is wrong. Uraby's 1500 ATK is the second best in its set, which matters because there are no strong common spells or traps yet.
- So comparisons ("second strongest", "no answer to it yet") are worked out from the real card pool in the app's data, never from memory. Every card a hand-written line names is checked by a script against the pool for that stage.

Tweaks queued (user, 2026-11-06), each on its own branch off `main`:
1. **Mark to view later** (`feat/look-later`). In the opener (and the haul), a card can be marked to look at later. Marked cards carry a small bookmark in the collection binder and the deck builder's card pool. The mark clears by itself once the card's details are opened in either screen, and can be switched on or off by hand in the details panel of every screen. Stored per player and series: `marks: string[]` (collection keys) on `PlayerView`, with a `setMark(id, key, on)` repo call in `LocalRepo` and `RemoteRepo`, and a small server route that only accepts keys the player owns.
2. **Flip commons in place on the phone ring** (`fix/ring-tap-flip`). Today a tap on a side card spins it to the front and a second tap flips it (`engine.ts`, the ring's `pointerup`). A face-down common now flips where it is on the first tap. Rares and better (the glowing backs) keep the spin to the front and the reveal beat. A face-up card off-centre still spins to the front, so it can be inspected.
3. **Swipe between sections on phones** (`feat/phone-swipe-nav`). A horizontal swipe on a page goes to the neighbouring tab, in tab bar order (Campaign, Collection, Deck Builder, Rewards, Menu), with a short slide. It ignores swipes that start on surfaces with their own gestures (the pack ring, binder pages, the rewards altar, card close-ups, sheets, the deck builder's drags, scrolling rows), mostly vertical moves, and short ones. Locked tabs (no save picked) are skipped.

Guide, finished (user, 2026-11-07, branch `feat/guide-more`):
- What Yugi judges cards by is deck-building theory of the era, not ATK rankings. Computed "strongest / second strongest" lines are gone: a monster that tournaments didn't play wasn't good, whatever its ATK. He only talks about cards in the notes: staples, the beatsticks tournaments played, and cards he remembers from his, Kaiba's and Joey's duels (memories, which never expire).
- A card's worth depends on where the series is (user: "Fissure is great on set one, not on set 20"), so a note can carry `until` (a set code): past it he says nothing about that card. `timeline.json` (from `build.mjs`) places the set codes.
- Repeats: silent, unless more copies make a deck better (`_multiples`: want, why, until). The app allows 3 of any card, so cards limited to 1 in real tournaments (Pot of Greed, Raigeki, Monster Reborn, Change of Heart) are worth acknowledging on a second or third copy.
- Sources read: YGOPRODeck's "History of the Meta" parts 1 and 2. Pojo and Yugipedia refused automated fetches, so no historic limited lists were used.
- Notes now cover the first ten sets (LOB to IOC). Later sets have no notes yet: he stays quiet there except for timeless notes on reprinted cards.
- Yugi now speaks inside the pity and tournament pack chamber on Rewards. On phones a tap anywhere on the page moves him along, so his strip never blocks the bottom buttons for long.
- `scripts/guide/simulate.ts` prints what he'd say over real openings, for review. Short Print rates are left alone (user).

Tweaks done (2026-11-07):
- `fix/ring-tap-flip`: on the phone ring a tap flips a face-down common where it is; rares and better still turn to the front for their reveal.
- `feat/phone-swipe-nav`: a swipe across a tab's page goes to the neighbouring tab, sliding in from that side. Surfaces with their own gestures are left alone. The binder passes a swipe through only past its first or last page, since on phones the whole collection is the binder.
- `feat/look-later`: marks to look at later. Stored per player and series as card ids (`marks` on the player doc, `PUT|DELETE /api/series/:id/marks/:cardId`, at most 500; guests keep them on the save, and the guest import carries them). Any real card can be marked, since marking happens before an opening is saved. A toggle sits in the opener's close-up, every card close-up, and the deck builder's details. A gold bookmark shows on marked cards in the binder and the deck builder's card lists. Opening the card's details in the collection or the phone deck builder clears the mark, as does resting on it for 1.2 s in the desktop deck builder; it can be switched back on there and stays.
