/** A hanging chain as a Verlet rope: points joined by fixed-length links, both ends pinned. */
export type Point = { x: number; y: number; px: number; py: number };
export type Chain = { p: Point[]; seg: number };
export type Pins = { ax: number; ay: number; bx: number; by: number };

/** Starts the chain on the parabola it will roughly settle into, so it doesn't thrash on mount. */
export function createChain({ ax, ay, bx, by }: Pins, links: number, slack: number): Chain {
    const span = Math.hypot(bx - ax, by - ay);
    const sag = Math.sqrt((3 * span * span * (slack - 1)) / 8);
    const p = Array.from({ length: links + 1 }, (_, i) => {
        const t = i / links;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t + sag * 4 * t * (1 - t);
        return { x, y, px: x, py: y };
    });
    return { p, seg: (span * slack) / links };
}

/** Pushes free points by (dx, dy) as a velocity, all of them or those within `near`. */
export function nudge(c: Chain, dx: number, dy: number, near?: { x: number; y: number; r: number }) {
    for (const q of c.p.slice(1, -1)) {
        if (near && Math.hypot(q.x - near.x, q.y - near.y) > near.r) continue;
        q.x += dx;
        q.y += dy;
    }
}

/** One fixed time step. `hold` pins a point to the pointer. Returns the largest squared speed. */
export function stepChain(c: Chain, pins: Pins, hold?: { i: number; x: number; y: number }, gravity = 0.32, damping = 0.985): number {
    const { p, seg } = c;
    const n = p.length;
    let energy = 0;
    for (const q of p.slice(1, -1)) {
        const vx = (q.x - q.px) * damping;
        const vy = (q.y - q.py) * damping;
        energy = Math.max(energy, vx * vx + vy * vy);
        q.px = q.x;
        q.py = q.y;
        q.x += vx;
        q.y += vy + gravity;
    }
    const first = p[0]!, last = p[n - 1]!, held = hold && p[hold.i];
    for (let k = 0; k < 12; k++) {
        Object.assign(first, { x: pins.ax, y: pins.ay });
        Object.assign(last, { x: pins.bx, y: pins.by });
        if (held) Object.assign(held, { x: hold.x, y: hold.y });
        for (let i = 0; i < n - 1; i++) {
            const a = p[i]!, b = p[i + 1]!;
            const wa = a === first || a === held ? 0 : 1;
            const wb = b === last || b === held ? 0 : 1;
            if (!wa && !wb) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1e-6;
            const f = (d - seg) / d / (wa + wb);
            a.x += dx * f * wa;
            a.y += dy * f * wa;
            b.x -= dx * f * wb;
            b.y -= dy * f * wb;
        }
    }
    return energy;
}
