// Bot lab: how often the bot does nothing with its turn, with the duelists' own decks.
//   npx tsx scripts/bot-lab/passes.ts [level] [games] [duelist:era,duelist:era,...]
// Each game pits two duelist decks (both the same level). Prints, per deck, the turns it took no
// action in its Main Phases though it had one (a summon, a Set, a card to activate), the turns it
// had a monster to attack with and didn't, and how long it thought.
import { OcgMessageType as M, OcgResponseType as R, SelectIdleCMDAction as I, SelectBattleCMDAction as B, type OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer, heuristicAnswer, type BotLevel } from '@ygo/duel/bot';
import { simStats, simulate } from '@ygo/duel/bot-sim';
import { evaluate } from '@ygo/duel/bot-eval';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const [level = 'hard', games = '12', only] = process.argv.slice(2);
const engine = await loadEngine();
const decks = (only ? only.split(',') : DUELISTS.flatMap((d) => d.eras.flatMap((e) => [`${d.id}:${e.id}`, ...(e.competitive ? [`${d.id}:${e.id}+`] : [])])))
    .map((key) => { const [id, era] = key.split(':'); return { key, deck: duelistDeck(DUELISTS.find((d) => d.id === id)!, era).deck }; });

type Turn = { options: number; actions: number; attackers: number; attacks: number; hand: string[]; board: string; did: string[] };
const perDeck = new Map<string, { turns: number; idle: number; noAttack: number; games: number; wins: number }>();
const idleSamples: string[] = [], quietSamples: string[] = [];
const times: number[] = [];
// PROBE=n: at the first n turns it passes with plays in hand, how each play scored (looking through
// the Main Phase, and to just after it), against passing.
let probes = Number(process.env.PROBE ?? 0);
const plain = (m: OcgMessage, d: DuelSession, t: Team) => (m.type === M.SELECT_CHAIN && !m.forced ? { type: R.SELECT_CHAIN, index: null } as const : heuristicAnswer(m, d, t));
function probe(m: Extract<OcgMessage, { type: M.SELECT_IDLECMD }>, d: DuelSession, t: Team) {
    const pass = { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null } as const;
    const v = d.view(t);
    console.log(`  PROBE ${d.setup.names[t]} t${v.turn} ${v.phase}: pass through ${simulate(d, t, pass, plain, true)?.toFixed(0)}, now ${evaluate(v, d.engine).toFixed(0)}`);
    const pools = [m.summons, m.special_summons, m.pos_changes, m.monster_sets, m.spell_sets, m.activates];
    for (const [action, pool] of pools.entries()) pool.forEach((c, index) => {
        if (action === I.SELECT_POS_CHANGE) return;
        const r = { type: R.SELECT_IDLECMD, action, index } as never;
        const through = simulate(d, t, r, plain, true), now = simulate(d, t, r, plain, false);
        console.log(`    ${['summon', 'special', 'pos', 'set', 'set s/t', 'activate'][action]} ${engine.name(c.code)}: through ${through?.toFixed(0)}, next ${now?.toFixed(0)}`);
    });
}
let errors = 0;

for (let g = 0; g < Number(games); g++) {
    const a = decks[(g * 7) % decks.length]!, b = decks[(g * 13 + 5) % decks.length]!;
    const names: [string, string] = [a.key, b.key];
    const turns = new Map<string, Turn>();
    const turnOf = (d: DuelSession, t: Team) => {
        const v = d.view(t);
        const key = `${t}:${v.turn}`;
        if (!turns.has(key)) {
            const mons = v.me.monsters.filter(Boolean).map((c) => `${engine.name(c!.code)}${c!.faceUp ? '' : '(set)'}`).join(', ') || '-';
            const theirs = v.opp.monsters.filter(Boolean).map((c) => (c!.faceUp ? `${engine.name(c!.code)} ${c!.atk}${c!.defense ? 'd' : ''}` : '(set)')).join(', ') || '-';
            turns.set(key, { options: 0, actions: 0, attackers: 0, attacks: 0, hand: v.me.hand.map((c) => engine.name(c.code)), board: `t${v.turn} LP ${v.me.lp}/${v.opp.lp} mine: ${mons} | theirs: ${theirs}`, did: [] });
        }
        return turns.get(key)!;
    };
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        (d.setup as { botLevel?: BotLevel }).botLevel = level as BotLevel;
        const own = d.currentTurnPlayer === t;
        const t0 = performance.now();
        const actionsBefore = d.botActions;
        const r = botAnswer(m, d, t);
        times.push(performance.now() - t0);
        if (probes > 0 && own && m.type === M.SELECT_IDLECMD && r.type === R.SELECT_IDLECMD && (r.action === I.TO_BP || r.action === I.TO_EP) && actionsBefore === 0 && d.currentPhase === 'M1'
            && m.summons.length + m.monster_sets.length + m.activates.length + m.spell_sets.length > 0) {
            probes--;
            probe(m, d, t);
        }
        if (own && m.type === M.SELECT_IDLECMD && r.type === R.SELECT_IDLECMD) {
            const turn = turnOf(d, t);
            const pools = [m.summons, m.special_summons, m.pos_changes, m.monster_sets, m.spell_sets, m.activates];
            // (A Spell or Trap to Set counts only when it's a Trap or Quick-Play: a Normal Spell is kept in hand.)
            const settable = m.spell_sets.filter((c) => ((engine.cardData(c.code)?.type ?? 0) & 0x4) || ((engine.cardData(c.code)?.type ?? 0) & 0x10000)).length;
            turn.options = Math.max(turn.options, m.summons.length + m.special_summons.length + m.monster_sets.length + settable + m.activates.length);
            if (r.action !== I.TO_BP && r.action !== I.TO_EP) {
                turn.actions++;
                turn.did.push(`${['summon', 'special', 'pos', 'set', 'set s/t', 'activate'][r.action]} ${engine.name(pools[r.action]?.[r.index!]?.code ?? 0)}`);
            }
        }
        if (own && m.type === M.SELECT_BATTLECMD && r.type === R.SELECT_BATTLECMD) {
            const turn = turnOf(d, t);
            turn.attackers = Math.max(turn.attackers, m.attacks.length);
            if (r.action === B.SELECT_BATTLE) turn.attacks++;
        }
        return r;
    };
    const duel = new DuelSession(engine, { seed: [String(5000 + g), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: [a.deck, b.deck], names, bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    try {
        duel.start();
    } catch (e) {
        errors++;
        console.log(`game ${g} (${names.join(' v ')}): error ${(e as Error).message}`);
        continue;
    }
    if (process.env.TRACE === String(g)) {
        const keys = [...turns.keys()].sort((x, y) => Number(x.split(':')[1]) - Number(y.split(':')[1]));
        for (const key of keys) {
            const turn = turns.get(key)!;
            console.log(`${names[Number(key[0])]} ${turn.board}
    hand: ${turn.hand.join('; ')}
    did: ${turn.did.join(', ') || 'nothing'}; attacks ${turn.attacks}/${turn.attackers} able`);
        }
    }
    for (const [t, name] of names.entries()) {
        const s = perDeck.get(name) ?? { turns: 0, idle: 0, noAttack: 0, games: 0, wins: 0 };
        s.games++;
        if (duel.result?.winner === t) s.wins++;
        for (const [key, turn] of turns) {
            if (!key.startsWith(`${t}:`)) continue;
            s.turns++;
            if (turn.options > 0 && turn.actions === 0) {
                s.idle++;
                idleSamples.push(`${name}  ${turn.board}\n    hand: ${turn.hand.join('; ')}`);
            }
            if (turn.attackers > 0 && turn.attacks === 0) {
                s.noAttack++;
                quietSamples.push(`${name}  ${turn.board}
    did: ${turn.did.join(', ') || 'nothing'}`);
            }
        }
        perDeck.set(name, s);
    }
    console.log(`game ${g}: ${names.join(' v ')}: ${duel.result?.winner === undefined || duel.result.winner === null ? 'draw' : names[duel.result.winner]} (${duel.result?.reason}), ${duel.view(0).turn} turns`);
}

console.log('\ndeck                 turns  idle  no-attack  won');
let T = 0, IDLE = 0, NA = 0;
for (const [name, s] of perDeck) {
    T += s.turns; IDLE += s.idle; NA += s.noAttack;
    console.log(`${name.padEnd(20)} ${String(s.turns).padStart(5)} ${String(s.idle).padStart(5)} ${String(s.noAttack).padStart(10)}  ${s.wins}/${s.games}`);
}
times.sort((x, y) => x - y);
const q = (p: number) => times[Math.floor(p * (times.length - 1))]!.toFixed(0);
console.log(`\nall: ${T} turns, ${IDLE} doing nothing though it could (${((100 * IDLE) / T).toFixed(0)}%), ${NA} not attacking though it could; ${errors} errors`);
console.log(`thinking per decision (ms): median ${q(0.5)}, p90 ${q(0.9)}, p99 ${q(0.99)}, max ${q(1)}; ${simStats.runs} look-aheads, ${(simStats.ms / Math.max(1, simStats.runs)).toFixed(1)} ms each`);
console.log(`\nturns it did nothing (first 25):\n${idleSamples.slice(0, 25).join('\n')}`);
console.log(`\nturns it didn't attack (first 25):\n${quietSamples.slice(0, 25).join('\n')}`);
