# Browser drivers

Reusable [Playwright](https://playwright.dev) scripts that exercise real app
flows end-to-end — seed a save into `localStorage`, drive the UI, assert
behaviour, and screenshot. They verify changes in the actual browser, beyond
`tsc`/`lint`.

## Running

Start a dev server first, then run from the `web/` directory:

```sh
npm run dev            # serves http://localhost:3000
node scripts/drivers/rewards-ban-claimed.mjs
```

Override the base URL with `APP_BASE` (e.g. a preview deploy):

```sh
APP_BASE=http://localhost:3001 node scripts/drivers/rewards-packs.mjs
```

No Playwright browser downloaded? Use an installed one with `PW_CHANNEL=chrome`.

Screenshots are written to `scripts/drivers/out/` (gitignored). Console output
reports the assertions each driver checks.

## Files

- `_lib.mjs` — shared helpers: `launchSeeded`, `makeSave`/`reward`, `readSave`,
  `outPath`, `STORE_KEY`.
- `smoke.mjs` — every route renders without errors, nav highlighting, removed
  routes 404, the root/onboarding redirect, deck-builder add/drag/remove, and a
  partial save loading with defaults.
- `rewards-packs.mjs` — the 3-pack reveal for tournament (single-row slab) vs.
  core/pity (5+4 two-row).
- `rewards-ban-claimed.mjs` — ban search timeline filtering, confirm-in-details
  flow, and claimed-ledger card thumbnails.
- `rewards-starlight.mjs` — Starlight full-catalog search (date-gated to cards
  released before the won pack), confirm-in-details, and the granted card landing
  in the collection at Starlight Rare.

- `auth.mjs` — accounts end to end: sign-up with the live name check, the
  confirmation and password-reset email links, sign in by name and by email, and
  bad-link handling. Needs the in-memory test API and a web dev server pointed at
  it (see the header of the script, or `npm run test-server -w @ygo/api`); it does
  not touch your real database and sends no email. Google sign-in needs a real
  Google account, so the API tests cover it with a fake instead.
- `pack-session.mjs` — a server series: open, resume after a reload, save, the
  once-per-set refusal, and a win spun on the server. Same test API as `auth.mjs`.
- `duo.mjs` — two players in two browsers: invite by name and by link (opened
  signed out, then signed in), live notifications in the bell, the rival
  confirming a result, Snatch Steal, and leaving. Same test API as `auth.mjs`.
- `guest-import.mjs` — guest saves moving into an account: brought along on the
  sign-up letter, or moved later from the Campaign list (after "Not now"); they
  land as solo series placed by set name and leave the browser. Same test API as
  `auth.mjs`.

Extend these rather than writing throwaway drivers. Keep the scripts checked in;
keep generated images out of git.
