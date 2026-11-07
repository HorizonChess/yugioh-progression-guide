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
    banished: DuelCardView[];
    deck: number;
    extra: number;
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
    chain: { code: number; side: Side; uid?: string }[];
}

/** Something that happened, for the board to animate and the log to tell. */
export type DuelEvent =
    | { k: 'turn'; side: Side; turn: number }
    | { k: 'phase'; phase: Phase }
    | { k: 'draw'; side: Side; count: number }
    | { k: 'summon'; side: Side; code: number; how: 'normal' | 'special' | 'flip' }
    | { k: 'set'; side: Side }
    | { k: 'activate'; side: Side; code: number; uid?: string; link: number }
    | { k: 'resolved'; link: number }
    | { k: 'negated'; link: number }
    | { k: 'attack'; side: Side; attacker?: string; target?: string }
    | { k: 'destroyed'; uid: string; code: number }
    | { k: 'move'; uid: string; code: number; side: Side; from: Zone; to: Zone }
    | { k: 'damage'; side: Side; amount: number }
    | { k: 'recover'; side: Side; amount: number }
    | { k: 'pay'; side: Side; amount: number }
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
          options: { id: number; uid?: string; code: number; where: Zone; text?: string }[];
          pass: number | null;
          /**
           * Nothing calls for a response: no chain to answer, no trigger, and no card whose script
           * marks this moment as one to use it at (EDOPro's own test). Players who keep the
           * default chain setting aren't asked; the app passes for them.
           */
          quiet?: boolean;
      }
    /** Choose cards. `step` mode: one at a time, with `done` to finish. */
    | { kind: 'cards'; title: string; min: number; max: number; cancel: boolean; cards: PromptCard[]; tribute?: boolean; sum?: number; step?: { chosen: PromptCard[]; canFinish: boolean } }
    | { kind: 'yesno'; title: string; code?: number }
    | { kind: 'option'; title: string; options: { id: number; text: string }[] }
    | { kind: 'position'; code: number; options: { id: number; label: string }[] }
    | { kind: 'number'; title: string; options: { id: number; label: string }[] }
    | { kind: 'declare'; title: string; what: 'type' | 'attribute'; count: number; options: { id: number; label: string }[] }
    | { kind: 'card-name'; title: string }
    /** Choose zones on the field: where to put a card, or (`disable`) which zones an effect shuts. */
    | { kind: 'place'; title: string; count: number; disable: boolean; zones: PlaceZone[] };

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
    z.strictObject({ kind: z.literal('name'), name: z.string().trim().min(1).max(80) }),
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
    result: { winner: Side | null; reason: string } | null;
}

/** Client → server over the duel socket. */
export const DuelClientMessageSchema = z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('answer'), seq: z.number().int().min(0), answer: DuelAnswerSchema }),
    z.strictObject({ type: z.literal('concede') }),
]);
export type DuelClientMessage = z.infer<typeof DuelClientMessageSchema>;

/** Server → client over the duel socket: the frames since the last message (to animate), then the state now. */
export interface DuelServerMessage {
    type: 'state';
    frames: DuelFrame[];
    state: DuelState;
}
