"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { createChain, nudge, stepChain } from "@/lib/chain-physics";
import { drawChain, GOLD, IRON } from "@/lib/chain-draw";

const W = 96;
const H = 110;
const PIN_Y = 24;
const PINS = { ax: 10, ay: PIN_Y, bx: W - 10, by: PIN_Y };
const LINKS = 7;
const STEP = 1000 / 60;

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

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
        // A finished set's chain hangs straight and glows gold; the road ahead sags in iron.
        const chain = createChain(PINS, LINKS, active ? 1.0 : 1.3);
        const metal = active ? GOLD : IRON;

        const draw = () => drawChain(ctx, chain, metal, W, H, dpr);

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
                className={`absolute left-0 touch-pan-x ${active ? "chain-gold" : ""}`}
                style={{ top: 16 - PIN_Y, width: W, height: H }}
            />
        </div>
    );
}
