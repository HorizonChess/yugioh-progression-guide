# What the duel decides on its own

The rules engine (EDOPro's ocgcore) runs the duel and knows every card's text. The app only decides
**when to ask the player** and **how to answer questions that aren't really choices**. Everything
it decides for a player is listed here, with the reason and the card it came from. Yu-Gi-Oh is
card-text specific: a rule here should hold for every card it touches, and when one doesn't, it is
recorded under *Open* until it's made exact.

A duel is rebuilt by replaying its answers, so a change to what the server answers by itself is
tied to a rules number (`DuelSetup.rules`, `DUEL_RULES` in session.ts). Duels already underway
keep the rules they started with.

## Answered for the player (server, `autoAnswer` in session.ts)

| Question | What happens | Why | Since |
|---|---|---|---|
| A zone, when there's only one way to fill it | Filled | No choice to make | 1 |
| A zone, otherwise | **The player picks** (the bot takes the middle-most) | Zones matter (Ojama Trio, column effects) | 1 |
| Respond, with nothing that can legally respond | Passed | No choice to make | 1 |
| One mandatory effect (Ekibyo Drakmord destroying its monster) | It activates | "Must" is no choice | 2 |
| Several copies of **the same** mandatory effect at once (two Masks of the Accursed in a Standby Phase) | Chained in any order | Every order comes to the same thing | 3 |
| Several **different** mandatory effects at once | **The player picks the order**, told that all of them happen | The order can matter (the rules let the player choose) | — |

## When a player is asked to respond (server, `SELECT_CHAIN` in `ask`)

The engine offers only what's legal at that moment and gives priority by the rules: after a card is
activated, the other player gets the first chance to respond. One question per moment lists every
card that can be used then; none comes if there's nothing. In the default setting ("Ask me to
respond: when it matters", as Master Duel's *Auto*) a moment is asked about:

- **With a chain going**: whenever you can add to it. Its newest link is the rival's (respond to it),
  or yours once the rival passed (chain another card of yours on top).
- **Without a chain, on your own turn**: not asked. Cards you can use then are offered as actions
  (tap the card), like an attack.
- **Without a chain, on the rival's turn**: after the rival's play, when the engine flags a card of
  yours as made for that moment (Trap Hole on a summon).
- **In a battle's damage step**: once per card per attack, right before damage calculation (Reinforcements).
  The window at the very start of the damage step isn't asked: anything usable then is still usable
  just before damage calculation. A card usable only *during* damage calculation (Injection Fairy
  Lily) is asked then. Copies of one card share one question.
- **Optional triggers** ("you can…", Sangan, Witch of the Black Forest) are always asked as a yes/no
  of their own: passing a chain window never loses one.

"Ask me to respond: at every chance" (Master Duel's *ON*) asks at every moment a card could be used.

## Taking a move back (server, `backAnswers`; page, "Back")

A move still being set up (its zone, its position, its Tributes) can be taken back until anything of
it shows on the board: the duel is rebuilt from the answers before it. After that it's played.

## Reconnecting (server, `framesSince`)

A page that lost its connection (a phone put away mid-turn) is shown what it missed when it comes
back: the moves play out and are in the log. If too much happened (over 300 steps) or the duel was
rebuilt meanwhile, it gets the board as it stands.

## The practice bot (bot.ts)

The bot plays legally but by rules of thumb, and reads a card's script to guess what it does:
`buff` (raises ATK/DEF, or an Equip with no harm), `wipe` (destroys monsters on both sides), or
anything else. It uses a buff only on its own face-up monster (as a response, only in a battle), a
wipe only when the rival has more on the field, a Continuous Trap only on the rival's turn while
they have a face-up monster, and always says yes to optional effects. These are guesses: a card the
guess gets wrong plays badly, never illegally.

## Open: still decided for the player without reading the card

- **Ordering cards** (`SORT_CARD`, "place them on top of the Deck in any order"): the engine's
  default order is kept. Should ask whenever the card lets the player choose.
- **Removing counters** (`SELECT_COUNTER`): taken from the first cards listed. Should ask when the
  counters are on more than one card.
- **Rock-paper-scissors** (`ROCK_PAPER_SCISSORS`): always the same hand. Fine for deciding who
  goes first; a card that plays it would need the real choice.

## Checked

`test/duel-chaos.test.ts` plays whole duels with tokens (Scapegoat, Fiend's Sanctuary, Ojama Trio),
Fusion and Ritual Summons, coins and dice, flips, control changes, discards and negation, every
question answered at random through the screens a player sees: nothing may get stuck, every token
carries its name, and every replay lands where the duel is. `GAMES=200` for a long run (200 passed).
