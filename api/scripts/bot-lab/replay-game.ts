// Bot lab: a stored game (its setup and answers, as the duels collection keeps them) told play by
// play, with the bot's side's view at each of its decisions. With AGAIN=1, also what the bot would
// answer now at each of its decisions where that differs.
//   npx tsx scripts/bot-lab/replay-game.ts <game.json>
import { readFileSync } from 'node:fs';
import { OcgMessageType as M, OcgResponseType as R, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import type { DuelEvent } from '@ygo/shared';
import { botAnswer } from '@ygo/duel/bot';
import { decodeAnswer } from '@ygo/duel/answers';
import { loadEngine } from '../../src/duel/engine';
import { DuelSession, type Team } from '@ygo/duel/session';

const stored = JSON.parse(readFileSync(process.argv[2]!, 'utf-8')) as { setup: DuelSession['setup']; answers: string[] };
const game = { setup: stored.setup, answers: stored.answers.map(decodeAnswer) as OcgResponse[] };
const engine = await loadEngine();
engine.simCore();
while (!engine.simCore()) await new Promise((r) => setTimeout(r, 10));
const again = process.env.AGAIN === '1';
const bot = game.setup.bots.indexOf(true) as Team;
const IDLE = ['summon', 'special', 'reposition', 'set monster', 'set spell/trap', 'activate', 'to BP', 'to EP'];
const name = (c?: number) => (c ? engine.name(c) : '?');
const json = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));

function describe(m: OcgMessage, r: OcgResponse, d: DuelSession, t: Team): string {
    if (m.type === M.SELECT_IDLECMD && r.type === R.SELECT_IDLECMD) {
        const pools = [m.summons, m.special_summons, m.pos_changes, m.monster_sets, m.spell_sets, m.activates] as { code: number }[][];
        const card = r.index !== null ? pools[r.action]?.[r.index] : undefined;
        return `${IDLE[r.action]}${card ? ' ' + name(card.code) : ''}`;
    }
    if (m.type === M.SELECT_CHAIN && r.type === R.SELECT_CHAIN) return r.index === null ? 'no response' : `chains ${name(m.selects[r.index]!.code)}`;
    if (m.type === M.SELECT_BATTLECMD && r.type === R.SELECT_BATTLECMD) return r.action === 1 ? `attack with ${name(m.attacks[r.index!]!.code)}` : 'no (more) attacks';
    if (m.type === M.SELECT_CARD && r.type === R.SELECT_CARD) return `picks ${(r.indicies ?? []).map((i) => (m.selects[i]!.controller === t ? 'own ' : 'their ') + name(m.selects[i]!.code)).join(', ')} (hint ${d.selectHintOf(t)})`;
    if (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO) return `${m.type === M.SELECT_EFFECTYN ? 'use ' + name(m.code) : 'yes/no'}: ${(r as { yes: boolean }).yes}`;
    return `${M[m.type] ?? m.type}: ${json(r)}`;
}
const board = (d: DuelSession, t: Team) => {
    const v = d.view(t);
    const mons = (s: typeof v.me) => s.monsters.filter(Boolean).map((c) => (c!.faceUp ? `${name(c!.code)}(${c!.atk}${c!.defense ? 'd' : ''})` : c!.code ? `[${name(c!.code)}]` : '[?]')).join(', ');
    const sts = (s: typeof v.me) => s.spells.filter(Boolean).map((c) => (c!.faceUp ? name(c!.code) : c!.code ? `[${name(c!.code)}]` : '[?]')).join(', ');
    return `LP ${v.me.lp}/${v.opp.lp} hand=${v.me.hand.map((c) => name(c.code)).join('; ')}\n        mine: ${mons(v.me)} | ${sts(v.me)}\n        theirs: ${mons(v.opp)} | ${sts(v.opp)}`;
};

const lines: string[] = [];
let lastBoard = '';
const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
    const r = game.answers[d.answers.length]!;
    const v = d.view(t);
    if (t === bot && (m.type === M.SELECT_IDLECMD || m.type === M.SELECT_CHAIN || m.type === M.SELECT_BATTLECMD || m.type === M.SELECT_CARD || m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO)) {
        const b = board(d, t);
        if (m.type === M.SELECT_IDLECMD && b !== lastBoard) {
            lines.push(`  BOT t${v.turn} ${v.phase} ${b}`);
            lastBoard = b;
        }
        let note = '';
        if (again) {
            const state = d.saveState();
            const now = botAnswer(m, d, t);
            d.loadState(state);
            if (json(now) !== json(r)) note = `   [now: ${describe(m, now, d, t)}]`;
        }
        lines.push(`     t${v.turn} ${v.phase} -> ${describe(m, r, d, t)}${note}`);
    } else if (t !== bot && m.type === M.SELECT_CHAIN && r.type === R.SELECT_CHAIN && r.index !== null) {
        lines.push(`  YOU t${v.turn} ${v.phase} chain ${name(m.selects[r.index]!.code)}`);
    }
    return r;
};
const duel = new DuelSession(engine, { ...game.setup, bots: [true, true], solo: false } as never, { answerer });
try {
    duel.start();
} catch (e) {
    console.log('error', (e as Error).message);
}
// The frames, from the bot's side: what happened, in order, between the decisions above.
const side = (s: string) => (s === 'me' ? 'BOT' : 'YOU');
const events: string[] = [];
for (const f of duel.takeFrames(bot)) {
    for (const e of f.events as DuelEvent[]) {
        const x = e as Record<string, unknown> & DuelEvent;
        switch (e.k) {
            case 'turn': events.push(`== turn ${e.turn} (${side(e.side)})`); break;
            case 'summon': events.push(`  ${side(e.side)} ${e.how} summons ${name(e.code)}`); break;
            case 'set': events.push(`  ${side(e.side)} sets a card`); break;
            case 'activate': events.push(`  ${side(e.side)} activates ${name(e.code)}`); break;
            case 'attack': events.push(`  ${side(e.side)} attacks${x.target ? '' : ' directly'}`); break;
            case 'destroyed': events.push(`    destroyed: ${name(x.code as number)}`); break;
            case 'lp': events.push(`    LP ${side(e.side)} ${x.was} -> ${x.lp}`); break;
            case 'win': events.push(`WIN: ${x.side ? side(x.side as string) : 'none'} (${x.reason})`); break;
        }
    }
}
console.log(events.join('\n'));
console.log('\n---- the bot\'s decisions ----');
console.log(lines.join('\n'));
console.log(JSON.stringify(duel.result));
