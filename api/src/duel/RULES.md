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

How it's asked (page, `DuelScreen`): first a plain **Yes / No**, saying what's happening. With a chain
going: "Respond to Mirror Force?", or "Chain another card?" on top of your own. Without one, the
moment comes from the engine's own timing for the window, with the cards involved (`askFor` in
session.ts): "Practice Bot's Gemini Elf declared an attack on your Celtic Guardian. Respond?",
"Damage calculation: your Injection Fairy Lily battles Practice Bot's Gemini Elf. Activate a card?",
"Practice Bot's End Phase. Activate a card?". "Respond?" after the rival's play, "Activate a card?"
otherwise. Yes: the cards you can use now glow; tap one to pick it up
and choose **Activate** (or **Details** to read it) over it, or Back to the Yes / No. Only a card that
can't be tapped where it lies (in a Graveyard, banished) is offered as a button. Several mandatory
effects at once skip the Yes / No (none can be skipped): their cards glow and you pick the order.
A question you've answered stays up only until the reply arrives, never through the animations
before the next one.

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

It plays from what a player at the table could see. The rival's face-down monsters count as unknown (guessed at 1400 ATK and DEF) for its attacks, its targets and whether a wipe is worth it; it never reads the rival's hand, deck or set Spells and Traps.

## Ordering cards and removing counters (rules 4)

- **Ordering cards** (`SORT_CARD`, Spellbook Organization: "place them on top of the Deck in any
  order"): a player taps the cards in order, numbered as they go; the first goes on top. The bot
  keeps the engine's order. (ocgcore-wasm writes a count byte before the answer that the engine
  doesn't read; `forEngine` in session.ts works around it.)
- **Removing counters** (`SELECT_COUNTER`): when there's more than one way to take them, a player
  picks from the ways ("2 from Breaker, 1 from Royal Magical Library"). Otherwise, and for the
  bot, they come from the first cards listed.
- Duels started under rules 3 or earlier keep the old answers, so their replays still land.

## Open: still decided for the player without reading the card

- **Rock-paper-scissors** (`ROCK_PAPER_SCISSORS`): always the same hand. Fine for deciding who
  goes first; a card that plays it would need the real choice.

## Checked

`test/duel-chaos.test.ts` plays whole duels with tokens (Scapegoat, Fiend's Sanctuary, Ojama Trio),
Fusion and Ritual Summons, coins and dice, flips, control changes, discards and negation, every
question answered at random through the screens a player sees: nothing may get stuck, every token
carries its name, and every replay lands where the duel is. `GAMES=200` for a long run (200 passed).
