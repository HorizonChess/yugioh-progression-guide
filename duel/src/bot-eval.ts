import type { DuelCardView, DuelSideView, DuelView } from '@ygo/shared';
import type { Engine } from './engine';
import { WEIGHTS, type Feature } from './bot-weights';

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
 *
 * The position is measured as a set of features (`features`: Life Points, cards in hand, the
 * monsters' strength, Set cards, what's at risk, who holds the field...), and its score is their
 * weighted sum, with the weights in bot-weights.ts: fitted to who went on to win in bot-vs-bot
 * games (api/scripts/bot-lab/record.ts, fit-weights.py).
 */

/** What a face-down monster of the rival's is taken to be: about what early-era players set. */
const HIDDEN = { atk: 1400, def: 1400 };
const WIN = 1_000_000;
const TYPE_MONSTER = 0x1, TYPE_FLIP = 0x200000;
/** A face-down monster of the bot's: the rival doesn't know what it is. */
const HIDDEN_BONUS = 60;
/** A face-down Flip monster: its effect still to come. */
const FLIP_BONUS = 350;
/**
 * A monster the rival is likely to summon next turn (from a hand of cards): a face-up Attack Position
 * monster weaker than this is likely run over, so a low-ATK monster is Set rather than Normal Summoned.
 */
const EXPECTED_ATTACKER = 1700;

/** Life Points' part of the score (the duel lost at 0); for the bot's own use, at the default weights. */
export function lifeValue(lp: number): number {
    return WEIGHTS.lp * lp + WEIGHTS.lowLp * Math.min(lp, 2000) - (lp <= 0 ? WIN : 0);
}

type Stats = { atk: number; def: number; attack: boolean; faceUp: boolean; value: number; hiddenBonus: number };

/**
 * The damage a face-up Attack Position monster threatens: before its owner's Battle Phase, against
 * an empty field, its ATK (it will attack directly); otherwise a little.
 */
function pressure(atk: number, battleAhead: boolean, open: boolean): number {
    return Math.max(0, atk) * (battleAhead && open ? 0.45 : 0.08);
}

const lastingCache = new Map<number, boolean>();
/**
 * Whether a card's script changes ATK or DEF for good, not just for the turn (no RESET_PHASE): Ra's
 * ATK from its Tributes, Dark Magician Girl's from the Dark Magicians in the Graveyard, a Field Spell.
 */
function changesStatsForGood(engine: Engine, code: number): boolean {
    let v = lastingCache.get(code);
    if (v === undefined) {
        const script = engine.readScript(`c${code}.lua`) ?? '';
        v = /EFFECT_(UPDATE|SET|SET_BASE)_(ATTACK|DEFENSE)/.test(script) && !/RESET_PHASE/.test(script);
        lastingCache.set(code, v);
    }
    return v;
}

/** Whether a face-up card on the field changes stats for good: then a monster's ATK as it stands is its lasting power. */
function lastingAura(view: DuelView, engine: Engine): boolean {
    const cards = [view.me, view.opp].flatMap((s) => [...s.monsters, ...s.spells, s.field]);
    return cards.some((c) => !!c?.faceUp && !!c.code && changesStatsForGood(engine, c.code));
}

function stats(c: DuelCardView, mine: boolean, engine: Engine, aura = false): Stats {
    let atk: number, def: number;
    if (c.faceUp && c.atk !== undefined) {
        // Its lasting power: its own stats unless something lasting acts on it (an Equip Spell, its own
        // effect, a Field Spell); a boost for the turn only counts in the battle it's for.
        const lasting = aura || (c.by?.length ?? 0) > 0;
        atk = lasting ? c.atk : (c.baseAtk ?? c.atk);
        def = lasting ? (c.def ?? 0) : (c.baseDef ?? c.def ?? 0);
    } else if (mine && c.code) {
        const data = engine.cardData(c.code);
        atk = data?.attack ?? 0;
        def = data?.defense ?? 0;
    } else {
        ({ atk, def } = HIDDEN);
    }
    const hiddenBonus = !c.faceUp && mine && c.code ? HIDDEN_BONUS + ((engine.cardData(c.code)?.type ?? 0) & TYPE_FLIP ? FLIP_BONUS : 0) : 0;
    // (What it's worth, for what's at risk: fixed, so those features don't move with the weights.)
    const value = 300 + 0.5 * Math.max(0, atk) + 0.2 * Math.max(0, def) + hiddenBonus + (c.faceUp && !c.defense ? pressure(atk, false, false) : 0);
    return { atk, def, attack: c.faceUp && !c.defense, faceUp: c.faceUp, value, hiddenBonus };
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

/**
 * Who holds the field (board advantage): 1 when the bot's strongest face-up monster beats everything
 * the rival has (in ATK or DEF, a face-down one taken at a guess) and nothing of theirs beats it, -1
 * the other way round, else 0.
 */
function control(mine: Stats[], theirs: Stats[]): number {
    const strongest = (side: Stats[]) => Math.max(0, ...side.filter((x) => x.faceUp).map((x) => x.atk));
    const holds = (a: Stats[], b: Stats[]) => {
        const top = strongest(a);
        return top > 0 && b.every((x) => (x.attack ? x.atk : x.def) < top && x.atk < top);
    };
    return holds(mine, theirs) ? 1 : holds(theirs, mine) ? -1 : 0;
}

const handCache = new Map<number, { removal: number; strength: number }>();
/** A card in the bot's own hand: whether it's removal (destroys, banishes, takes control), and a monster's strength (ATK over 1500, in thousands, -1..1). */
function handCard(engine: Engine, code: number): { removal: number; strength: number } {
    let v = handCache.get(code);
    if (!v) {
        const data = engine.cardData(code);
        const monster = !!data && (data.type & TYPE_MONSTER) !== 0;
        const script = engine.readScript(`c${code}.lua`) ?? '';
        v = {
            removal: !monster && /CATEGORY_(DESTROY|REMOVE|CONTROL)\b/.test(script) ? 1 : 0,
            strength: monster ? Math.max(-1, Math.min(1, (Math.max(0, data!.attack) - 1500) / 1000)) : 0,
        };
        handCache.set(code, v);
    }
    return v;
}

/** The position's features, for the viewer (their side counted plus, the rival's minus, where it's both). */
export function features(view: DuelView, engine: Engine, turnEnd = false): Record<Feature, number> {
    // The Battle Phase still to come this turn, for whoever's turn it is.
    const battleAhead = !turnEnd && (view.phase === 'DP' || view.phase === 'SP' || view.phase === 'M1');
    const empty = (s: DuelSideView) => s.monsters.every((c) => !c);
    const myTurn = view.turnPlayer === 'me';
    const aura = lastingAura(view, engine);
    const f: Record<Feature, number> = {
        lp: view.me.lp - view.opp.lp, lowLp: Math.min(view.me.lp, 2000) - Math.min(view.opp.lp, 2000),
        hand: view.me.hand.length - view.opp.hand.length, handRemoval: 0, handStrength: 0,
        monster: 0, monsterAtk: 0, monsterDef: 0, hiddenBonus: 0, pressure: 0,
        set: 0, faceUp: 0, riskMine: 0, riskTheirs: 0, latent: 0, control: 0,
    };
    for (const c of view.me.hand) {
        if (!c.code) continue;
        const h = handCard(engine, c.code);
        f.handRemoval += h.removal;
        f.handStrength += h.strength;
    }
    const side = (s: DuelSideView, sign: 1 | -1, mine: boolean, ahead: boolean, open: boolean) => {
        for (const m of s.monsters) {
            if (!m) continue;
            const st = stats(m, mine, engine, aura);
            f.monster += sign;
            f.monsterAtk += sign * Math.max(0, st.atk);
            f.monsterDef += sign * Math.max(0, st.def);
            f.hiddenBonus += sign * st.hiddenBonus;
            if (m.faceUp && !m.defense) f.pressure += sign * pressure(st.atk, ahead, open);
        }
        for (const c of [...s.spells, s.field]) if (c) c.faceUp ? (f.faceUp += sign) : (f.set += sign);
    };
    side(view.me, 1, true, myTurn && battleAhead, empty(view.opp));
    side(view.opp, -1, false, !myTurn && battleAhead, empty(view.me));
    for (const x of view.extraMonsters) {
        if (!x) continue;
        const sign = x.side === 'me' ? 1 : -1, st = stats(x.card, x.side === 'me', engine, aura);
        f.monster += sign;
        f.monsterAtk += sign * Math.max(0, st.atk);
        f.monsterDef += sign * Math.max(0, st.def);
        f.hiddenBonus += sign * st.hiddenBonus;
    }
    const mine = view.me.monsters.flatMap((c) => (c ? [stats(c, true, engine, aura)] : []));
    const theirs = view.opp.monsters.flatMap((c) => (c ? [stats(c, false, engine, aura)] : []));
    f.riskMine = atRisk(mine, theirs, true);
    f.riskTheirs = atRisk(theirs, mine, false);
    // What the rival could summon next turn (from their hand and the card they'll draw), against
    // the bot's face-up Attack Position monsters.
    const likely = Math.min(1, (view.opp.hand.length + 1) / 3);
    for (const d of mine) if (d.attack && d.atk < EXPECTED_ATTACKER) f.latent += likely * (d.value + 0.45 * (EXPECTED_ATTACKER - d.atk));
    f.control = control(mine, theirs);
    return f;
}

/**
 * The position's worth to the viewer: theirs minus the rival's. `turnEnd`: scored as a turn ends
 * (no Battle Phase still to come for either side), so positions at different points compare.
 */
export function evaluate(view: DuelView, engine: Engine, turnEnd = false): number {
    if (view.me.lp <= 0) return -WIN;
    if (view.opp.lp <= 0) return WIN;
    const f = features(view, engine, turnEnd);
    let v = 0;
    for (const k in f) v += WEIGHTS[k as Feature] * f[k as Feature];
    return v;
}

export const WIN_VALUE = WIN;
