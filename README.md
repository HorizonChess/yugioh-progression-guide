# Yu-Gi-Oh! Progression Guide

A web app for playing a Yu-Gi-Oh! "progression series": you start in 2002 with the
first booster set, open packs, build a deck from what you pulled, and unlock each
new set in release order by winning duels.

**Live app:** https://horizonchess.github.io/yugioh-progression-guide/

## Features

- **Pack opening** with historically accurate pull rates for 8+ eras of sets, from
  *Legend of Blue Eyes White Dragon* onward. Ratios were researched from community
  data and unboxings, then turned into a fair "hat" draw.
- **Deck builder** with drag and drop, main, extra and side decks, card search and
  filters, and `.ydk` import/export for use in EDOPro or DuelingBook.
- **Campaign map and timeline** that track which set you are on and your match history.
- **Rewards**: a prize wheel after a win, and "pity packs" after a loss.
- **Save slots** stored in the browser, so several runs can exist side by side.
- A custom stone-and-parchment design with an animated guide character.

## Tech stack

| Area | Tools |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| Server (in progress) | Fastify and MongoDB Atlas, with game rules shared with the app in `shared/` |
| Data | [YGOPRODeck API](https://ygoprodeck.com/api-guide/) for cards and sets, localStorage for saves |
| Images | Cloudflare R2, with Node and Python scripts to fetch, crop and optimise artwork |
| Testing | Jest and React Testing Library (web), Vitest (shared, api), Playwright drivers |
| Hosting | GitHub Pages (static export), deployed by GitHub Actions on every push to `main`; moving to one Render service (`render.yaml`) |

## Running it locally

The repo is an npm workspace (`shared/`, `api/`, `web/`), so install once from the root:

```bash
npm install            # every workspace
npm run dev -w web     # the app at http://localhost:3000
npm test               # every workspace's tests
```

The server needs a MongoDB connection string. Copy `api/.env.example` to
`api/.env` (gitignored) and fill it in, then:

```bash
npm run sync-cards -w @ygo/api   # mirror YGOPRODeck sets and cards into MongoDB
npm run dev -w @ygo/api          # the API at http://localhost:4000
```

More detail on the architecture, pack logic and design system is in
[web/README.md](web/README.md) and
[web/src/data/pack_opening_rules.md](web/src/data/pack_opening_rules.md).

_Yu-Gi-Oh! is a trademark of Konami. This is a non-commercial fan project._
