import type { DuelCardView, DuelSideView, DuelView } from '@ygo/shared';
import type { Engine } from './engine';

/*
 * How good a position is for the bot, from what it can see (its view of the duel: the rival's
 * hand and face-down cards stay hidden). Card advantage and the monsters on the field count most;
 * Life Points count, more so when they run low. A boost that ends with the turn isn't counted on
 * its own (only what it does in a battle): a monster is worth its own ATK, plus what its Equip
 * Spells and other lasting cards give it.
 *
 * A monster the other side can beat is counted as partly lost already: a weak monster Normal
 * Summoned face-up in Attack Position is run over next turn, where Set face-down it hides its
 * stats (and a Flip monster keeps its effect for when it's flipped).
 */

/** What a card in hand is worth, either side. */
const HAND = 380;
/** A Set Spell or Trap, either side. */
const SET = 420;
/** A face-up Spell or Trap that stays (Continuous, Equip, Field): its effect shows elsewhere too. */
const FACE_UP = 250;
/** What a face-down monster of the rival's is taken to be: about what early-era players set. */
const HIDDEN = { atk: 1400, def: 1400 };
const WIN = 1_000_000;
const TYPE_FLIP = 0x200000;
/** A face-down monster of the bot's: the rival doesn't know what it is. */
const HIDDEN_BONUS = 60;
/** A face-down Flip monster: its effect still to come. */
const FLIP_BONUS = 350;
/** How much of what's at risk is counted lost: for the bot's monsters, and (less: it's the bot's move to make) for the rival's. */
const RISK = { mine: 0.75, theirs: 0.35 };
/**
 * A monster the rival is likely to summon next turn (from a hand of cards): a face-up Attack Position
 * monster weaker than this is likely run over, so a low-ATK monster is Set rather than Normal Summoned.
 */
const EXPECTED_ATTACKER = 1700;
const LATENT_RISK = 0.4;

export function lifeValue(lp: number): number {
    // Each point counts; the last 2000 count twice as much (the duel is close to over).
    return 0.45 * lp + 0.45 * Math.min(lp, 2000) - (lp <= 0 ? WIN : 0);
}

type Stats = { atk: number; def: number; attack: boolean; faceUp: boolean; value: number };

/**
 * The damage a face-up Attack Position monster threatens: before its owner's Battle Phase, against
 * an empty field, its ATK (it will attack directly); otherwise a little.
 */
function pressure(atk: number, battleAhead: boolean, open: boolean): number {
    return Math.max(0, atk) * (battleAhead && open ? 0.45 : 0.08);
}

function stats(c: DuelCardView, mine: boolean, engine: Engine, battleAhead = false, open = false): Stats {
    let atk: number, def: number;
    if (c.faceUp && c.atk !== undefined) {
        // Its lasting power: its own stats unless something lasting acts on it (an Equip Spell).
        const lasting = (c.by?.length ?? 0) > 0;
        atk = lasting ? c.atk : (c.baseAtk ?? c.atk);
        def = lasting ? (c.def ?? 0) : (c.baseDef ?? c.def ?? 0);
    } else if (mine && c.code) {
        const data = engine.cardData(c.code);
        atk = data?.attack ?? 0;
        def = data?.defense ?? 0;
    } else {
        ({ atk, def } = HIDDEN);
    }
    let value = 300 + 0.5 * Math.max(0, atk) + 0.2 * Math.max(0, def);
    if (c.faceUp && !c.defense) value += pressure(atk, battleAhead, open);
    if (!c.faceUp && mine && c.code) value += HIDDEN_BONUS + ((engine.cardData(c.code)?.type ?? 0) & TYPE_FLIP ? FLIP_BONUS : 0);
    return { atk, def, attack: c.faceUp && !c.defense, faceUp: c.faceUp, value };
}

function monsterValue(c: DuelCardView, mine: boolean, engine: Engine): number {
    return stats(c, mine, engine).value;
}

/**
 * What `side` stands to lose to the other side's face-up Attack Position monsters: each of its
 * monsters that one of them beats (in Attack Position, the damage too). A face-down monster of
 * the bot's is beaten only if the attacker beats its DEF, and then the rival can't know it would.
 */
function atRisk(defenders: Stats[], attackers: Stats[], mine: boolean): number {
    const strongest = Math.max(0, ...attackers.filter((a) => a.attack && a.faceUp).map((a) => a.atk));
    if (!strongest) return 0;
    let risk = 0;
    for (const d of defenders) {
        if (d.attack) {
            if (strongest > d.atk) risk += d.value + 0.45 * (strongest - d.atk);
        } else if (strongest > d.def) risk += d.faceUp || !mine ? d.value : 0.5 * d.value;
    }
    return risk;
}

function sideValue(side: DuelSideView, mine: boolean, engine: Engine, battleAhead: boolean, open: boolean): number {
    let v = lifeValue(side.lp) + HAND * side.hand.length;
    for (const m of side.monsters) if (m) v += stats(m, mine, engine, battleAhead, open).value;
    for (const s of [...side.spells, side.field]) if (s) v += s.faceUp ? FACE_UP : SET;
    return v;
}

/** The position's worth to the viewer: theirs minus the rival's. */
export function evaluate(view: DuelView, engine: Engine): number {
    // The Battle Phase still to come this turn, for whoever's turn it is.
    const battleAhead = view.phase === 'DP' || view.phase === 'SP' || view.phase === 'M1';
    const empty = (s: DuelSideView) => s.monsters.every((c) => !c);
    const myTurn = view.turnPlayer === 'me';
    let v = sideValue(view.me, true, engine, myTurn && battleAhead, empty(view.opp)) - sideValue(view.opp, false, engine, !myTurn && battleAhead, empty(view.me));
    const mine = view.me.monsters.flatMap((c) => (c ? [stats(c, true, engine)] : []));
    const theirs = view.opp.monsters.flatMap((c) => (c ? [stats(c, false, engine)] : []));
    v -= RISK.mine * atRisk(mine, theirs, true);
    v += RISK.theirs * atRisk(theirs, mine, false);
    // What the rival could summon next turn (from their hand and the card they'll draw), against
    // the bot's face-up Attack Position monsters.
    const likely = LATENT_RISK * Math.min(1, (view.opp.hand.length + 1) / 3);
    for (const d of mine) if (d.attack && d.atk < EXPECTED_ATTACKER) v -= likely * (d.value + 0.45 * (EXPECTED_ATTACKER - d.atk));
    for (const x of view.extraMonsters) if (x) v += (x.side === 'me' ? 1 : -1) * monsterValue(x.card, x.side === 'me', engine);
    return v;
}

export const WIN_VALUE = WIN;
