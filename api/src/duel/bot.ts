import {
    OcgLocation as L, OcgMessageType as M, OcgPosition as P, OcgResponseType as R, SelectBattleCMDAction as B, SelectIdleCMDAction as I,
    type OcgMessage, type OcgResponse,
} from 'ocgcore-wasm';
import type { DuelSession, Team } from './session';

/*
 * The practice opponent: plain, legal play. It summons its strongest monster, plays its
 * spells and sets its traps, attacks only what it can beat, and always chains when it can.
 * Questions the server answers for everyone (zones, ordering) never reach it.
 */

const MAX_ACTIONS_PER_TURN = 12;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function botAnswer(m: OcgMessage, duel: DuelSession, team: Team): OcgResponse {
    switch (m.type) {
        case M.SELECT_IDLECMD: {
            if (duel.botActions++ < MAX_ACTIONS_PER_TURN) {
                if (m.summons.length) {
                    const best = m.summons.reduce((b, c, i, all) => (duel.stats(c).atk >= duel.stats(all[b]!).atk ? i : b), 0);
                    return { type: R.SELECT_IDLECMD, action: I.SELECT_SUMMON, index: best };
                }
                if (m.special_summons.length) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index: 0 };
                const fromHand = m.activates.findIndex((a) => a.location === L.HAND);
                if (fromHand >= 0) return { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index: fromHand };
                if (m.spell_sets.length) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index: 0 };
                if (m.monster_sets.length && !m.summons.length) return { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index: 0 };
            }
            return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
        }
        case M.SELECT_BATTLECMD: {
            const theirs = duel.monstersOf((1 - team) as Team);
            const weakest = Math.min(...theirs.map((t) => ((t.position & P.ATTACK) && (t.position & P.FACEUP) ? t.atk : t.def)));
            const attacker = m.attacks.findIndex((a) => a.can_direct || duel.stats(a).atk > weakest);
            if (attacker >= 0) return { type: R.SELECT_BATTLECMD, action: B.SELECT_BATTLE, index: attacker };
            return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? B.TO_M2 : B.TO_EP, index: null };
        }
        case M.SELECT_CHAIN:
            return { type: R.SELECT_CHAIN, index: m.selects.length ? 0 : null };
        case M.SELECT_CARD:
        case M.SELECT_TRIBUTE: {
            // Its own cards (tributes, costs): the weakest first. The rival's (targets): the strongest first.
            const score = (c: (typeof m.selects)[number]) => {
                const s = c.location === L.MZONE ? duel.stats(c).atk : 0;
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
