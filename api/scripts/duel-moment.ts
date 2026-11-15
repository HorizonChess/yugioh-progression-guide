// For browser drivers: plays the test API's newest duel on, from where it stands, to a moment a
// driver wants to test, and stores the answers there (the page, reloaded, picks the game up at it).
// The player's side is scripted for the moment; the bot's side plays as the bot.
//
//   npx tsx scripts/duel-moment.ts <api base> bls|breaker
//     bls: Graceful Charity discards a LIGHT and a DARK, Black Luster Soldier is Special Summoned,
//          and the game stops at the player's Battle Phase with it ready to attack a monster.
//     breaker: Breaker the Magical Warrior is Normal Summoned (a Spell Counter on it), and the game
//          stops at the player's next question.
import { OcgMessageType as M, OcgResponseType as R, SelectIdleCMDAction as I, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import { botAnswer, heuristicAnswer } from '@ygo/duel/bot';
import { decodeAnswer, encodeAnswer } from '@ygo/duel/answers';
import { DuelSession, type DuelSetup, type Team } from '@ygo/duel/session';
import { loadEngine } from '../src/duel/engine';

const [base = 'http://localhost:4100', moment = 'bls'] = process.argv.slice(2);
if (moment !== 'bls' && moment !== 'breaker') throw new Error(`No moment "${moment}"`);
const latest = (await (await fetch(`${base}/__test/duels/latest`)).json()) as { id: string; setup: DuelSetup; answers: string[] };
const stored = latest.answers.map(decodeAnswer);
const engine = await loadEngine();
const you = latest.setup.bots.indexOf(false) as Team;
const BLS = [72989439, 72989440, 504700118];
const CHARITY = 79571449, BREAKER = 71413901;
const LIGHT = 16, DARK = 32;
class Stop extends Error {}

const isBls = (code: number) => BLS.includes(code) || /^Black Luster Soldier - Envoy of the Beginning/.test(engine.name(code));
const attribute = (code: number) => engine.cardData(code)?.attribute ?? 0;

function yours(m: OcgMessage, d: DuelSession): OcgResponse {
    if (moment === 'breaker') {
        if (d.monstersOf(you).some((c) => c.code === BREAKER)) throw new Stop();
        if (m.type === M.SELECT_IDLECMD) {
            const summon = m.summons.findIndex((c) => c.code === BREAKER);
            if (summon >= 0) return { type: R.SELECT_IDLECMD, action: I.SELECT_SUMMON, index: summon };
        }
    }
    if (m.type === M.SELECT_IDLECMD) {
        const sp = m.special_summons.findIndex((c) => isBls(c.code));
        if (sp >= 0) return { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index: sp };
        const charity = m.activates.findIndex((c) => c.code === CHARITY);
        if (charity >= 0) return { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index: charity };
        const blsOut = d.monstersOf(you).some((c) => isBls(c.code));
        if (blsOut && m.to_bp && d.monstersOf((1 - you) as Team).length) return { type: R.SELECT_IDLECMD, action: I.TO_BP, index: null };
        // Holding on meanwhile: a monster Set to defend (the toughest), never Black Luster Soldier.
        const sets = m.monster_sets.map((c, i) => ({ i, code: c.code })).filter((x) => !isBls(x.code) && engine.cardData(x.code)!.level <= 4);
        if (sets.length) {
            const best = sets.reduce((a, b) => (engine.cardData(b.code)!.defense > engine.cardData(a.code)!.defense ? b : a));
            return { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index: best.i };
        }
        return { type: R.SELECT_IDLECMD, action: m.to_ep ? I.TO_EP : I.TO_BP, index: null };
    }
    if (m.type === M.SELECT_BATTLECMD) {
        if (m.attacks.some((a) => isBls(a.code)) && d.monstersOf((1 - you) as Team).length) throw new Stop();
        return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? 2 : 3, index: null };
    }
    if (m.type === M.SELECT_CHAIN) return { type: R.SELECT_CHAIN, index: m.forced && m.selects.length ? 0 : null };
    if (m.type === M.SELECT_CARD && m.min === 2 && m.max === 2 && m.selects.every((c) => c.location === 2)) {
        // Graceful Charity's discard: a LIGHT and a DARK monster (never Black Luster Soldier).
        const light = m.selects.findIndex((c) => !isBls(c.code) && attribute(c.code) === LIGHT);
        const dark = m.selects.findIndex((c) => !isBls(c.code) && attribute(c.code) === DARK);
        const rest = m.selects.map((_, i) => i).filter((i) => i !== light && i !== dark && !isBls(m.selects[i]!.code));
        const picks = [light, dark].filter((i) => i >= 0).concat(rest).slice(0, 2);
        return { type: R.SELECT_CARD, indicies: picks };
    }
    return heuristicAnswer(m, d, you);
}

const answerer = (m: OcgMessage, d: DuelSession, t: Team): OcgResponse => {
    if (d.answers.length < stored.length) return stored[d.answers.length]!;
    if (d.view(you).turn > 30) throw new Error('No moment by turn 30');
    return t === you ? yours(m, d) : botAnswer(m, d, t);
};
const duel = new DuelSession(engine, { ...latest.setup, bots: [true, true], solo: false }, { answerer });
try {
    duel.start();
    throw new Error(`The duel ended first: ${JSON.stringify(duel.result)}`);
} catch (e) {
    if (!(e instanceof Stop)) throw e;
}
const answers = duel.answers.map(encodeAnswer);
const res = await fetch(`${base}/__test/duels/${latest.id}/answers`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) });
if (!res.ok) throw new Error(`Storing the answers failed (${res.status})`);
console.log(JSON.stringify({ duelId: latest.id, answers: answers.length, from: stored.length, turn: duel.view(you).turn }));
