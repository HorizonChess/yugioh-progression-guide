# Duel engine prototype

EDOPro's rules engine (`ocgcore`, AGPL-3.0) running in Node as WebAssembly through
[`ocgcore-wasm`](https://github.com/n1xx1/ocgcore-wasm) (MIT wrapper), playing headless duels
between two 40-card *Legend of Blue Eyes White Dragon* decks. A simple bot answers every
question the engine asks. This is a throwaway check, not app code.

## Run it

The card scripts and card database are downloaded into `vendor/` (gitignored, never edited):

```bash
cd duel-spike
npm install
git clone --depth 1 https://github.com/ProjectIgnis/CardScripts.git vendor/scripts
curl -L -o vendor/cards.cdb https://github.com/ProjectIgnis/BabelCDB/raw/master/cards.cdb
node src/duel.mjs            # one duel told turn by turn, then the checks
node src/duel.mjs --log      # the whole first duel, and any engine errors
node src/duel.mjs --mode goat   # mr1 (default), goat or mr5
```

(The prototype used a sparse copy of CardScripts: the root `*.lua` files plus `official/` for
the 17 cards in the decks. A full clone works the same.)

## What it showed (7 November 2026, Windows laptop, Node 24)

| Check | Result |
| --- | --- |
| Card scripts | Trap Hole, Fissure, Dark Hole, Raigeki, Monster Reborn, Yami, Dragon Capture Jar, Reinforcements and Man-Eater Bug all ran; 0 engine errors |
| Rules | Trap Hole only on 1000+ ATK, one Field Spell at a time, chains resolve last link first, battle damage, the first player draws on turn 1 under Master Rule 1 |
| Speed | about 26 ms of CPU for a whole duel (300-800 questions), under 0.1 ms per question |
| Memory | about 70 MB for the process, about 1.3 MB per open duel |
| Determinism | replaying the seed and the recorded answers reproduces every engine message exactly |

## What the app must do itself (learned here)

- **Load the rule library into each duel:** `constant.lua` then `utility.lua` (which loads the
  rest). Without them every card script fails.
- **Shuffle the decks:** the engine keeps the order it's given. Shuffle from the duel's seed
  so a replay deals the same cards.
- **Era rules:** `MODE_MR1` covers the early sets. The script repo also has `goat/` (191) and
  `pre-errata/` (68) versions of cards for older formats, with their own passcodes.
- **Licence:** the engine and the scripts are AGPL-3.0. A server that runs them for players
  must offer its source under AGPL-compatible terms.

## Next

Run the engine in `api/` behind the existing WebSocket: one duel per live match, each answer
validated and stored (seed + answers) in Mongo, each player sent only what they may see. Then
drive `web/src/components/duel/DuelBoard.tsx` from the engine's messages instead of its script.
