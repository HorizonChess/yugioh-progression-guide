import { z } from 'zod';
import type { DuelModeId } from './eras';

/*
 * What the duel server sends each player and what it accepts back. The server runs the
 * rules engine; a player only ever sees their own view (the rival's hand, deck and face-down
 * cards stay hidden) and answers the question they were asked by choosing one of its ids.
 */

export type Side = 'me' | 'opp';
export type Zone = 'hand' | 'monster' | 'spell' | 'field' | 'pendulum' | 'grave' | 'banished' | 'deck' | 'extra';
export type Phase = 'DP' | 'SP' | 'M1' | 'BP' | 'M2' | 'EP';

/** A card as one player may see it. `code` is 0 when it's hidden from them. */
export interface DuelCardView {
    /** Follows the card from zone to zone while the server can track it (drives the fly animation). */
    uid: string;
    code: number;
    faceUp: boolean;
    defense: boolean;
    /** Current ATK/DEF for monsters on the field (with every effect applied). */
    atk?: number;
    def?: number;
    baseAtk?: number;
    baseDef?: number;
    /** Face-up cards on the field acting on this one: an Equip Spell equipped to it, a continuous card targeting it. */
    by?: { uid: string; code: number }[];
    /** Its effects are negated. */
    negated?: boolean;
    /** Counters on it, all kinds together. */
    counters?: number;
    /** A token's name: tokens aren't in the card catalog, and some have no picture. */
    token?: string;
    /** What an effect wrote on it: a declared Type or Attribute (DNA Surgery), a named card, a number, a lasting effect. */
    notes?: string[];
}

export interface DuelSideView {
    name: string;
    lp: number;
    hand: DuelCardView[];
    /** The five Main Monster Zones, the owner's left to right. */
    monsters: (DuelCardView | null)[];
    /** The five Spell & Trap Zones, the owner's left to right. */
    spells: (DuelCardView | null)[];
    field: DuelCardView | null;
    /** Master Rule 3: the two Pendulum Zones (left, right). */
    pendulum: (DuelCardView | null)[];
    grave: DuelCardView[];
    /**
     * This player's Graveyard is closed to you for now: their Question is being resolved, and you
     * have to name its first monster from memory. Its cards come without codes, face-down.
     */
    graveHidden?: boolean;
    banished: DuelCardView[];
    deck: number;
    /** The Decks are turned over (Convulsion of Nature): the card on top of this one, which both players see. */
    deckTop?: number;
    extra: number;
    /** The Extra Deck's cards, for its owner only (the rival sees just the count). */
    extraCards?: DuelCardView[];
    /** Zones a card has taken out of use (Kashtira Shangri-Ira, Excode Talker), the owner's left to right. */
    locked?: { monsters: boolean[]; spells: boolean[] };
    /** Lasting effects on the player ("You cannot Normal Summon"). */
    notes?: string[];
}

export interface DuelView {
    mode: DuelModeId;
    turn: number;
    turnPlayer: Side;
    phase: Phase;
    me: DuelSideView;
    opp: DuelSideView;
    /** New Master Rule: the two Extra Monster Zones (left, right as `me` sees them), and whose each card is. */
    extraMonsters: ({ side: Side; card: DuelCardView } | null)[];
    /** The chain being built, chain link 1 first. */
    chain: { code: number; side: Side; uid?: string; /** The cards its activation targeted, by uid. */ targets?: string[] }[];
}

/** Something that happened, for the board to animate and the log to tell. */
export type DuelEvent =
    | { k: 'turn'; side: Side; turn: number }
    | { k: 'phase'; phase: Phase }
    | { k: 'draw'; side: Side; count: number }
    /** A deck shuffled (after a search, say). */
    | { k: 'shuffle'; side: Side }
    /** A hand shuffled (after a card whose place in it was known came back, or was shown). */
    | { k: 'hand-shuffle'; side: Side }
    /** A coin tossed (Fairy Box, Time Wizard…): each result, and who called it, if anyone did. */
    | { k: 'coin'; side: Side; results: ('heads' | 'tails')[]; call?: { side: Side; heads: boolean } }
    /** A die rolled (Dice Jar, Graceful Dice…). */
    | { k: 'dice'; side: Side; results: number[] }
    | { k: 'summon'; side: Side; code: number; how: 'normal' | 'special' | 'flip' }
    | { k: 'set'; side: Side }
    | { k: 'activate'; side: Side; code: number; uid?: string; link: number }
    | { k: 'resolved'; link: number }
    | { k: 'negated'; link: number }
    | { k: 'attack'; side: Side; attacker?: string; target?: string }
    /**
     * Cards shown by an effect: from the hand (a searched card shown to the rival, Confiscation's
     * look), or the top of the Deck (excavated, as Card Destruction's cousins do). `codes` is
     * empty when only the other player saw them; `count` says how many there were. `by`: who looks
     * (null: both players, face up for all).
     */
    | { k: 'reveal'; side: Side; by: Side | null; from: Zone; codes: number[]; count: number }
    /** Cards picked at random (Delinquent Duo's discard). */
    | { k: 'random'; uids: string[] }
    /** An attack stopped by a card (Negate Attack, Magic Cylinder): no battle follows. */
    | { k: 'attack-negated'; side: Side; attacker?: string }
    /** A player declared a Type, an Attribute, a card or a number (Mind Crush, DNA Surgery, Prohibition). */
    | { k: 'declare'; side: Side; what: 'type' | 'attribute' | 'card' | 'number'; text: string; code?: number }
    | { k: 'destroyed'; uid: string; code: number }
    | { k: 'move'; uid: string; code: number; side: Side; from: Zone; to: Zone }
    | { k: 'damage'; side: Side; amount: number }
    | { k: 'recover'; side: Side; amount: number }
    | { k: 'pay'; side: Side; amount: number }
    /** Life Points set outright by an effect (Reversal Quiz swapping them): what they become, and what they were. */
    | { k: 'lp'; side: Side; lp: number; was: number }
    | { k: 'reposition'; uid: string; code: number }
    | { k: 'win'; side: Side | null; reason: string };

/** One step the board plays in order: its events, then the state after them. */
export interface DuelFrame {
    events: DuelEvent[];
    view: DuelView;
}

/** A card a question is about, as the asked player sees it. */
export interface PromptCard {
    id: number;
    code: number;
    side: Side;
    where: Zone;
    uid?: string;
}

export type ActionVerb = 'summon' | 'special' | 'set' | 'set-spell' | 'reposition' | 'activate' | 'attack' | 'attack-direct';

export type DuelPrompt =
    /** Main Phase or Battle Phase: tap a card for its actions, or move on. */
    | {
          kind: 'actions';
          phase: 'main' | 'battle';
          actions: { id: number; uid?: string; code: number; where: Zone; verb: ActionVerb; text?: string }[];
          next: { id: number; to: 'BP' | 'M2' | 'EP' }[];
      }
    /** Respond with a card or effect, or pass. */
    | {
          kind: 'chain';
          forced: boolean;
          /**
           * `must`: in a forced list, an effect that has to happen now (a Standby Phase upkeep). The
           * engine lists it with the cards you could activate at that moment, which stay optional.
           */
          options: { id: number; uid?: string; code: number; where: Zone; text?: string; must?: boolean }[];
          pass: number | null;
          /**
           * Nothing calls for a response: no chain to answer, no trigger, and no card whose script
           * marks this moment as one to use it at (EDOPro's own test). Players who keep the
           * default chain setting aren't asked; the app passes for them.
           */
          quiet?: boolean;
          /**
           * The question in words, with the moment it's about ("Practice Bot's Gemini Elf declared an
           * attack on your Celtic Guardian. Respond?"), when no chain is going.
           */
          ask?: string;
      }
    /** Choose cards. `step` mode: one at a time, with `done` to finish. */
    | { kind: 'cards'; title: string; min: number; max: number; cancel: boolean; cards: PromptCard[]; tribute?: boolean; /** The pick of what to attack: the glowing targets say it all. */ attack?: boolean; sum?: number; step?: { chosen: PromptCard[]; canFinish: boolean }; back?: boolean; /** The order they're tapped in counts (the first goes on top): number them. */ ordered?: boolean }
    | { kind: 'yesno'; title: string; code?: number }
    | { kind: 'option'; title: string; options: { id: number; text: string }[] }
    | { kind: 'position'; code: number; options: { id: number; label: string }[]; back?: boolean }
    | { kind: 'number'; title: string; options: { id: number; label: string }[] }
    | { kind: 'declare'; title: string; what: 'type' | 'attribute'; count: number; options: { id: number; label: string }[] }
    /** Name a card. `only`: the kind of card the effect asks for (Question: a monster). */
    | { kind: 'card-name'; title: string; only?: 'monster' | 'spell' | 'trap' }
    /** Choose zones on the field: where to put a card, or (`disable`) which zones an effect shuts. */
    | { kind: 'place'; title: string; count: number; disable: boolean; zones: PlaceZone[]; back?: boolean };

/**
 * In a forced chain question, the one effect that has to happen (copies of one effect count as
 * one): its option id. Null when several different effects must happen, so their order is a choice.
 */
export const loneMust = (p: Extract<DuelPrompt, { kind: 'chain' }>): number | null => {
    const musts = p.options.filter((o) => o.must);
    const first = musts[0];
    return p.forced && first && musts.every((o) => o.code === first.code && o.text === first.text) ? first.id : null;
};

/** A zone a `place` question offers. `index` is the owner's left-to-right position (as in the side's arrays). */
export interface PlaceZone {
    id: number;
    side: Side;
    zone: 'monster' | 'spell' | 'field' | 'pendulum' | 'extra-monster';
    index: number;
}

/** The key a board gives a zone, to light it up for a `place` question. */
export const zoneKey = (side: Side, zone: PlaceZone['zone'], index: number) => `${side}:${zone}:${index}`;

export const DuelAnswerSchema = z.discriminatedUnion('kind', [
    /** One of the question's ids (an action, a chain option, yes = 1 / no = 0, a position...). */
    z.strictObject({ kind: z.literal('choice'), id: z.number().int().min(0).max(1 << 30) }),
    /** Several card or option ids. */
    z.strictObject({ kind: z.literal('many'), ids: z.array(z.number().int().min(0).max(1 << 30)).max(60) }),
    z.strictObject({ kind: z.literal('cancel') }),
    /** `step` mode: finish choosing. */
    z.strictObject({ kind: z.literal('done') }),
    /** A declared card: its name, and its passcode when it was picked from a list (the name alone must match exactly). */
    z.strictObject({ kind: z.literal('name'), name: z.string().trim().min(1).max(80), code: z.number().int().positive().max(999_999_999).optional() }),
]);
export type DuelAnswer = z.infer<typeof DuelAnswerSchema>;

/** Everything a player's screen needs at a moment. */
export interface DuelState {
    duelId: string;
    /** Bumped by every answer; an answer names the question it's for. */
    seq: number;
    you: { name: string };
    /** `solo`: the rival only passes its turns (solo practice). */
    rival: { name: string; bot: boolean; solo?: boolean };
    view: DuelView;
    /** The question for this player, or null while the rival (or the engine) is acting. */
    prompt: DuelPrompt | null;
    /** Why the last answer was refused (the engine said it isn't allowed). */
    retry?: boolean;
    /** `calledOff`: both players agreed to stop; nobody won and nothing is recorded. */
    result: { winner: Side | null; reason: string; calledOff?: boolean } | null;
    /** The match this duel is a game of (best of 3), as it stands: after this game, once it's over. */
    match?: DuelMatchView;
    /**
     * Calling the duel off needs both players: `asked` when you've asked and your rival hasn't
     * answered, `asking` when your rival asks you.
     */
    callOff?: 'asked' | 'asking';
}

/** A best-of-3 match, as one of its players sees it. */
export interface DuelMatchView {
    /** Which game this duel is: 1, 2 or 3. */
    game: number;
    /** Games won so far: yours, then your rival's. */
    score: [number, number];
    /** The match is decided (or was called off). */
    over: boolean;
    /** Who won the match, once it's over (null: a drawn match). */
    winner?: Side | null;
    /** The next game's duel, once this one is over and the match isn't. */
    next?: string;
    /**
     * Game 1: how rock-paper-scissors went (your hand, your rival's, who won). The winner chose who
     * goes first, so the board can play the showdown even when it was decided without you watching.
     */
    rps?: { mine: RpsHand; theirs: RpsHand; won: boolean };
}

export type RpsHand = 'rock' | 'paper' | 'scissors';

/** A deck as registered for a match: what's played, and the side deck to swap with between games. */
/** How well the practice bot plays (duel/src/bot.ts), weakest first. */
export const BOT_LEVELS = ['easy', 'normal', 'hard'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];
/** The bot's name at each level. */
export const BOT_NAMES: Record<BotLevel, string> = { easy: 'Practice Bot (Easy)', normal: 'Practice Bot', hard: 'Practice Bot (Hard)' };

export const MatchDeckSchema = z.strictObject({
    main: z.array(z.number().int().positive()).min(40).max(60),
    extra: z.array(z.number().int().positive()).max(15),
    side: z.array(z.number().int().positive()).max(15),
});
export type MatchDeck = z.infer<typeof MatchDeckSchema>;

/**
 * Before a game of a match starts, as one player sees it. Game 1: rock-paper-scissors, and its
 * winner chooses who goes first. Later games: both players may swap cards with their side deck,
 * and the loser of the last game chooses who goes first.
 */
export interface DuelPregameView {
    game: number;
    score: [number, number];
    rival: { name: string; bot: boolean };
    /** Rock-paper-scissors is still to be decided; `mine` is your hand once thrown, `tied` the hand both threw last. */
    rps?: { mine: RpsHand | null; tied?: RpsHand };
    /** Who chooses who goes first, once that's known, and why. */
    chooser?: { side: Side; why: 'rps' | 'lost' | 'coin'; hands?: { mine: RpsHand; theirs: RpsHand }; chosen: boolean };
    /** Side decking (game 2 on): your deck as it stands, and whether each of you is done. */
    siding?: { deck: MatchDeck; done: boolean; rivalDone: boolean };
}

/** What a player does before a game: throw a hand, choose who goes first, or hand in their deck. */
export const PregameActionSchema = z.union([
    z.strictObject({ rps: z.enum(['rock', 'paper', 'scissors']) }),
    z.strictObject({ first: z.boolean() }),
    z.strictObject({ deck: MatchDeckSchema }),
]);
export type PregameAction = z.infer<typeof PregameActionSchema>;

/** Client → server over the duel socket. */
export const DuelClientMessageSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('answer'), seq: z.number().int().min(0), answer: DuelAnswerSchema }),
    z.strictObject({ type: z.literal('concede') }),
    /** Call the duel off: `agree` asks for it (or accepts the rival's asking); false withdraws or refuses. */
    z.strictObject({ type: z.literal('call-off'), agree: z.boolean() }),
    /** Take back the move being set up (its zone, position or Tributes): the prompt says when you can. */
    z.strictObject({ type: z.literal('back'), seq: z.number().int().min(0) }),
]);
export type DuelClientMessage = z.infer<typeof DuelClientMessageSchema>;

/** Server → client over the duel socket: the frames since the last message (to animate), then the state now. */
export interface DuelServerMessage {
    type: 'state';
    frames: DuelFrame[];
    state: DuelState;
    /** Where this page now is in the duel's frames: sent back on a reconnect to be shown what it missed. */
    cursor?: string;
}

/**
 * A practice game played on the player's device: the rules engine and the bot run in the
 * browser (a Web Worker), so the server does no work while it's played. The page is handed what
 * it takes to play it (or pick it up again, from the answers so far) and sends the answers back
 * to keep as it goes (to pick the game up again after a reload, and for a bug report). The
 * result is the device's word: practice is never booked on the series.
 */
export interface DuelOnDevice {
    /** The duel's setup as the server keeps it (DuelSetup in @ygo/duel): both decks and the seed. */
    setup: unknown;
    /** Every answer so far (JSON, bigints as {$b}). */
    answers: string[];
    /** Which engine data the duel is played with (its folder in storage). */
    engine: string;
    /** Passcodes the engine knows by another code (an alternate art's): code → the engine's code. */
    learned: Record<string, number>;
    /** The player's team (0 goes first). */
    team: 0 | 1;
    /** The game is over and booked (it's only looked at again). */
    over: boolean;
}

/**
 * The answers of a game played on the device, from answer `from` on (earlier ones taken back are
 * replaced). `end`: the game is over, and how (the server books it as it's told).
 */
export const DeviceAnswersSchema = z.strictObject({
    from: z.number().int().min(0).max(20_000),
    answers: z.array(z.string().max(4000)).max(5000),
    end: z.strictObject({ winner: z.enum(['me', 'opp']).nullable(), reason: z.string().max(300) }).optional(),
});
export type DeviceAnswers = z.infer<typeof DeviceAnswersSchema>;
