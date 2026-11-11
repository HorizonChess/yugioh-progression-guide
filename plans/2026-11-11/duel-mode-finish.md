# Finishing duel mode

## Context

Duels run on EDOPro's rules engine (`api/src/duel`) and play on phone and desktop boards
(`web/src/components/duel`). Bot practice, solo testing, rival duels (booked on the series like a
confirmed report), reconnects and chains all work. The user's list (2026-11-11):

1. Sounds are still generic ("ding"). They should be on theme.
2. The bot has rough edges, and it seemed to know hidden cards.
3. The bot becomes a campaign opponent: it opens its own packs fairly and builds decks from its collection.
4. The board doesn't yet handle every strange card situation the engine does (milling, face-down
   banishing, the Graveyard always viewable, zones taken away as by Ojama Trio, and more).
5. The top bar says "Duo"; it should name the rival.

Done on 2026-11-11:
- 5: the top bar reads "Stage 3 · vs Kaiba" (`feat/top-bar-rival`).
- 2, first part (`fix/bot-hidden-info`): the bot read the rival's face-down monsters from the engine
  when choosing attacks, targets and wipes. It now treats them as unknown, guessed at 1400. A test
  pins it: facing a set 2000-DEF Mystical Elf with 1900-ATK monsters, it attacks. It never read
  the rival's hand, deck or set Spells and Traps.

## 1. Sounds (decided 2026-11-11: real foley plus themed stingers)

Today every sound is synthesized live with Web Audio (`duel/sfx.ts`, `packs/stage/fx.ts`).
- **Physical moves** (draw, deal, slide onto a zone, flip, shuffle, coin, dice) use recorded CC0
  card foley, for example Kenney's free audio packs. The user is asked before each download
  (file name, source, size). Files go in `web/public/sfx/` as small OGG/MP3 files, preloaded
  after the first touch.
- **Themed stingers** for the big moments: a stone grind when a card is placed, a Millennium
  chime on summon, a low horn at duel start, and a sand rush on destroy. They come from a CC0
  source, or are generated if none fits.
- `sfx.ts` keeps its API (`Sfx.summon()` and so on), so callers don't change. A synthesized
  fallback remains for any file that hasn't loaded yet.

## 2. The bot: rough edges

- Hidden information: done (above).
- Still to do: it ignores the rival's set Spells and Traps entirely. A player would weigh "two
  set cards" before attacking with their best monster. It always says yes to optional effects
  and names Dark Magician for every "declare a card". It answers `ANNOUNCE_NUMBER` with 0.
  Each gets a rule of thumb and a test, as in `test/duel-bot-judgement.test.ts`.

## 3. The bot as a campaign opponent (decided 2026-11-11)

**Shape.** Choosing **Duo** in New Game asks: play against the bot, or invite someone.
- **Invite**: duo as today. The bot pulls nothing and the run waits for the invited player.
- **Vs bot**: a duo run whose second seat is the bot. "Record Match" becomes **Play Duel**: the
  result is recorded automatically when the in-app duel ends, with no manual report or confirmation.

**Fairness.** The bot opens the same number of packs per set as the player, on the server, with
the same pack rules and RNG as a player's opening (`shared/src/pack-logic.ts`). The player never
sees it, but it's stored like a player's collection, so it can be checked. It gets the same
rewards a duo rival would (wheel spins, pity packs), claimed by rule of thumb.

**Deck building** (new, `api/src/duel/deckbuilder.ts`): from its collection only, within the
banlist and 3 copies. A first version:
- 40 cards: about 18-20 monsters, the rest Spells and Traps.
- Staples first: the guide's era notes (`web/src/data/guide/sets.json`) already mark the cards
  tournaments played and say until when.
- Then the best Normal Summon monsters by ATK at Level 4 or lower. Only a few Tribute monsters
  (Level 5-6 at most 2, Level 7+ at most 1-2).
- Then removal and protection Spells and Traps, using the engine's own card types.
- Rebuilt every set from the new collection, and tested so every deck it builds is legal and duels to an end.

**Phases**, each on its own branch:
1. Series model: a `bot` member kind and the New Game choice. A vs-bot run can't be joined.
2. Server-side bot openings and collection, run when the player opens their packs for a set.
3. The deck builder, with tests.
4. Play Duel in place of Record Match; the duel's end books the result (as rival duels already do).
5. The bot's rewards.

## 4. Strange card situations: audit (2026-11-11)

The engine sends about 90 message types; `session.ts` handles about 50. The board shows what it
reads from the engine's state (positions, counters, what equips or targets a card, Graveyard and
banished piles), so many situations already work. The gaps:

| # | Situation | Today | To do |
|---|---|---|---|
| a | Your own Extra Deck | A face-down pile you can't open | Tap to view it (the owner only) |
| b | Graveyard and banished piles while a question is up | Piles are tappable, but a sheet can cover them | Always reachable on both boards; checked with a driver |
| c | Zones taken away (`FIELD_DISABLED`) | Not tracked: a locked zone looks usable | A locked zone is drawn cracked and greyed, for both players |
| d | Cards revealed from the Deck or excavated (`CONFIRM_DECKTOP`, `DECK_TOP`) | Not shown | The revealed cards are shown to both players, then go where the engine sends them |
| e | A random pick from the hand (`RANDOM_SELECTED`), hand shuffles (`SHUFFLE_HAND`) | Not shown | Highlight the picked card; a quick shuffle of the hand |
| f | An attack negated (`ATTACK_DISABLED`, Negate Attack) | No feedback | "Attack negated" and the attacker pulls back |
| g | Declared type, attribute or card (`CARD_HINT`, `PLAYER_HINT`: DNA Surgery, Mind Crush) | Not shown | A badge on the card or the player |
| h | Milling (Deck to Graveyard) | Plays as a move | Check it animates from the Deck pile, several at a time |
| i | Face-down banished | The owner sees their own, the rival sees the back | Correct; check the pile viewer keeps it face-down for the rival |
| j | Ordering cards (`SORT_CARD`) | The engine's order is kept | Ask when the card lets the player choose (Open in RULES.md) |
| k | Counters on several cards (`SELECT_COUNTER`) | Taken from the first | Ask (Open in RULES.md) |
| l | Deck and Graveyard swapped, Deck reversed | Rare in the early sets | Show the result; a full redraw is fine |

Each fix comes with a duel test (as in `test/duel-chaos.test.ts`) for the cards that cause it, and
a check on the phone and desktop boards.

## Order

4a, 4b, 4c, 4f (everyday play), then 4d, 4e, 4g, 4j, 4k, 4h, 4l. Next comes the sounds (asking
before each download), then the campaign bot phases. Bot rough edges come last, once it plays
campaign duels.
