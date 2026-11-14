// Bot lab: fits the bot's weights (duel/src/bot-weights.ts) to who went on to win, from positions
// recorded by record.ts.   npx tsx scripts/bot-lab/fit-weights.ts <positions.jsonl>...
//
// A logistic model of winning from the position's features: P(win) = 1 / (1 + e^-(w·f)). It's
// checked on games kept apart (every fifth), against the weights set by hand (their score, scaled
// to fit as well as it can). The fitted weights are printed in the bot's own points: divided by
// that scale, so a card in hand stays about what it was and the bot's margins keep their meaning.
import { readFileSync } from 'node:fs';
import { HAND_SET, type Feature } from '@ygo/duel/bot-weights';

const FEATURES = Object.keys(HAND_SET) as Feature[];
const files = process.argv.slice(2);
type Row = { g: number; y: number; turn: number; left: number; f: number[] };
const rows: Row[] = files.flatMap((file) => readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row));
const train = rows.filter((r) => r.g % 5 !== 0), test = rows.filter((r) => r.g % 5 === 0);
console.log(`${rows.length} positions from ${new Set(rows.map((r) => r.g)).size} games (${train.length} to fit, ${test.length} to check)`);

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
const dot = (w: number[], x: number[]) => w.reduce((s, wi, i) => s + wi * x[i]!, 0);
function logLoss(data: Row[], score: (x: number[]) => number): number {
    let s = 0;
    for (const r of data) {
        const p = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(score(r.f))));
        s -= r.y ? Math.log(p) : Math.log(1 - p);
    }
    return s / data.length;
}
function accuracy(data: Row[], score: (x: number[]) => number): number {
    return data.filter((r) => (score(r.f) > 0 ? 1 : 0) === r.y).length / data.length;
}

/** Solves a x = b (Gaussian elimination, partial pivoting). */
function solve(a: number[][], b: number[]): number[] {
    const n = b.length, m = a.map((row, i) => [...row, b[i]!]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
        [m[c], m[p]] = [m[p]!, m[c]!];
        for (let r = 0; r < n; r++) {
            if (r === c || !m[c]![c]) continue;
            const k = m[r]![c]! / m[c]![c]!;
            for (let j = c; j <= n; j++) m[r]![j]! -= k * m[c]![j]!;
        }
    }
    return m.map((row, i) => row[n]! / (row[i] || 1));
}

/** Logistic regression by Newton's method, with an L2 penalty `l2` (on standardized features), no intercept (the features are each side's minus the other's). */
function fit(data: Row[], dims: number[], l2: number, free: number[] = []): number[] {
    const sd = dims.map((d) => Math.sqrt(data.reduce((s, r) => s + r.f[d]! ** 2, 0) / data.length) || 1);
    const xs = data.map((r) => dims.map((d, i) => r.f[d]! / sd[i]!));
    let w = dims.map(() => 0);
    for (let it = 0; it < 30; it++) {
        const n = dims.length, g = Array<number>(n).fill(0), h = Array.from({ length: n }, () => Array<number>(n).fill(0));
        for (const [k, x] of xs.entries()) {
            const p = sigmoid(dot(w, x)), e = p - data[k]!.y, v = p * (1 - p);
            for (let i = 0; i < n; i++) {
                g[i]! += e * x[i]!;
                for (let j = 0; j < n; j++) h[i]![j]! += v * x[i]! * x[j]!;
            }
        }
        for (let i = 0; i < n; i++) {
            if (free.includes(dims[i]!)) continue;
            g[i]! += l2 * w[i]!;
            h[i]![i]! += l2;
        }
        const step = solve(h, g);
        w = w.map((wi, i) => wi - step[i]!);
        if (Math.max(...step.map(Math.abs)) < 1e-7) break;
    }
    return w.map((wi, i) => wi / sd[i]!);
}

// The hand-set weights: their score, scaled to the best fit (one number).
const all = FEATURES.map((_, i) => i);
const handScore = (x: number[]) => FEATURES.reduce((s, k, i) => s + HAND_SET[k] * x[i]!, 0);
const scaleRows = train.map((r) => ({ ...r, f: [handScore(r.f)] }));
const [scale] = fit(scaleRows, [0], 1e-6);
const hand = (x: number[]) => scale! * handScore(x);
console.log(`\nhand-set weights: log loss ${logLoss(test, hand).toFixed(4)}, right ${(100 * accuracy(test, hand)).toFixed(1)}% (1 point = ${scale!.toExponential(3)} logits)`);

// Fitted from the hand-set weights: their score is one more feature, free; each weight's change
// from it is held back (L2), so a weight moves only as far as the games show it should.
const withHand = (data: Row[]) => data.map((r) => ({ ...r, f: [...r.f, handScore(r.f)] }));
const trainH = withHand(train), testH = withHand(test), H = FEATURES.length;
const pick = Number(process.env.L2 ?? 100);
for (const l2 of [1000, 3000, 10000]) {
    const wh = fit(trainH, [...all, H], l2, [H]);
    const a = wh[H]!;
    const w = FEATURES.map((k, i) => a * HAND_SET[k] + wh[i]!);
    const score = (x: number[]) => dot(w, x);
    console.log(`fitted from the hand-set (L2 ${l2}): log loss ${logLoss(test, score).toFixed(4)}, right ${(100 * accuracy(test, score)).toFixed(1)}%`);
    void testH;
    if (l2 !== pick) continue;
    const scale = a;
    console.log('\nfeature        hand-set      fitted (in points)');
    for (const [i, k] of FEATURES.entries()) console.log(`${k.padEnd(14)} ${String(HAND_SET[k]).padStart(9)} ${(w[i]! / scale!).toFixed(3).padStart(14)}`);
    console.log(`\nexport const FITTED: Record<Feature, number> = {\n${FEATURES.map((k, i) => `    ${k}: ${Number((w[i]! / scale!).toPrecision(3))},`).join('\n')}\n};`);
}
