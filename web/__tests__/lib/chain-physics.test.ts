import { createChain, nudge, stepChain } from "@/lib/chain-physics";

const pins = { ax: 0, ay: 0, bx: 76, by: 0 };
const settle = (c: ReturnType<typeof createChain>) => {
    let energy = 1;
    for (let i = 0; i < 800; i++) energy = stepChain(c, pins);
    return energy;
};

it("hangs at rest between its pins with every link at length", () => {
    const c = createChain(pins, 7, 1.3);
    expect(settle(c)).toBeLessThan(1e-4);
    const [first, mid, last] = [c.p[0]!, c.p[3]!, c.p[7]!];
    expect([first.x, first.y, last.x, last.y]).toEqual([0, 0, 76, 0]);
    expect(mid.y).toBeGreaterThan(15);
    for (let i = 0; i < 7; i++) expect(Math.hypot(c.p[i + 1]!.x - c.p[i]!.x, c.p[i + 1]!.y - c.p[i]!.y)).toBeCloseTo(c.seg, 0);
});

it("swings when nudged and comes back to rest", () => {
    const c = createChain(pins, 7, 1.3);
    settle(c);
    const mid = c.p[3]!;
    const rest = mid.x;
    nudge(c, 3, 0);
    expect(stepChain(c, pins)).toBeGreaterThan(1);
    expect(settle(c)).toBeLessThan(1e-4);
    expect(mid.x).toBeCloseTo(rest, 0);
});
