import {
    OcgLocation as L, OcgMessageType as M, OcgPosition as P, OcgResponseType as R, SelectBattleCMDAction as B, SelectIdleCMDAction as I,
    type OcgMessage, type OcgResponse,
} from 'ocgcore-wasm';
import type { DuelSession, Team } from './session';

/*
 * The practice opponent: plain, legal play. It summons its strongest monster, plays its
 * spells and sets its traps, attacks only what it can beat, and always chains when it can.
 * Questions the server answers for everyone (zones, ordering) never reach it. It sees what a
 * player at the table would: the rival's face-down monsters are guesses, and it never looks at
 * the rival's hand, deck or set cards.
 */

const MAX_ACTIONS_PER_TURN = 12;
/**
 * What the bot takes a face-down monster of the rival's to be worth: it plays from what a player
 * at the table could see, so a set monster's ATK and DEF are unknown. About what a monster set
 * in defense held in the early sets.
 */
const HIDDEN_GUESS = 1400;
type Seen = { atk: number; def: number; position: number };
/** A monster as `viewer` sees it: the rival's face-down ones are a guess, never their real stats. */
const seenBy = (viewer: Team, controller: number, st: Seen): Seen =>
    controller !== viewer && !(st.position & P.FACEUP) ? { atk: HIDDEN_GUESS, def: HIDDEN_GUESS, position: st.position } : st;
/** What it takes to beat a monster in battle: ATK in Attack Position, DEF otherwise. */
const toBeat = (st: Seen) => ((st.position & P.ATTACK) && (st.position & P.FACEUP) ? st.atk : st.def);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function botAnswer(m: OcgMessage, duel: DuelSession, team: Team, solo = false): OcgResponse {
    // Solo practice: the opponent never acts. It ends its turns and never chains; anything it
    // must answer (a hand-size discard) it answers like the bot.
    if (solo) {
        if (m.type === M.SELECT_IDLECMD) return { type: R.SELECT_IDLECMD, action: m.to_ep ? I.TO_EP : I.TO_BP, index: null };
        if (m.type === M.SELECT_BATTLECMD) return { type: R.SELECT_BATTLECMD, action: m.to_ep ? B.TO_EP : B.TO_M2, index: null };
        if (m.type === M.SELECT_CHAIN && !m.forced) return { type: R.SELECT_CHAIN, index: null };
        if (m.type === M.SELECT_EFFECTYN) return { type: R.SELECT_EFFECTYN, yes: false };
    }
    switch (m.type) {
        case M.SELECT_IDLECMD: {
            if (duel.botActions++ < MAX_ACTIONS_PER_TURN) {
                // A Tribute Summon only for a monster stronger than what it gives up.
                const mine = duel.monstersOf(team).map((x) => x.atk).sort((x, y) => x - y);
                const worth = (code: number, atk: number) => {
                    const level = duel.level(code);
                    const need = level >= 7 ? 2 : level >= 5 ? 1 : 0;
                    return need === 0 || (mine.length >= need && atk > Math.max(...mine.slice(0, need)));
                };
                const summons = m.summons.map((c, i) => ({ i, atk: duel.stats(c).atk, ok: worth(c.code, duel.stats(c).atk) })).filter((x) => x.ok);
                if (summons.length) {
                    const best = summons.reduce((b, x) => (x.atk >= b.atk ? x : b));
                    return { type: R.SELECT_IDLECMD, action: I.SELECT_SUMMON, index: best.i };
                }
                if (m.special_summons.length) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index: 0 };
                const fromHand = m.activates.findIndex((a) => a.location === L.HAND && worthUsing(a.code, duel, team));
                if (fromHand >= 0) {
                    duel.botUsing = m.activates[fromHand]!.code;
                    return { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index: fromHand };
                }
                if (m.spell_sets.length) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index: 0 };
                // Set a monster face-down only if it needs no Tribute (and it couldn't summon one).
                const set = m.monster_sets.findIndex((c) => duel.level(c.code) < 5);
                if (set >= 0 && !summons.length) return { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index: set };
            }
            return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
        }
        case M.SELECT_BATTLECMD: {
            const theirs = duel.monstersOf((1 - team) as Team).map((t) => seenBy(team, 1 - team, t));
            const weakest = Math.min(...theirs.map(toBeat));
            const attacker = m.attacks.findIndex((a) => a.can_direct || duel.stats(a).atk > weakest);
            if (attacker >= 0) {
                duel.botAttacker = duel.stats(m.attacks[attacker]!).atk;
                return { type: R.SELECT_BATTLECMD, action: B.SELECT_BATTLE, index: attacker };
            }
            return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? B.TO_M2 : B.TO_EP, index: null };
        }
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
                const value = (c: (typeof m.selects)[number]) => toBeat(seenBy(team, c.controller, duel.stats(c)));
                const order = range(m.selects.length).sort((a, b) => value(m.selects[a]!) - value(m.selects[b]!));
                const beaten = order.filter((i) => value(m.selects[i]!) < attackerAtk);
                return { type: R.SELECT_CARD, indicies: [beaten.length ? beaten[beaten.length - 1]! : order[0]!] };
            }
            // Its own cards (tributes, costs): the weakest first. The rival's (targets): the strongest first.
            // A boost goes the other way: onto its own strongest monster.
            const boosting = m.type === M.SELECT_CARD && duel.botUsing !== null && duel.effectKind(duel.botUsing) === 'buff';
            duel.botUsing = null;
            const score = (c: (typeof m.selects)[number]) => {
                const s = c.location === L.MZONE ? seenBy(team, c.controller, duel.stats(c)).atk : 0;
                if (boosting) return c.controller === team ? -s - 100000 : s;
                return c.controller === team ? s : -s;
            };
            const order = range(m.selects.length).sort((a, b) => score(m.selects[a]!) - score(m.selects[b]!));
            const picked = order.slice(0, Math.max(m.min, 1));
            return m.type === M.SELECT_TRIBUTE ? { type: R.SELECT_TRIBUTE, indicies: picked } : { type: R.SELECT_CARD, indicies: picked };
        }
        case M.SELECT_UNSELECT_CARD:
            return { type: R.SELECT_UNSELECT_CARD, index: m.unselect_cards.length >= m.min && m.can_finish ? null : m.select_cards.length ? 0 : null };
        case M.SELECT_SUM: {
            let total = 0;
            const picked: number[] = range(m.selects_must.length);
            for (const c of m.selects_must) total += c.amount & 0xffff;
            for (let i = 0; i < m.selects.length && total < m.amount; i++) {
                picked.push(m.selects_must.length + i);
                total += m.selects[i]!.amount & 0xffff;
            }
            return { type: R.SELECT_SUM, indicies: picked };
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
            // Any real card: Dark Magician.
            return { type: R.ANNOUNCE_CARD, card: 46986414 };
        default:
            throw new Error(`The practice bot can't answer engine message ${m.type}`);
    }
}

/**
 * Whether the bot should use a card now: a boost only for a face-up monster of its own (and, as a
 * response, only in a battle), a wipe of both sides only when the rival has more on the field, a
 * Continuous Trap on the rival's turn.
 */
function worthUsing(code: number, duel: DuelSession, team: Team, responding = false): boolean {
    // A Continuous Trap waits for the rival's turn, when they have a monster for it to work on
    // (flipped any earlier it only shows itself).
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
