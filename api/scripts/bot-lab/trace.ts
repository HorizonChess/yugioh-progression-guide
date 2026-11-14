// Bot lab: one bot-vs-bot duel told play by play. npx tsx scripts/bot-lab/trace.ts <a> <b> [seed]
import { OcgMessageType as M, OcgResponseType as R, type OcgMessage } from 'ocgcore-wasm';
import type { DuelEvent } from '@ygo/shared';
import { botAnswer, type BotLevel } from '../../src/duel/bot';
import { loadEngine } from '../../src/duel/engine';
import { DuelSession, type Team } from '../../src/duel/session';
import { BEATDOWN, LOB, TRICKS } from './decks';
import { botAnswer as oldBot } from './old-bot';

const [a = 'normal', b = 'normal', seed = '1000'] = process.argv.slice(2);
const engine = await loadEngine();
const who: [string, string] = [a, b];
const IDLE = ['summon', 'special', 'reposition', 'set monster', 'set spell/trap', 'activate', 'to BP', 'to EP'];
const log: string[] = [];
const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
    const r = who[t] === 'old' ? oldBot(m, d, t) : (((d.setup as { botLevel?: BotLevel }).botLevel = who[t] as BotLevel), botAnswer(m, d, t));
    const P = 'AB'[t];
    const v = d.view(t);
    const mons = (s: typeof v.me) => s.monsters.filter(Boolean).map((c) => (c!.faceUp ? `${engine.name(c!.code)}(${c!.atk}${c!.defense ? 'd' : ''})` : c!.code ? `[${engine.name(c!.code)}]` : '[?]')).join(', ');
    if (m.type === M.SELECT_IDLECMD && r.type === R.SELECT_IDLECMD) {
        const pools = [m.summons, m.special_summons, m.pos_changes, m.monster_sets, m.spell_sets, m.activates] as { code: number }[][];
        const card = r.index !== null ? pools[r.action]?.[r.index] : undefined;
        log.push(`  ${P} t${v.turn} ${v.phase} LP ${v.me.lp}/${v.opp.lp} hand=${v.me.hand.map((c) => engine.name(c.code)).join('; ')} | mine: ${mons(v.me)} | theirs: ${mons(v.opp)}`);
        log.push(`     -> ${IDLE[r.action]}${card ? ' ' + engine.name(card.code) : ''}`);
    } else if (m.type === M.SELECT_CHAIN && r.type === R.SELECT_CHAIN && r.index !== null) {
        log.push(`  ${P} t${v.turn} ${v.phase} chains ${engine.name(m.selects[r.index]!.code)}`);
    } else if (m.type === M.SELECT_BATTLECMD && r.type === R.SELECT_BATTLECMD) {
        log.push(`  ${P} t${v.turn} BP: ${r.action === 1 ? 'attack with ' + engine.name(m.attacks[r.index!]!.code) : 'no attack'} | mine: ${mons(v.me)} | theirs: ${mons(v.opp)}`);
    } else if ((m.type === M.SELECT_CARD) && r.type === R.SELECT_CARD) {
        log.push(`     picks ${(r.indicies ?? []).map((i) => (m.selects[i]!.controller === t ? 'own ' : 'their ') + (m.selects[i]!.code ? engine.name(m.selects[i]!.code) : '?')).join(', ')} (hint ${d.selectHintOf(t)})`);
    } else if ((m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO)) {
        log.push(`     ${m.type === M.SELECT_EFFECTYN ? 'effect ' + engine.name(m.code) : 'yes/no'}: ${(r as { yes: boolean }).yes}`);
    }
    return r;
};
const duel = new DuelSession(engine, { seed: [seed, '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: process.env.LOB ? [{ main: LOB, extra: [] }, { main: LOB, extra: [] }] : [{ main: BEATDOWN, extra: [] }, { main: TRICKS, extra: [] }], names: [`A(${a})`, `B(${b})`], bots: [true, true], rules: 4 } as never, { answerer });
try { duel.start(); } catch (e) { console.log('error', (e as Error).message); }
if (process.env.DECISIONS) { console.log(log.join(String.fromCharCode(10))); console.log(JSON.stringify(duel.result)); process.exit(0); }
const name = (c?: number) => (c ? engine.name(c) : '?');
const side = (s: string) => (s === 'me' ? 'A' : 'B');
const uidName = new Map<string, number>();
for (const f of duel.takeFrames(0)) {
    for (const e of f.events as DuelEvent[]) {
        const x = e as Record<string, unknown> & DuelEvent;
        switch (e.k) {
            case 'turn': console.log(`\n== turn ${e.turn} (${side(e.side)})`); break;
            case 'phase': if (e.phase !== 'DP' && e.phase !== 'SP') console.log(`  [${e.phase}]`); break;
            case 'summon': console.log(`  ${side(e.side)} ${e.how} summons ${name(e.code)}`); break;
            case 'set': console.log(`  ${side(e.side)} sets a card`); break;
            case 'activate': console.log(`  ${side(e.side)} activates ${name(e.code)}`); break;
            case 'attack': console.log(`  ${side(e.side)} attacks${x.target ? '' : ' directly'}`); break;
            case 'destroyed': console.log(`    destroyed: ${name(x.code as number)}`); break;
            case 'lp': console.log(`    LP ${side(e.side)} ${x.was} -> ${x.lp}`); break;
            case 'win': console.log(`\nWIN: ${x.side ? side(x.side as string) : 'none'} (${x.reason})`); break;
            case 'move': { const to = x.to as { location?: string } | string; if (typeof to === 'object' && to && (to as { location?: string }).location === 'removed') console.log(`    banished: ${name(x.code as number)}`); break; }
        }
        if ('uid' in x && 'code' in x) uidName.set(x.uid as string, x.code as number);
    }
}
