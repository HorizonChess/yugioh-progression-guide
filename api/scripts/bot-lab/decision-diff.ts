// Bot lab: where two levels decide differently, at the same positions (one level plays the game, the
// other's answer is worked out alongside). Main Phase decisions only.
//   GUESS=idle npx tsx scripts/bot-lab/decision-diff.ts <playing> <other> [games = 4]
import { OcgMessageType as M, OcgResponseType as R, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer } from '@ygo/duel/bot';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const [playing = 'hard', other = 'expert', gamesArg = '4'] = process.argv.slice(2);
const engine = await loadEngine();
engine.simCore();
while (!engine.simCore()) await new Promise((r) => setTimeout(r, 10));
const POOL = DUELISTS.filter((d) => d.level !== 'easy').flatMap((d) => d.eras.flatMap((e) => [e.id, ...(e.competitive ? [`${e.id}+`] : [])].map((era) => duelistDeck(d, era).deck)));
const IDLE = ['summon', 'special', 'reposition', 'set monster', 'set s/t', 'activate', 'to BP', 'to EP'];
const what = (m: Extract<OcgMessage, { type: M.SELECT_IDLECMD }>, r: OcgResponse) => {
    if (r.type !== R.SELECT_IDLECMD) return '?';
    const pools = [m.summons, m.special_summons, m.pos_changes, m.monster_sets, m.spell_sets, m.activates] as { code: number }[][];
    const c = r.index !== null ? pools[r.action]?.[r.index] : undefined;
    const act = r.action === 6 || r.action === 7 ? 'pass' : IDLE[r.action];
    return `${act}${c ? ' ' + engine.name(c.code) : ''}`;
};
const tally = new Map<string, number>();
let n = 0, differ = 0;
for (let g = Number(process.env.FROM ?? 0); g < Number(process.env.FROM ?? 0) + Number(gamesArg); g++) {
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        Object.assign(d.setup, { botLevel: playing });
        if (m.type !== M.SELECT_IDLECMD || t !== 0) return botAnswer(m, d, t);
        const state = d.saveState();
        Object.assign(d.setup, { botLevel: other });
        if (process.env.BOT_DEBUG) console.log(`  -- ${other} at t${d.view(t).turn} ${d.view(t).phase}`);
        const theirs = botAnswer(m, d, t);
        d.loadState(state);
        Object.assign(d.setup, { botLevel: playing });
        const mine = botAnswer(m, d, t);
        n++;
        const a = what(m, mine), b = what(m, theirs);
        if (a !== b) {
            differ++;
            const kind = `${a.split(' ')[0]} -> ${b.split(' ')[0]}`;
            tally.set(kind, (tally.get(kind) ?? 0) + 1);
            if (differ <= 25) console.log(`t${d.view(t).turn} ${d.view(t).phase}: ${playing} ${a} | ${other} ${b}`);
        }
        return mine;
    };
    const duel = new DuelSession(engine, { seed: [String(88000 + g), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [POOL[(g * 5 + 1) % POOL.length]!, POOL[(g * 7 + 4) % POOL.length]!], names: ['A', 'B'], bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    try { duel.start(); } catch (e) { console.log('error', (e as Error).message); }
}
console.log(`${n} Main Phase decisions, ${differ} differ:`, Object.fromEntries([...tally].sort((a, b) => b[1] - a[1])));
