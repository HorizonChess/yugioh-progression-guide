// Bot lab: bots play each other headless. node: npx tsx scripts/bot-lab/match.ts <a> <b> [games]
// where a and b are levels (easy, normal, hard) or "old" (the bot before levels).
import { OcgMessageType as M, OcgResponseType as R, type OcgMessage } from 'ocgcore-wasm';
import { botAnswer, HARM_HINTS, type BotLevel } from '@ygo/duel/bot';
import { simStats } from '@ygo/duel/bot-sim';
import { loadEngine } from '../../src/duel/engine';
import { DuelSession, type Team } from '@ygo/duel/session';
import { BEATDOWN, TRICKS } from './decks';
import { botAnswer as oldBot } from './old-bot';

const [a = 'normal', b = 'old', games = '20'] = process.argv.slice(2);
const engine = await loadEngine();
const wins: Record<string, number> = { [`A:${a}`]: 0, [`B:${b}`]: 0, draw: 0 };
let selfHarm = 0, errors = 0, decisions = 0, worst = 0;
const harmed = new Map<string, number>();
/** The last card each team used (activated or chained), to name what hurt its own card. */
const lastUsed: [number, number] = [0, 0];
const started = performance.now();
for (let g = 0; g < Number(games); g++) {
    // Alternate who goes first and which deck each plays.
    const aFirst = g % 2 === 0, aDeck = Math.floor(g / 2) % 2 === 0 ? BEATDOWN : TRICKS, bDeck = aDeck === BEATDOWN ? TRICKS : BEATDOWN;
    const who: [string, string] = aFirst ? [a, b] : [b, a];
    const decks = aFirst ? [aDeck, bDeck] : [bDeck, aDeck];
    // The level read from the setup is per duel; each team plays its own, so the answerer sets it per call.
    let duel!: DuelSession;
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        const level = who[t]!;
        const t0 = performance.now();
        const r = level === 'old' ? oldBot(m, d, t) : (((d.setup as { botLevel?: BotLevel }).botLevel = level as BotLevel), botAnswer(m, d, t));
        const ms = performance.now() - t0;
        // A pick that hurts (destroy, banish, bounce, take control…) landing on the picker's own card.
        if (m.type === M.SELECT_CARD && r.type === R.SELECT_CARD && HARM_HINTS.has(d.selectHintOf(t))) {
            const own = (r.indicies ?? []).filter((i) => m.selects[i]!.controller === t);
            if (own.length && m.selects.some((c) => c.controller !== t)) {
                selfHarm++;
                const k = `${level}: ${engine.name(lastUsed[t])} (rival had a choice)`;
                harmed.set(k, (harmed.get(k) ?? 0) + 1);
            } else if (own.length) {
                selfHarm++;
                const k = `${level}: ${engine.name(lastUsed[t])} (only its own; ${d.currentTurnPlayer === t ? "own turn" : "rival turn"} ${d.currentPhase}; hint ${d.selectHintOf(t)}, picked ${own.map((i) => engine.name(m.selects[i]!.code)).join("+")})`;
                harmed.set(k, (harmed.get(k) ?? 0) + 1);
            }
        }
        if (m.type === M.SELECT_CHAIN && r.type === R.SELECT_CHAIN && r.index !== null) lastUsed[t] = m.selects[r.index]!.code;
        if (m.type === M.SELECT_IDLECMD && r.type === R.SELECT_IDLECMD && r.action === 5 && r.index !== null) lastUsed[t] = m.activates[r.index]!.code;
        decisions++;
        worst = Math.max(worst, ms);
        return r;
    };
    duel = new DuelSession(engine, { seed: [String(1000 + g), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [{ main: decks[0]!, extra: [] }, { main: decks[1]!, extra: [] }], names: who, bots: [true, true], rules: 4 } as never, { answerer });
    try {
        duel.start();
    } catch (e) {
        errors++;
        console.log(`game ${g}: error ${(e as Error).message}`);
        continue;
    }
    const w = duel.result?.winner;
    const key = w === null || w === undefined ? 'draw' : (w === 0) === aFirst ? `A:${a}` : `B:${b}`;
    wins[key]!++;
}
const secs = (performance.now() - started) / 1000;
console.log(JSON.stringify(wins), `errors ${errors}`, `self-harm ${selfHarm}`, JSON.stringify(Object.fromEntries(harmed)));
console.log(`${secs.toFixed(1)}s, ${decisions} decisions, sims ${simStats.runs} (${(simStats.ms / Math.max(1, simStats.runs)).toFixed(1)} ms each), slowest decision ${worst.toFixed(0)} ms`);
