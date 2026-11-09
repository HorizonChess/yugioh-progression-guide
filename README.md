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
- **Accounts** (email and password, or Google), signed up on a Duelist Kingdom
  invitation letter. Signed in, every series lives on the server, which rolls the
  packs, spins the wheel and checks each reward, so the rules can't be bent.
- **Duo series**: invite a rival by duelist name or link. You share the set
  progression and banlist, each result waits for the rival to confirm, Snatch
  Steal copies a card from their binder, and a bell shows their moves live.
- **Guest play** with saves stored in the browser. Signing up (or in) offers to
  move them into the account.
- A custom stone-and-parchment design with an animated guide character.

## Tech stack

| Area | Tools |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| Server | Fastify and MongoDB Atlas (transactions), live notifications over a WebSocket, game rules shared with the app in `shared/` |
| Data | [YGOPRODeck API](https://ygoprodeck.com/api-guide/) for cards and sets (mirrored into MongoDB for the server), localStorage for guest saves |
| Images | Cloudflare R2, with Node and Python scripts to fetch, crop and optimise artwork |
| Testing | Jest and React Testing Library (web), Vitest (shared, api), Playwright drivers |
| Hosting | GitHub Pages (static export), deployed by GitHub Actions on every push to `main`; moving to one Render service (`render.yaml`) for the 0.6 alpha |

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

The title screen at `/` is where you sign up or sign in (or play as a guest).
Google sign-in and outgoing email are optional and switched on by the `GOOGLE_*`
and `SMTP_*` settings in `api/.env.example`. Mail goes over Gmail SMTP; where the
host blocks the mail ports (Render's free plan does), it falls back to the same
Gmail account through the Gmail API over HTTPS, once `GMAIL_REFRESH_TOKEN` is set
(`npm run gmail-token -w @ygo/api` gets it). Any email that can't be sent is
logged as `email not sent`. Admins can open any set's packs; to
make yourself one, sign up, then:

```bash
npm run promote-admin -w @ygo/api -- <your email or duelist name>
```

To try it in a browser without touching your real database or sending any
email, run the API on a throwaway in-memory database with captured mail (it
copies the card data from `api/.env`'s database), then the web app pointed at it.
Two browser windows (one private) make two players for a duo series.

```bash
npm run test-server -w @ygo/api                                   # http://localhost:4100
NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web      # then open http://localhost:3000
```

The Playwright drivers in [web/scripts/drivers/](web/scripts/drivers/README.md)
drive these flows end to end against that setup.

## One id per card

A card can reach the app under several ids: YGOPRODeck answers the same card under
different ids depending on the query, gives alternate artworks ids of their own, and
its main id isn't always the official passcode. Everything the app keeps or compares
(collections, decks, bans, marks, rewards, pack pulls, duels) uses **one id per card:
the duel engine's passcode, the official Konami one**. `shared/src/card-ids.json` maps
every other id onto it, and `canonicalCardId` and friends in
[shared/src/card-ids.ts](shared/src/card-ids.ts) apply it where ids enter the app:
YGOPRODeck responses (`web/src/lib/api.ts`, `api/src/cards/sync.ts`), request bodies
(`CardIdSchema`), YDK files and browser saves. The server moves stored data onto the
one ids at startup whenever the table changes. A card the rules treat as another
(Harpie Lady 1 is "always treated as Harpie Lady") is still its own card and id.

Rebuild the table after updating the engine data or when YGOPRODeck adds cards:

```bash
npm run fetch-engine -w @ygo/api
npx tsx api/scripts/build-card-ids.ts
```

More detail on the architecture, pack logic and design system is in
[web/README.md](web/README.md) and
[web/src/data/pack_opening_rules.md](web/src/data/pack_opening_rules.md).

_Yu-Gi-Oh! is a trademark of Konami. This is a non-commercial fan project._
