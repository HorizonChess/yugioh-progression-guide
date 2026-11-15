// Bot lab: how strong players really are, as Elo. A round robin (ladder-game.ts per pairing, both
// ways round), then ratings fitted to the results (Bradley-Terry: the chance A beats B is
// 1 / (1 + 10^((Rb - Ra) / 400))), anchored so the first player is at its `=rating` or 1000.
//   npx tsx scripts/bot-lab/ladder.ts <out.jsonl> <pairs per pairing> <player>[=rating] <player>... [--parallel 14]
// Players: see ladder-game.ts (`easy`, `hard`, `kaiba:bc`, `joey:bc@hard`). Results are appended to
// out.jsonl, and every result already there counts too (so a ladder can be grown, or rerun to fit).
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const pi = args.indexOf('--parallel');
const parallel = pi >= 0 ? Number(args.splice(pi, 2)[1]) : 14;
const [out, pairsArg, ...specs] = args;
const anchor = Number(specs[0]!.split('=')[1] ?? 1000);
const players = specs.map((s) => s.split('=')[0]!);
const here = path.dirname(fileURLToPath(import.meta.url));

type Result = { a: string; b: string; pair: number; wa: number; wb: number };
const results: Result[] = existsSync(out!) ? readFileSync(out!, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const done = new Set(results.map((r) => `${r.a}|${r.b}|${r.pair}`));
const jobs: { a: string; b: string; pair: number }[] = [];
for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++)
        for (let p = 0; p < Number(pairsArg); p++) if (!done.has(`${players[i]}|${players[j]}|${p}`)) jobs.push({ a: players[i]!, b: players[j]!, pair: p });

function play(job: { a: string; b: string; pair: number }): Promise<Result> {
    return new Promise((resolve) => {
        const q = (s: string) => `"${s}"`;
        const child = spawn('npx', ['tsx', q(path.join(here, 'ladder-game.ts')), q(job.a), q(job.b), String(job.pair)], { shell: true, cwd: path.join(here, '../..') });
        let text = '';
        child.stdout.on('data', (d) => (text += d));
        child.on('close', () => {
            try {
                const r = JSON.parse(text.trim().split('\n').at(-1)!);
                resolve({ ...job, wa: r.a, wb: r.b });
            } catch {
                resolve({ ...job, wa: 0, wb: 0 });
            }
        });
    });
}

let next = 0, finished = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < jobs.length) {
        const job = jobs[next++]!;
        const r = await play(job);
        appendFileSync(out!, JSON.stringify(r) + '\n');
        results.push(r);
        if (++finished % 20 === 0) console.log(`${finished}/${jobs.length} pairings (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
}));

// Bradley-Terry by gradient ascent on the log-likelihood (with a weak pull to the mean, so a player
// who won or lost everything stays finite).
const games = results.filter((r) => players.includes(r.a) && players.includes(r.b));
const rating = new Map(players.map((p) => [p, 0]));
const K = Math.log(10) / 400;
for (let it = 0; it < 4000; it++) {
    const grad = new Map(players.map((p) => [p, -0.0005 * rating.get(p)! * K]));
    for (const r of games) {
        const e = 1 / (1 + Math.exp(-K * (rating.get(r.a)! - rating.get(r.b)!)));
        const n = r.wa + r.wb;
        grad.set(r.a, grad.get(r.a)! + (r.wa - n * e));
        grad.set(r.b, grad.get(r.b)! - (r.wa - n * e));
    }
    for (const p of players) rating.set(p, rating.get(p)! + 2 * grad.get(p)!);
}
const shift = anchor - rating.get(players[0]!)!;
const score = (p: string) => {
    const mine = games.filter((r) => r.a === p || r.b === p);
    const w = mine.reduce((s, r) => s + (r.a === p ? r.wa : r.wb), 0), n = mine.reduce((s, r) => s + r.wa + r.wb, 0);
    return `${w}/${n}`;
};
console.log(`\n${games.length} pairings`);
for (const p of [...players].sort((x, y) => rating.get(y)! - rating.get(x)!)) {
    const target = specs.find((s) => s.split('=')[0] === p)!.split('=')[1];
    console.log(`${p.padEnd(22)} ${String(Math.round(rating.get(p)! + shift)).padStart(5)}${target ? `  (rated ${target})` : ''}   won ${score(p)}`);
}
