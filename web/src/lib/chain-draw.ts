import type { Chain } from "@/lib/chain-physics";

export type Metal = { lo: string; mid: string; hi: string; edge: string };
export const IRON: Metal = { lo: "#16191d", mid: "#5b626c", hi: "#dfe3e8", edge: "#07090b" };
export const GOLD: Metal = { lo: "#5a3d08", mid: "#c9a032", hi: "#fff1bf", edge: "#2e1f04" };

const WIRE = 3.3;

/** Alternate links face the viewer (a ring) or turn edge-on (a bar), like a real chain. Lit from above on screen. */
function drawLink(ctx: CanvasRenderingContext2D, c: Chain, i: number, metal: Metal | null) {
    const p0 = c.p[i]!, p1 = c.p[i + 1]!;
    const face = i % 2 === 0;
    const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const L = len + WIRE * 2 + 1;
    const h = face ? len * 0.5 + WIRE * 2 : WIRE * 1.25;
    ctx.save();
    ctx.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.roundRect(-L / 2, -h / 2, L, h, h / 2);
    if (face) ctx.roundRect(-L / 2 + WIRE, -h / 2 + WIRE, L - WIRE * 2, h - WIRE * 2, Math.max(0, h / 2 - WIRE));
    if (!metal) {
        ctx.fill("evenodd");
        ctx.restore();
        return;
    }
    const s = Math.sin(a), co = Math.cos(a), r = h / 2;
    const g = ctx.createLinearGradient(-r * s, -r * co, r * s, r * co);
    g.addColorStop(0, metal.hi);
    g.addColorStop(face ? 0.3 : 0.45, metal.mid);
    g.addColorStop(1, metal.lo);
    ctx.fillStyle = g;
    ctx.fill("evenodd");
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = metal.edge;
    ctx.stroke();
    const up = co >= 0 ? -1 : 1;
    ctx.beginPath();
    const y = face ? up * (h / 2 - WIRE * 0.45) : up * h * 0.18;
    ctx.moveTo(-L * (face ? 0.2 : 0.38), y);
    ctx.lineTo(L * (face ? 0.2 : 0.38), y);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.stroke();
    ctx.restore();
}

/** Draws the whole chain with a soft shadow; the face-on links go under the edge-on ones. */
export function drawChain(ctx: CanvasRenderingContext2D, c: Chain, metal: Metal, w: number, h: number, dpr: number) {
    const links = c.p.length - 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(1.5, 3.5);
    ctx.filter = "blur(1.2px)";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (let i = 0; i < links; i++) drawLink(ctx, c, i, null);
    ctx.restore();
    for (let i = 0; i < links; i += 2) drawLink(ctx, c, i, metal);
    for (let i = 1; i < links; i += 2) drawLink(ctx, c, i, metal);
}
