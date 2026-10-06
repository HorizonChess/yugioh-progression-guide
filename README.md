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
| Data | [YGOPRODeck API](https://ygoprodeck.com/api-guide/) for cards and sets, localStorage for saves |
| Images | Cloudflare R2, with Node and Python scripts to fetch, crop and optimise artwork |
| Testing | Jest and React Testing Library |
| Hosting | GitHub Pages (static export), deployed by GitHub Actions on every push to `main` |

## Running it locally

```bash
cd web
npm install
npm run dev     # http://localhost:3000
npm test        # unit and component tests
```

More detail on the architecture, pack logic and design system is in
[web/README.md](web/README.md) and
[web/src/data/pack_opening_rules.md](web/src/data/pack_opening_rules.md).

_Yu-Gi-Oh! is a trademark of Konami. This is a non-commercial fan project._
