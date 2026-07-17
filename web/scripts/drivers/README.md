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

Screenshots are written to `scripts/drivers/out/` (gitignored). Console output
reports the assertions each driver checks.

## Files

- `_lib.mjs` — shared helpers: `launchSeeded`, `makeSave`/`reward`, `readSave`,
  `outPath`, `STORE_KEY`.
- `rewards-packs.mjs` — the 3-pack reveal for tournament (single-row slab) vs.
  core/pity (5+4 two-row).
- `rewards-ban-claimed.mjs` — ban search timeline filtering, confirm-in-details
  flow, and claimed-ledger card thumbnails.

Extend these rather than writing throwaway drivers. Keep the scripts checked in;
keep generated images out of git.
