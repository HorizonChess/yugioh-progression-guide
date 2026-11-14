// Bot lab: tunes the bot's weights (duel/src/bot-weights.ts) by playing (SPSA).
//   npx tsx scripts/bot-lab/tune.ts <rounds> <log.jsonl> [parallel = 16]
// Each round nudges every weight at random up or down by its step, plays the nudged-up weights
// against the nudged-down ones (`parallel` pairs of duelist decks, each played both ways round, by
// the hard bot), and moves the weights toward whichever side won more, by how much more. Starts
// from the hand-set weights, or the last line of the log if there is one; each round is a line.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { HAND_SET, type Feature } from '@ygo/duel/bot-weights';

const [roundsArg = '40', log = 'tune-log.jsonl', parallelArg = '16'] = process.argv.slice(2);
const rounds = Number(roundsArg), parallel = Number(parallelArg);
const FEATURES = Object.keys(HAND_SET) as Feature[];
/** How far each weight is nudged to try it (about what would change a decision). */
const STEP: Record<Feature, number> = {
    lp: 0.1, lowLp: 0.1, hand: 60, handRemoval: 100, handStrength: 100, monster: 60, monsterAtk: 0.1, monsterDef: 0.05,
    hiddenBonus: 0.3, pressure: 0.3, set: 60, faceUp: 50, riskMine: 0.15, riskTheirs: 0.1, latent: 0.1, control: 150,
};
/** How far it moves, in steps, when one side wins every game (shrinking as rounds go). */
const RATE = 2;

const lines = existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter(Boolean) : [];
let theta: Record<Feature, number> = lines.length ? JSON.parse(lines.at(-1)!).theta : { ...HAND_SET };
const done = lines.length;
const here = path.dirname(fileURLToPath(import.meta.url));

function play(file: string, pair: number): Promise<{ a: number; b: number }> {
    return new Promise((resolve) => {
        const q = (x: string) => `"${x}"`;
        const child = spawn('npx', ['tsx', q(path.join(here, 'weights-match.ts')), q(file), String(pair)], { shell: true, cwd: path.join(here, '../..') });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.on('close', () => {
            const line = out.trim().split('\n').at(-1) ?? '';
            try {
                resolve(JSON.parse(line));
            } catch {
                resolve({ a: 0, b: 0 });
            }
        });
    });
}

for (let k = done; k < done + rounds; k++) {
    const sign = Object.fromEntries(FEATURES.map((f) => [f, Math.random() < 0.5 ? -1 : 1])) as Record<Feature, number>;
    const a = Object.fromEntries(FEATURES.map((f) => [f, theta[f] + sign[f] * STEP[f]]));
    const b = Object.fromEntries(FEATURES.map((f) => [f, theta[f] - sign[f] * STEP[f]]));
    const file = path.join(os.tmpdir(), `tune-${process.pid}-${k}.json`);
    writeFileSync(file, JSON.stringify({ a, b }));
    const results = await Promise.all(Array.from({ length: parallel }, (_, j) => play(file, k * parallel + j)));
    const wa = results.reduce((s, r) => s + r.a, 0), wb = results.reduce((s, r) => s + r.b, 0);
    const games = wa + wb;
    const g = games ? (wa - wb) / games : 0;
    const rate = RATE / Math.pow(1 + k / 10, 0.6);
    theta = Object.fromEntries(FEATURES.map((f) => [f, theta[f] + rate * g * sign[f] * STEP[f]])) as Record<Feature, number>;
    appendFileSync(log, JSON.stringify({ round: k, wa, wb, theta }) + '\n');
    console.log(`round ${k}: nudged-up ${wa}, nudged-down ${wb}; ${FEATURES.map((f) => `${f} ${Number(theta[f].toPrecision(3))}`).join(', ')}`);
}
