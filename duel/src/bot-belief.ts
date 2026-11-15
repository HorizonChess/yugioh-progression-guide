import { DUELISTS, duelistDeck } from '@ygo/shared';
import type { Engine } from './engine';
import type { DuelSession, Team } from './session';

/*
 * What the bot believes about the cards it can't see, for its look-ahead (bot-sim.ts): in each copy
 * of the duel it plays on in, the rival's hand, Set cards, face-down monsters and Deck are made into
 * cards drawn from this belief, and its own Deck is shuffled. So the copies hold no more than the
 * bot knows, and the rival can play in them: respond to an attack with the Mirror Force it might
 * have, take its turn with the hand it might hold. Over several such guesses, a play is judged by
 * what the rival could do about it, as a duelist would.
 *
 * The belief: the cards duelists play (every duelist's decks, as often as they run them), the
 * rival's own cards seen this duel weighing more (decks run copies). A Set Spell or Trap is most
 * likely a Trap or a Quick-Play Spell (sometimes a bluff); a face-down monster, one that can be Set
 * (Level 4 or lower), a Flip monster likelier.
 */

const TYPE_MONSTER = 0x1, TYPE_SPELL = 0x2, TYPE_TRAP = 0x4, TYPE_QUICKPLAY = 0x10000, TYPE_COUNTER = 0x100000, TYPE_FLIP = 0x200000;
const TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000, TYPE_RITUAL = 0x80, TYPE_TOKEN = 0x4000;
/** How much more likely a card the rival has shown is, than one from the pool. */
const SEEN_WEIGHT = 4;

type Weighted = { codes: number[]; weights: number[]; total: number };
export interface Belief {
    /** For the hand and the Deck: any Main Deck card. */
    any: Weighted;
    /** For a Set Spell or Trap. */
    set: Weighted;
    /** For a face-down monster. */
    monster: Weighted;
}

let pool: Map<number, number> | null = null;
/** The cards duelists play, with how many copies in all their decks. */
function duelistPool(): Map<number, number> {
    if (pool) return pool;
    pool = new Map();
    for (const d of DUELISTS)
        for (const e of d.eras)
            for (const era of [e.id, ...(e.competitive ? [`${e.id}+`] : [])])
                for (const c of duelistDeck(d, era).deck.main) pool.set(c, (pool.get(c) ?? 0) + 1);
    return pool;
}

function weighted(entries: [number, number][]): Weighted {
    const codes: number[] = [], weights: number[] = [];
    let total = 0;
    for (const [c, w] of entries) {
        if (w <= 0) continue;
        codes.push(c);
        total += w;
        weights.push(total);
    }
    return { codes, weights, total };
}

/** The bot's belief about the rival's unseen cards, at this point in the duel. */
export function beliefOf(duel: DuelSession, team: Team): Belief {
    const engine = duel.engine;
    const counts = new Map(duelistPool());
    // The rival's cards seen this duel (Graveyard, banished, face-up on the field).
    const opp = duel.view(team).opp;
    for (const c of [...opp.grave, ...opp.banished, ...opp.monsters, ...opp.spells, opp.field]) {
        if (c?.code && c.faceUp !== false) counts.set(c.code, (counts.get(c.code) ?? 0) + SEEN_WEIGHT);
    }
    const type = (c: number) => engine.cardData(c)?.type ?? 0;
    const main = [...counts].filter(([c]) => {
        const t = type(c);
        return t && !(t & (TYPE_EXTRA | TYPE_TOKEN));
    });
    const setWeight = (c: number) => {
        const t = type(c);
        if (t & TYPE_TRAP) return t & TYPE_COUNTER ? 2 : 3;
        if (t & TYPE_SPELL) return t & TYPE_QUICKPLAY ? 2 : 0.3;
        return 0;
    };
    const monsterWeight = (c: number) => {
        const t = type(c);
        if (!(t & TYPE_MONSTER) || t & TYPE_RITUAL || (engine.cardData(c)?.level ?? 0) > 4) return 0;
        return t & TYPE_FLIP ? 2 : 1;
    };
    return {
        any: weighted(main),
        set: weighted(main.map(([c, n]) => [c, n * setWeight(c)])),
        monster: weighted(main.map(([c, n]) => [c, n * monsterWeight(c)])),
    };
}

/** A small seeded random number generator (mulberry32). */
export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function draw(w: Weighted, rand: () => number): number {
    const x = rand() * w.total;
    let lo = 0, hi = w.weights.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (w.weights[mid]! > x) hi = mid;
        else lo = mid + 1;
    }
    return w.codes[lo]!;
}

/**
 * The Lua that makes a copy of the duel one guess at what the bot can't see: the rival's hidden
 * cards made into cards drawn from the belief, and the bot's own Deck shuffled (it knows what's in
 * it, not the order). Run in the copy (DuelSession.runScript).
 */
export function guessScript(duel: DuelSession, team: Team, belief: Belief, rand: () => number): string {
    const view = duel.view(team);
    const rival = 1 - team;
    const list = (n: number, w: Weighted) => `{${Array.from({ length: n }, () => (w.total ? draw(w, rand) : 0)).join(',')}}`;
    const setCount = view.opp.spells.filter((c) => c && !c.faceUp).length + (view.opp.field && !view.opp.field.faceUp ? 1 : 0);
    const monsterCount = view.opp.monsters.filter((c) => c && !c.faceUp).length;
    const own = Array.from({ length: view.me.deck }, (_, i) => i + 1);
    for (let i = own.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [own[i], own[j]] = [own[j]!, own[i]!];
    }
    return [
        'local function re(c,code) if code and code>0 and c:GetOriginalCode()~=code then c:Recreate(code,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,true) end end',
        'local function each(g,list) local i=1 for c in aux.Next(g) do re(c,list[i]) i=i+1 end end',
        `each(Duel.GetFieldGroup(${rival},LOCATION_HAND,0),${list(view.opp.hand.length, belief.any)})`,
        `each(Duel.GetFieldGroup(${rival},LOCATION_DECK,0),${list(view.opp.deck, belief.any)})`,
        `each(Duel.GetMatchingGroup(Card.IsFacedown,${rival},LOCATION_SZONE,0,nil),${list(setCount, belief.set)})`,
        `each(Duel.GetMatchingGroup(Card.IsFacedown,${rival},LOCATION_MZONE,0,nil),${list(monsterCount, belief.monster)})`,
        `local g=Duel.GetFieldGroup(${team},LOCATION_DECK,0) local codes={} for c in aux.Next(g) do codes[#codes+1]=c:GetOriginalCode() end`,
        `each(g,(function() local P={${own.join(',')}} local out={} for i,p in ipairs(P) do out[i]=codes[p] end return out end)())`,
    ].join('\n');
}

export type { Engine };
