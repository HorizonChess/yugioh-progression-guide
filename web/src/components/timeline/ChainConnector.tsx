"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { createChain, nudge, stepChain, type Chain } from "@/lib/chain-physics";

const W = 96;
const H = 110;
const PIN_Y = 24;
const PINS = { ax: 10, ay: PIN_Y, bx: W - 10, by: PIN_Y };
const LINKS = 7;
const WIRE = 3.3;
const STEP = 1000 / 60;

type Metal = { lo: string; mid: string; hi: string; edge: string };
const IRON: Metal = { lo: "#16191d", mid: "#5b626c", hi: "#dfe3e8", edge: "#07090b" };
const GOLD: Metal = { lo: "#5a3d08", mid: "#c9a032", hi: "#fff1bf", edge: "#2e1f04" };

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

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
    if (face) ctx.roundRect(-L / 2 + WIRE, -h / 2 + WIRE, L - WIRE * 2, h - WIRE * 2, h / 2 - WIRE);
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

/** A hanging chain between two pack tiles: swings when the carousel scrolls, and can be brushed or (with a mouse) grabbed. */
export default function ChainConnector({ active = false }: { active?: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const reduce = useReducedMotion();

    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        const chain = createChain(PINS, LINKS, 1.3);
        const metal = active ? GOLD : IRON;

        const draw = () => {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);
            ctx.save();
            ctx.translate(1.5, 3.5);
            ctx.filter = "blur(1.2px)";
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            for (let i = 0; i < LINKS; i++) drawLink(ctx, chain, i, null);
            ctx.restore();
            for (let i = 0; i < LINKS; i += 2) drawLink(ctx, chain, i, metal);
            for (let i = 1; i < LINKS; i += 2) drawLink(ctx, chain, i, metal);
        };

        if (reduce) {
            for (let i = 0; i < 300; i++) stepChain(chain, PINS);
            draw();
            return;
        }

        let raf = 0, last = 0, acc = 0, calm = 0, visible = true;
        let lastLeft = canvas.getBoundingClientRect().left, lastV = 0;
        let hold: { i: number; x: number; y: number } | undefined;
        let pointer: { x: number; y: number } | null = null;

        const tick = (now: number) => {
            // The carousel moving under the chain swings it: kick by the change in on-screen speed.
            const left = canvas.getBoundingClientRect().left;
            const v = left - lastLeft;
            const kick = clamp(-(v - lastV) * 0.35, 3);
            lastLeft = left;
            lastV = v;
            if (kick) nudge(chain, kick, 0);
            acc = Math.min(acc + now - last, STEP * 4);
            last = now;
            let energy = 0;
            while (acc >= STEP) {
                energy = stepChain(chain, PINS, hold);
                acc -= STEP;
            }
            draw();
            calm = energy < 0.002 && !hold && Math.abs(v) < 0.1 ? calm + 1 : 0;
            raf = calm > 30 || !visible ? 0 : requestAnimationFrame(tick);
            if (!raf) lastV = 0;
        };
        const wake = () => {
            if (raf || !visible) return;
            last = performance.now();
            calm = 0;
            raf = requestAnimationFrame(tick);
        };

        const local = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
        };
        const reach = (p: { x: number; y: number }, i: number) => {
            // Keep a held link within the chain's length of both pins.
            const limits: [number, number, number][] = [[PINS.ax, PINS.ay, i * chain.seg], [PINS.bx, PINS.by, (LINKS - i) * chain.seg]];
            for (const [px, py, max] of limits) {
                const d = Math.hypot(p.x - px, p.y - py);
                if (d > max) {
                    p.x = px + ((p.x - px) * max) / d;
                    p.y = py + ((p.y - py) * max) / d;
                }
            }
            return p;
        };
        const onMove = (e: PointerEvent) => {
            const p = local(e);
            if (hold) Object.assign(hold, reach(p, hold.i));
            else if (pointer) nudge(chain, clamp((p.x - pointer.x) * 0.5, 4), clamp((p.y - pointer.y) * 0.5, 4), { ...p, r: 10 });
            pointer = p;
            wake();
        };
        const onDown = (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            const p = local(e);
            let best = -1, bestD = 12;
            chain.p.forEach((q, i) => {
                const d = Math.hypot(q.x - p.x, q.y - p.y);
                if (i > 0 && i < LINKS && d < bestD) [best, bestD] = [i, d];
            });
            if (best < 0) return;
            hold = { i: best, ...reach(p, best) };
            canvas.setPointerCapture(e.pointerId);
            canvas.style.cursor = "grabbing";
            wake();
        };
        const onUp = () => {
            hold = undefined;
            canvas.style.cursor = "";
        };
        const onLeave = () => {
            pointer = null;
        };

        const io = new IntersectionObserver((entries) => {
            visible = entries.some((e) => e.isIntersecting);
            if (visible) {
                lastLeft = canvas.getBoundingClientRect().left;
                wake();
            }
        });
        io.observe(canvas);
        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerdown", onDown);
        canvas.addEventListener("pointerup", onUp);
        canvas.addEventListener("pointercancel", onUp);
        canvas.addEventListener("pointerleave", onLeave);
        window.addEventListener("scroll", wake, { capture: true, passive: true });
        window.addEventListener("resize", wake);
        draw();
        wake();

        return () => {
            cancelAnimationFrame(raf);
            io.disconnect();
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointercancel", onUp);
            canvas.removeEventListener("pointerleave", onLeave);
            window.removeEventListener("scroll", wake, { capture: true });
            window.removeEventListener("resize", wake);
        };
    }, [active, reduce]);

    return (
        <div className="relative h-8" style={{ width: W }}>
            <canvas
                ref={ref}
                aria-hidden
                className="absolute left-0 touch-pan-x"
                style={{ top: 16 - PIN_Y, width: W, height: H, filter: active ? "drop-shadow(0 0 4px rgba(212,175,55,0.45))" : undefined }}
            />
        </div>
    );
}
