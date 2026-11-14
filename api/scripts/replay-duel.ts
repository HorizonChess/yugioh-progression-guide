// Replays a stored duel (a record downloaded from a duel's error screen) and finds where its
// answers stop fitting: the first answer the engine refuses, with the question it was given to.
//
//   npx tsx scripts/replay-duel.ts path/to/duel-<id>.json
import { readFileSync } from 'node:fs';
import { loadEngine } from '../src/duel/engine';
import { decode } from '../src/duel/hub';
import { DuelSession, type DuelSetup } from '@ygo/duel/session';

const file = process.argv[2];
if (!file) throw new Error('Usage: tsx scripts/replay-duel.ts <record.json>');
const record = JSON.parse(readFileSync(file, 'utf-8')) as { setup: DuelSetup; answers: string[] };
const answers = record.answers.map(decode);
const engine = await loadEngine();
const fits = (n: number) => {
    const session = new DuelSession(engine, record.setup);
    try {
        session.start(answers.slice(0, n));
        return true;
    } catch {
        return false;
    } finally {
        session.destroy();
    }
};
console.log(`${answers.length} answers, rules ${record.setup.rules ?? 1}, bots ${JSON.stringify(record.setup.bots)}`);
if (fits(answers.length)) {
    console.log('It rebuilds: every answer fits.');
    process.exit(0);
}
// The longest start that still rebuilds; the answer after it is the one that doesn't fit.
let lo = 0, hi = answers.length;
while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid;
}
const session = new DuelSession(engine, record.setup);
session.start(answers.slice(0, lo));
const team = session.waitingFor();
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
console.log(`Answers 1-${lo} rebuild. Answer ${lo + 1} doesn't fit.`);
console.log(`Turn ${session.state(0, 'replay').view.turn}, waiting for team ${team}`);
if (team !== null) console.log('Question:', show(session.state(team, 'replay').prompt).slice(0, 1500));
console.log('Stored answer:', show(answers[lo]));
console.log('Next answers:', answers.slice(lo + 1, lo + 6).map(show).join(' | '));
console.log('Answers before:', answers.slice(Math.max(0, lo - 5), lo).map(show).join(' | '));
session.destroy();
