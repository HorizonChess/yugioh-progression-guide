import {
    OcgLocation as L, OcgMessageType as M, OcgPosition as P, OcgResponseType as R, SelectBattleCMDAction as B, SelectIdleCMDAction as I,
    type OcgMessage, type OcgResponse,
} from 'ocgcore-wasm';
import { evaluate } from './bot-eval';
import { simulate } from './bot-sim';
import { BOT_LEVELS as PLAYABLE, type BotLevel as PlayableLevel } from '@ygo/shared';
import type { DuelSession, Team } from './session';

/*
 * The practice opponent. It plays from what a player at the table could see: the rival's
 * face-down monsters are guesses, and it never looks at the rival's hand, deck or Set cards.
 *
 * Under every level is the same plain play (`heuristicAnswer`): summon the strongest monster,
 * attack what it can beat, and point an effect at the side it's meant for: a card that destroys,
 * banishes or takes control picks the rival's cards, never its own unless it must (a cost). Above
 * that, before each play it tries the play in a copy of the duel (bot-sim.ts) and scores the board
 * that comes of it (bot-eval.ts), at every level, so it never makes a play that leaves it worse off
 * (Mystical Space Typhoon on its own Set card, Dark Hole while it's ahead on the field).
 *
 *   easy:   plays the first sound play it finds, often keeps cards it could use, and guesses
 *           low at face-down monsters (attacks into them more).
 *   normal: makes the play that scores best, and answers the rival's plays when that pays.
 *   hard:   the same, but it saves its traps for a moment worth them, weighs every "use this
 *           effect?" and choice of target, and is careful attacking into Set cards.
 *
 * Questions the server answers for everyone (zones, ordering) never reach it.
 */

/** `plain`: no looking ahead, for tests of the duel server (quick, and never offered to players). */
export type BotLevel = PlayableLevel | 'plain';

/** BOT_DEBUG set (on the server; a browser has no environment): print what the bot weighs. */
const debugging = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.BOT_DEBUG;
/** The levels a player can choose. */
export const BOT_LEVELS: readonly BotLevel[] = PLAYABLE;

interface LevelRules {
    /** What it takes a face-down monster of the rival's to be (to beat it). */
    hiddenGuess: number;
    /** How much better than doing nothing a play must score (a trap kept for later is worth something). */
    idleMargin: number;
    chainMargin: number;
    /** Takes the first sound play rather than the best one. */
    firstSound: boolean;
    /** The chance it holds back from using a card from its hand on a turn (it doesn't see the play). */
    overlook: number;
    /** Tries both answers to "use this effect?" and each choice of a target. */
    weighChoices: boolean;
    /** Holds an attack into a face-down monster when the rival has Set cards to spring. */
    wary: boolean;
    /** Looks past each play to the end of its turn (bot-sim.ts). */
    through: boolean;
    /**
     * Attacks face-down monsters. Not in the copies it looks ahead in: they hold the rival's real
     * cards, and an attack there would show it what a face-down monster is.
     */
    attacksHidden?: boolean;
}

const LEVELS: Record<PlayableLevel, LevelRules> = {
    easy: { hiddenGuess: 1000, idleMargin: 0, chainMargin: 0, firstSound: true, overlook: 0.5, weighChoices: false, wary: false, through: false },
    normal: { hiddenGuess: 1400, idleMargin: 20, chainMargin: 60, firstSound: false, overlook: 0, weighChoices: true, wary: false, through: false },
    hard: { hiddenGuess: 1500, idleMargin: 20, chainMargin: 300, firstSound: false, overlook: 0, weighChoices: true, wary: true, through: true },
};

/**
 * How long one decision may take to think, in ms: once it's up, the plays not yet tried are left out
 * (the first one, and doing nothing, are always weighed). Set on a player's device, where the bot
 * thinks beside the game's sound and animation; unlimited on the server and in tests.
 */
export const botTuning = { budgetMs: Infinity };
let deadline = Infinity;
const timeUp = () => performance.now() > deadline;

/** Plain play in the copies: never attacking a face-down monster (see `attacksHidden`). */
const IN_COPIES: LevelRules = { hiddenGuess: 1400, idleMargin: 0, chainMargin: 0, firstSound: false, overlook: 0, weighChoices: false, wary: false, through: false, attacksHidden: false };

const MAX_ACTIONS_PER_TURN = 12;
/** At most this many different cards tried at one chance to respond (and the pass). */
const MAX_CHAIN_TRIES = 5;

type Seen = { atk: number; def: number; position: number };
/** A monster as `viewer` sees it: the rival's face-down ones are a guess, never their real stats. */
const seenBy = (viewer: Team, controller: number, st: Seen, guess = 1400): Seen =>
    controller !== viewer && !(st.position & P.FACEUP) ? { atk: guess, def: guess, position: st.position } : st;
/** What it takes to beat a monster in battle: ATK in Attack Position, DEF otherwise. */
const toBeat = (st: Seen) => ((st.position & P.ATTACK) && (st.position & P.FACEUP) ? st.atk : st.def);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const TYPE_SPELL = 0x2, TYPE_TRAP = 0x4, TYPE_QUICKPLAY = 0x10000, TYPE_FLIP = 0x200000;
/** A Flip monster: its effect only comes when it's flipped face-up, so it's Set, never Normal Summoned. */
const isFlip = (duel: DuelSession, code: number) => ((duel.engine.cardData(code)?.type ?? 0) & TYPE_FLIP) !== 0;
/**
 * A monster made to defend (Mystical Elf: 800 ATK, 2000 DEF): a Normal Summon puts it face-up in
 * Attack Position, where it's run over, so it's Set. Not one with an effect it wants face-up for:
 * one when it's summoned (Summoner Monk), or one it activates (Gagaga Sister).
 */
function isWall(duel: DuelSession, code: number): boolean {
    const data = duel.engine.cardData(code);
    if (!data || data.attack >= 1300 || data.defense < data.attack + 400) return false;
    const script = duel.engine.readScript(`c${code}.lua`) ?? '';
    return !/EVENT_(SUMMON_SUCCESS|SPSUMMON_SUCCESS)|EFFECT_TYPE_IGNITION/.test(script);
}
/**
 * Whether the bot Sets this monster rather than Normal Summoning it: a Flip monster always, a wall
 * unless its attack would end the duel (the rival's field empty, their LP within its ATK).
 */
function setsRatherThanSummons(duel: DuelSession, team: Team, code: number): boolean {
    if (isFlip(duel, code)) return true;
    if (!isWall(duel, code)) return false;
    const rival = (1 - team) as Team;
    const lethal = duel.monstersOf(rival).length === 0 && duel.view(team).opp.lp <= (duel.engine.cardData(code)?.attack ?? 0);
    return !lethal;
}

// ---- what a pick is for --------------------------------------------------------------------

/** The engine's hints for a pick that hurts the cards picked (HINTMSG_* in constant.lua). */
export const HARM_HINTS = new Set([502, 503, 504, 505, 507, 515, 520, 528, 575, 579]);
/** Hints for a pick that helps the card picked, or brings it to its player (Monster Reborn). */
const HELP_HINTS = new Set([506, 508, 509, 510, 514, 518, 522, 523, 527]);
/** Hints for a cost: Tributes, discards. */
const COST_HINTS = new Set([500, 501, 531]);
type Intent = 'harm' | 'help' | 'cost';

/** Whether a card's effects hurt what they touch (destroy, banish, bounce, take control, negate…), from its script. */
function harmful(duel: DuelSession, code: number): boolean {
    const script = duel.engine.readScript(`c${code}.lua`) ?? '';
    return /CATEGORY_(DESTROY|REMOVE|TODECK|TOGRAVE|CONTROL|DISABLE|NEGATE|POSITION|HANDES)\b/.test(script)
        || (/CATEGORY_TOHAND\b/.test(script) && !/CATEGORY_SEARCH\b/.test(script));
}

function intentOf(duel: DuelSession, team: Team): Intent {
    const hint = duel.selectHintOf(team);
    if (COST_HINTS.has(hint)) return 'cost';
    if (HARM_HINTS.has(hint)) return 'harm';
    if (HELP_HINTS.has(hint)) return hint === 518 && duel.botUsing !== null && duel.effectKind(duel.botUsing) !== 'buff' ? 'harm' : 'help';
    // "Select a target", "select a card": by what the card being used does.
    if (duel.botUsing !== null) return duel.effectKind(duel.botUsing) === 'buff' ? 'help' : harmful(duel, duel.botUsing) ? 'harm' : 'help';
    return 'harm';
}

type Picked = { controller: number; location: number; sequence: number; code: number };

/** What a card is worth to whoever holds it, as the bot sees it. */
function worth(duel: DuelSession, team: Team, c: Picked, guess: number): number {
    if (c.location === L.MZONE) {
        const s = seenBy(team, c.controller, duel.stats(c), guess);
        return 300 + 0.5 * s.atk + 0.2 * s.def;
    }
    if (c.location === L.SZONE) return 420;
    if (!c.code) return 380;
    const data = duel.engine.cardData(c.code);
    if (data && duel.isMonster(c.code)) return 300 + 0.5 * data.attack + 0.2 * data.defense;
    return 400;
}

/** The cards in the order the bot would pick them, best first, for what the pick is for. */
function pickOrder(duel: DuelSession, team: Team, cards: readonly Picked[], intent: Intent, guess: number): number[] {
    const score = (c: Picked) => {
        const w = worth(duel, team, c, guess);
        const mine = c.controller === team;
        // Hurting: the rival's best first; then (only if it must) its own least.
        if (intent === 'harm') return mine ? -100000 - w : w;
        // A cost is paid with the least it has.
        if (intent === 'cost') return mine ? -w : -100000 - w;
        // Helping: a monster of its own (a boost) or whatever is best to bring back (Monster Reborn).
        return c.location === L.MZONE && !mine ? -100000 + w : w;
    };
    return range(cards.length).sort((a, b) => score(cards[b]!) - score(cards[a]!));
}

// ---- plain play ------------------------------------------------------------------------------

/** The bot's plain play: what it does when it doesn't look ahead (and what it plays in the copies). */
export function heuristicAnswer(m: OcgMessage, duel: DuelSession, team: Team, rules: LevelRules = LEVELS.normal): OcgResponse {
    switch (m.type) {
        case M.SELECT_IDLECMD: {
            if (duel.botActions++ < MAX_ACTIONS_PER_TURN) {
                const summon = bestSummon(m, duel, team);
                if (summon !== null) return { type: R.SELECT_IDLECMD, action: I.SELECT_SUMMON, index: summon };
                const fromHand = m.activates.findIndex((a) => a.location === L.HAND && worthUsing(a.code, duel, team));
                if (fromHand >= 0) {
                    duel.botUsing = m.activates[fromHand]!.code;
                    return { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index: fromHand };
                }
                const set = spellToSet(m, duel);
                if (set !== null) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index: set };
                // Set a monster face-down only if it needs no Tribute (and it couldn't summon one): a Flip monster first.
                const sets = m.monster_sets.map((c, i) => ({ i, code: c.code })).filter((x) => duel.level(x.code) < 5);
                const mset = (sets.find((x) => setsRatherThanSummons(duel, team, x.code)) ?? sets[0])?.i ?? -1;
                if (mset >= 0) return { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index: mset };
            }
            return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
        }
        case M.SELECT_BATTLECMD:
            return battle(m, duel, team, rules);
        case M.SELECT_CHAIN: {
            // Only what helps: a boost while its monster is in a battle, a wipe when it's behind,
            // anything else when the engine offers it (traps only come up when their moment is right).
            const pick = m.selects.findIndex((c) => worthUsing(c.code, duel, team, true));
            const index = pick >= 0 ? pick : m.forced && m.selects.length ? 0 : null;
            if (index !== null) duel.botUsing = m.selects[index]!.code;
            return { type: R.SELECT_CHAIN, index };
        }
        case M.SELECT_CARD:
        case M.SELECT_TRIBUTE: {
            // Choosing what to attack: the strongest monster it beats (never one that beats it).
            const attackerAtk = duel.botAttacker;
            duel.botAttacker = null;
            if (m.type === M.SELECT_CARD && attackerAtk !== null && m.selects.every((c) => c.controller !== team && c.location === L.MZONE)) {
                const hidden = (c: (typeof m.selects)[number]) => !(duel.stats(c).position & P.FACEUP);
                const value = (c: (typeof m.selects)[number]) => (rules.attacksHidden === false && hidden(c) ? Infinity : toBeat(seenBy(team, c.controller, duel.stats(c), rules.hiddenGuess)));
                const order = range(m.selects.length).sort((a, b) => value(m.selects[a]!) - value(m.selects[b]!));
                const beaten = order.filter((i) => value(m.selects[i]!) < attackerAtk);
                return { type: R.SELECT_CARD, indicies: [beaten.length ? beaten[beaten.length - 1]! : order[0]!] };
            }
            const intent = m.type === M.SELECT_TRIBUTE ? 'cost' : intentOf(duel, team);
            const order = pickOrder(duel, team, m.selects, intent, rules.hiddenGuess);
            const picked = order.slice(0, Math.max(m.min, 1));
            return m.type === M.SELECT_TRIBUTE ? { type: R.SELECT_TRIBUTE, indicies: picked } : { type: R.SELECT_CARD, indicies: picked };
        }
        case M.SELECT_UNSELECT_CARD: {
            if (m.unselect_cards.length >= m.min && m.can_finish) return { type: R.SELECT_UNSELECT_CARD, index: null };
            if (!m.select_cards.length) return { type: R.SELECT_UNSELECT_CARD, index: null };
            const order = pickOrder(duel, team, m.select_cards, intentOf(duel, team), rules.hiddenGuess);
            return { type: R.SELECT_UNSELECT_CARD, index: order[0]! };
        }
        case M.SELECT_SUM: {
            // Cards whose levels (or other amounts) add up to the number: exactly, or (select_max set) at
            // least, with none to spare. The fewest, and the ones it can best do without.
            const must = range(m.selects_must.length);
            const rank = new Map(pickOrder(duel, team, m.selects, 'cost', rules.hiddenGuess).map((i, r) => [i, r]));
            const picked = sumPick(m.selects_must.map((c) => c.amount), m.selects.map((c) => c.amount), m.amount, m.select_max !== 0, m.min, m.max, (i) => rank.get(i) ?? i);
            return { type: R.SELECT_SUM, indicies: [...must, ...(picked ?? []).map((i) => m.selects_must.length + i)] };
        }
        case M.SELECT_EFFECTYN:
            return { type: R.SELECT_EFFECTYN, yes: true };
        case M.SELECT_YESNO:
            return { type: R.SELECT_YESNO, yes: true };
        case M.SELECT_OPTION:
            return { type: R.SELECT_OPTION, index: 0 };
        case M.SELECT_POSITION: {
            const strong = duel.isMonster(m.code) && duel.baseAttack(m.code) >= 1500;
            const prefer = strong ? [P.FACEUP_ATTACK, P.FACEUP_DEFENSE, P.FACEDOWN_DEFENSE] : [P.FACEUP_DEFENSE, P.FACEDOWN_DEFENSE, P.FACEUP_ATTACK];
            return { type: R.SELECT_POSITION, position: [...prefer, P.FACEDOWN_ATTACK].find((p) => m.positions & p)! };
        }
        case M.ANNOUNCE_NUMBER:
            return { type: R.ANNOUNCE_NUMBER, value: 0 };
        case M.ANNOUNCE_RACE: {
            const bits = range(32).map((i) => 1n << BigInt(i)).filter((b) => BigInt(m.available) & b).slice(0, m.count);
            return { type: R.ANNOUNCE_RACE, races: bits as never };
        }
        case M.ANNOUNCE_ATTRIB: {
            const bits = range(8).map((i) => 1 << i).filter((b) => Number(m.available) & b).slice(0, m.count);
            return { type: R.ANNOUNCE_ATTRIB, attributes: bits as never };
        }
        case M.ANNOUNCE_CARD:
            return { type: R.ANNOUNCE_CARD, card: announceCard(duel, team) };
        default:
            throw new Error(`The practice bot can't answer engine message ${m.type}`);
    }
}

type IdleMsg = Extract<OcgMessage, { type: M.SELECT_IDLECMD }>;
type BattleMsg = Extract<OcgMessage, { type: M.SELECT_BATTLECMD }>;
type ChainMsg = Extract<OcgMessage, { type: M.SELECT_CHAIN }>;

/** The strongest monster worth summoning (a Tribute Summon only for one stronger than what it gives up). */
/** A card's amounts: the low half, and the high half when it has a second (a level it can also count as). */
const amounts = (a: number) => (a >>> 16 ? [a & 0xffff, a >>> 16] : [a & 0xffff]);

/**
 * The cards of `free` to pick, with the `must` ones, so their amounts add up to `target` (or, `atLeast`,
 * reach it with no card to spare), counting min..max cards in all; the cheapest by `cost` among the
 * fewest. Null when no set works.
 */
export function sumPick(must: number[], free: number[], target: number, atLeast: boolean, min: number, max: number, cost: (i: number) => number): number[] | null {
    const totals = (list: number[]): number[][] => list.reduce<number[][]>((acc, a) => acc.flatMap((t) => amounts(a).map((v) => [...t, v])), [[]]);
    const fits = (vals: number[]): boolean => {
        const sum = vals.reduce((a, b) => a + b, 0);
        return atLeast ? sum >= target && vals.every((v) => sum - v < target) : sum === target;
    };
    const lo = Math.max(min || 1, must.length), hi = Math.min(max || must.length + free.length, must.length + free.length);
    const n = Math.min(free.length, 16);
    let best: number[] | null = null, bestScore = Infinity;
    for (let mask = 0; mask < 1 << n; mask++) {
        const chosen = range(n).filter((i) => mask & (1 << i));
        const count = must.length + chosen.length;
        if (count < lo || count > hi) continue;
        const score = count * 1000 + chosen.reduce((a, i) => a + cost(i), 0);
        if (score >= bestScore) continue;
        if (totals([...must, ...chosen.map((i) => free[i]!)]).some(fits)) { best = chosen; bestScore = score; }
    }
    return best;
}

function bestSummon(m: IdleMsg, duel: DuelSession, team: Team): number | null {
    const mine = duel.monstersOf(team).map((x) => x.atk).sort((x, y) => x - y);
    const worthIt = (code: number, atk: number) => {
        const level = duel.level(code);
        const need = level >= 7 ? 2 : level >= 5 ? 1 : 0;
        return need === 0 || (mine.length >= need && atk > Math.max(...mine.slice(0, need)));
    };
    const ok = m.summons.map((c, i) => ({ i, atk: duel.stats(c).atk })).filter((x) => !setsRatherThanSummons(duel, team, m.summons[x.i]!.code) && worthIt(m.summons[x.i]!.code, x.atk));
    return ok.length ? ok.reduce((b, x) => (x.atk >= b.atk ? x : b)).i : null;
}

/** A Trap or Quick-Play Spell to Set (a Spell it could use later is kept in hand). */
function spellToSet(m: IdleMsg, duel: DuelSession): number | null {
    const i = m.spell_sets.findIndex((c) => {
        const type = duel.engine.cardData(c.code)?.type ?? 0;
        return (type & TYPE_TRAP) !== 0 || ((type & TYPE_SPELL) !== 0 && (type & TYPE_QUICKPLAY) !== 0);
    });
    return i >= 0 ? i : null;
}

/**
 * The attack to make: the strongest attacker that beats something it can see (a direct attack
 * when the rival has no monster), or none.
 */
function battle(m: BattleMsg, duel: DuelSession, team: Team, rules: LevelRules): OcgResponse {
    const rival = (1 - team) as Team;
    const theirs = duel.monstersOf(rival).map((t) => seenBy(team, rival, t, rules.attacksHidden === false && !(t.position & P.FACEUP) ? Infinity : rules.hiddenGuess));
    const hidden = duel.monstersOf(rival).filter((t) => !(t.position & P.FACEUP)).length;
    const setCards = rules.wary ? duel.view(team).opp.spells.filter((s) => s && !s.faceUp).length : 0;
    const attackers = range(m.attacks.length)
        .map((i) => ({ i, atk: duel.stats(m.attacks[i]!).atk, direct: m.attacks[i]!.can_direct }))
        .sort((a, b) => b.atk - a.atk);
    for (const a of attackers) {
        if (a.direct || !theirs.length) return attackWith(m, duel, a.i, a.atk);
        const beatable = theirs.filter((t) => toBeat(t) < a.atk);
        // Careful (hard): into face-down monsters only with a clear margin while Set cards wait.
        const onlyHidden = beatable.length > 0 && beatable.length <= hidden && beatable.every((t) => !(t.position & P.FACEUP));
        if (beatable.length && !(rules.wary && onlyHidden && setCards >= 2 && a.atk < rules.hiddenGuess + 400)) return attackWith(m, duel, a.i, a.atk);
    }
    // An attack it must make (an effect forces it: no way on to Main Phase 2 or the End Phase): its strongest.
    if (!m.to_m2 && !m.to_ep && attackers.length) return attackWith(m, duel, attackers[0]!.i, attackers[0]!.atk);
    return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? B.TO_M2 : B.TO_EP, index: null };
}

function attackWith(m: BattleMsg, duel: DuelSession, index: number, atk: number): OcgResponse {
    duel.botAttacker = atk;
    void m;
    return { type: R.SELECT_BATTLECMD, action: B.SELECT_BATTLE, index };
}

/** For "declare a card name": a card the rival has shown (the one seen most), else Raigeki. */
function announceCard(duel: DuelSession, team: Team): number {
    const opp = duel.view(team).opp;
    const seen = new Map<number, number>();
    for (const c of [...opp.grave, ...opp.banished, ...opp.monsters, ...opp.spells]) if (c?.code) seen.set(c.code, (seen.get(c.code) ?? 0) + 1);
    let best = 12580477, n = 0;
    for (const [code, count] of seen) if (count > n) [best, n] = [code, count];
    return best;
}

/**
 * Whether the bot should use a card now (plain play): a boost only for a face-up monster of its
 * own (and, as a response, only in a battle), a wipe of both sides only when the rival has more
 * on the field, a Continuous Trap on the rival's turn.
 */
function worthUsing(code: number, duel: DuelSession, team: Team, responding = false): boolean {
    if (responding && duel.isContinuousTrap(code)) {
        return duel.currentTurnPlayer !== team && duel.monstersOf((1 - team) as Team).some((x) => x.position & P.FACEUP);
    }
    const kind = duel.effectKind(code);
    if (kind === 'buff') {
        const own = duel.monstersOf(team).some((x) => x.position & P.FACEUP);
        return own && (!responding || duel.currentPhase === 'BP');
    }
    if (kind === 'wipe') {
        const total = (t: Team) => duel.monstersOf(t).map((x) => seenBy(team, t, x)).reduce((n, x) => n + Math.max(x.atk, x.def, 1000), 0);
        return total((1 - team) as Team) > total(team);
    }
    return true;
}

// ---- looking ahead ---------------------------------------------------------------------------

/** In the copies the bot plays on in: its plain play, and nobody responds unless they must. */
function simPolicy(m: OcgMessage, duel: DuelSession, team: Team): OcgResponse {
    if (m.type === M.SELECT_CHAIN && !m.forced) return { type: R.SELECT_CHAIN, index: null };
    return heuristicAnswer(m, duel, team, IN_COPIES);
}

/** A number in [0, 1) from the duel's seed and how far it's gone: the same every time it's asked. */
function chance(duel: DuelSession, salt: number): number {
    let h = 2166136261 ^ salt;
    for (const ch of `${duel.setup.seed[0]}:${duel.answers.length}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return ((h >>> 0) % 10000) / 10000;
}

type Try = { response: OcgResponse; using?: number; /** For the lab's debug output. */ label?: string };

/** Of the plays to try, the one to make (or null for none better than doing nothing). */
function choose(duel: DuelSession, team: Team, tries: Try[], baseline: number, margin: number, firstSound: boolean, through = false): Try | null {
    let best: Try | null = null, bestScore = baseline + margin;
    for (const [i, t] of tries.entries()) {
        if (i > 0 && timeUp()) break;
        const score = simulate(duel, team, t.response, simPolicy, through);
        if (debugging) console.log(`      t${duel.view(team).turn} try ${t.label ?? JSON.stringify(t.response)}: ${score?.toFixed(0)} (pass ${baseline.toFixed(0)})`);
        if (score === null) continue;
        if (firstSound && score > baseline + margin) return t;
        if (score > bestScore) [best, bestScore] = [t, score];
    }
    return best;
}

function idle(m: IdleMsg, duel: DuelSession, team: Team, rules: LevelRules): OcgResponse {
    if (duel.botActions++ >= MAX_ACTIONS_PER_TURN) return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
    const tries: Try[] = [];
    const seen = new Set<string>();
    const add = (action: I, index: number, key: string, using?: number) => {
        if (seen.has(key)) return;
        seen.add(key);
        const pool = [m.summons, m.special_summons, m.pos_changes, m.monster_sets, m.spell_sets, m.activates][action];
        const label = `${['summon', 'special', 'flip', 'set', 'set s/t', 'activate'][action]} ${duel.engine.name(pool?.[index]?.code ?? 0)}`;
        tries.push({ response: { type: R.SELECT_IDLECMD, action, index }, using, label });
    };
    // A summon first: of two plays that score the same, the summon is made.
    m.summons.forEach((c, i) => {
        if (!setsRatherThanSummons(duel, team, c.code)) add(I.SELECT_SUMMON, i, `s${c.code}`);
    });
    m.special_summons.forEach((c, i) => add(I.SELECT_SPECIAL_SUMMON, i, `p${c.code}:${c.location}`));
    const overlook = chance(duel, 1) < rules.overlook;
    m.activates.forEach((c, i) => {
        if (overlook && c.location === L.HAND) return;
        add(I.SELECT_ACTIVATE, i, `a${c.code}:${c.location}:${c.description}`, c.code);
    });
    m.monster_sets.forEach((c, i) => add(I.SELECT_MONSTER_SET, i, `m${c.code}`));
    // Flip Summons (a face-down monster turned face-up).
    m.pos_changes.forEach((c, i) => {
        if (!(duel.stats(c).position & P.FACEDOWN)) return;
        add(I.SELECT_POS_CHANGE, i, `f${c.code}:${c.sequence}`);
    });
    // Doing nothing more: on to the Battle Phase (or the end of the turn). Looking through, that's
    // played out too, so the plays and the pass are scored at the same point.
    const pass: OcgResponse = { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
    const baseline = rules.through ? simulate(duel, team, pass, simPolicy, true) : null;
    const best = choose(duel, team, tries, baseline ?? evaluate(duel.view(team), duel.engine), rules.idleMargin, rules.firstSound, rules.through && baseline !== null);
    if (best) {
        duel.botUsing = best.using ?? null;
        return best.response;
    }
    const set = spellToSet(m, duel);
    if (set !== null) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index: set };
    return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
}

function chain(m: ChainMsg, duel: DuelSession, team: Team, rules: LevelRules): OcgResponse {
    if (m.forced || !m.selects.length) return heuristicAnswer(m, duel, team, rules);
    const tries: Try[] = [];
    const seen = new Set<string>();
    m.selects.forEach((c, i) => {
        const key = `${c.code}:${c.description}`;
        // Easy: only what plain play would use (still never a harmful play).
        if (seen.has(key) || tries.length >= MAX_CHAIN_TRIES || (rules.firstSound && !worthUsing(c.code, duel, team, true))) return;
        seen.add(key);
        tries.push({ response: { type: R.SELECT_CHAIN, index: i }, using: c.code });
    });
    if (!tries.length) return { type: R.SELECT_CHAIN, index: null };
    const pass = simulate(duel, team, { type: R.SELECT_CHAIN, index: null }, simPolicy);
    if (pass === null) return heuristicAnswer(m, duel, team, rules);
    const best = choose(duel, team, tries, pass, rules.chainMargin, rules.firstSound);
    duel.botUsing = best?.using ?? null;
    return best?.response ?? { type: R.SELECT_CHAIN, index: null };
}

/** Of a few answers, the one whose outcome scores best (the first on a tie), or null if none could be tried. */
function weigh(duel: DuelSession, team: Team, answers: OcgResponse[]): OcgResponse | null {
    let best: OcgResponse | null = null, bestScore = -Infinity;
    for (const [i, a] of answers.entries()) {
        if (i > 0 && timeUp()) break;
        const score = simulate(duel, team, a, simPolicy);
        if (score !== null && score > bestScore) [best, bestScore] = [a, score];
    }
    return best;
}

export function botAnswer(m: OcgMessage, duel: DuelSession, team: Team, solo = false): OcgResponse {
    // Solo practice: the opponent never acts. It ends its turns and never chains; anything it
    // must answer (a hand-size discard) it answers like the bot.
    if (solo) {
        if (m.type === M.SELECT_IDLECMD) return { type: R.SELECT_IDLECMD, action: m.to_ep ? I.TO_EP : I.TO_BP, index: null };
        if (m.type === M.SELECT_BATTLECMD) return { type: R.SELECT_BATTLECMD, action: m.to_ep ? B.TO_EP : B.TO_M2, index: null };
        if (m.type === M.SELECT_CHAIN && !m.forced) return { type: R.SELECT_CHAIN, index: null };
        if (m.type === M.SELECT_EFFECTYN) return { type: R.SELECT_EFFECTYN, yes: false };
        return heuristicAnswer(m, duel, team);
    }
    if (duel.setup.botLevel === 'plain') return heuristicAnswer(m, duel, team);
    deadline = performance.now() + botTuning.budgetMs;
    const rules = LEVELS[duel.setup.botLevel ?? 'normal'];
    switch (m.type) {
        case M.SELECT_IDLECMD:
            return idle(m, duel, team, rules);
        case M.SELECT_CHAIN:
            return chain(m, duel, team, rules);
        case M.SELECT_EFFECTYN:
            if (rules.weighChoices) return weigh(duel, team, [{ type: R.SELECT_EFFECTYN, yes: true }, { type: R.SELECT_EFFECTYN, yes: false }]) ?? heuristicAnswer(m, duel, team, rules);
            break;
        case M.SELECT_YESNO:
            if (rules.weighChoices) return weigh(duel, team, [{ type: R.SELECT_YESNO, yes: true }, { type: R.SELECT_YESNO, yes: false }]) ?? heuristicAnswer(m, duel, team, rules);
            break;
        case M.SELECT_OPTION:
            if (rules.weighChoices && m.options.length > 1) return weigh(duel, team, m.options.map((_, index) => ({ type: R.SELECT_OPTION, index }))) ?? heuristicAnswer(m, duel, team, rules);
            break;
        case M.SELECT_CARD: {
            // One card to pick for an effect (not an attack target, which hides what it would show):
            // try each, up to 8, in the order plain play would pick them.
            if (!rules.weighChoices || duel.botAttacker !== null || m.min !== 1 || m.max !== 1 || m.selects.length < 2 || m.selects.length > 8) break;
            const order = pickOrder(duel, team, m.selects, intentOf(duel, team), rules.hiddenGuess);
            const best = weigh(duel, team, order.map((i) => ({ type: R.SELECT_CARD, indicies: [i] })));
            if (best) {
                duel.botUsing = null;
                return best;
            }
            break;
        }
    }
    return heuristicAnswer(m, duel, team, rules);
}
