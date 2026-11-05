"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import { createChain, nudge, stepChain, type Pins } from "@/lib/chain-physics";
import { drawChain, GOLD, IRON } from "@/lib/chain-draw";

const STEP = 1000 / 60;
const PAD = 34;

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

export type RoadSpan = { ax: number; ay: number; bx: number; by: number };

/**
 * The timeline's physics chain, hung on the phone Road from the bottom of one
 * pack to the top of the next (coordinates inside the scrolling road). Finished
 * stretches hang straight in gold; the road ahead sags in iron. Scrolling the
 * road swings it, and a finger brushing it sets it moving.
 */
export default function RoadChain({ span, done, scroller }: { span: RoadSpan; done: boolean; scroller: RefObject<HTMLElement | null> }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const reduce = useReducedMotion();
    const left = Math.min(span.ax, span.bx) - PAD;
    const top = Math.min(span.ay, span.by) - PAD;
    const W = Math.abs(span.bx - span.ax) + PAD * 2;
    const H = Math.abs(span.by - span.ay) + PAD * 3;

    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        const pins: Pins = { ax: span.ax - left, ay: span.ay - top, bx: span.bx - left, by: span.by - top };
        const links = Math.max(5, Math.round(Math.hypot(span.bx - span.ax, span.by - span.ay) / 13) | 1);
        const chain = createChain(pins, links, done ? 1.0 : 1.12);
        const metal = done ? GOLD : IRON;
        const draw = () => drawChain(ctx, chain, metal, W, H, dpr);

        if (reduce) {
            for (let i = 0; i < 300; i++) stepChain(chain, pins);
            draw();
            return;
        }

        let raf = 0, last = 0, acc = 0, calm = 0;
        const tick = (now: number) => {
            acc = Math.min(acc + now - last, STEP * 4);
            last = now;
            let energy = 0;
            while (acc >= STEP) {
                energy = stepChain(chain, pins);
                acc -= STEP;
            }
            draw();
            calm = energy < 0.002 ? calm + 1 : 0;
            raf = calm > 30 ? 0 : requestAnimationFrame(tick);
        };
        const wake = () => {
            if (raf) return;
            last = performance.now();
            calm = 0;
            raf = requestAnimationFrame(tick);
        };

        let prev: { x: number; y: number } | null = null;
        const onMove = (e: PointerEvent) => {
            const b = canvas.getBoundingClientRect();
            const p = { x: e.clientX - b.left, y: e.clientY - b.top };
            if (prev) nudge(chain, clamp((p.x - prev.x) * 0.6, 5), clamp((p.y - prev.y) * 0.6, 5), { ...p, r: 14 });
            prev = p;
            wake();
        };
        const onLeave = () => {
            prev = null;
        };

        // The road scrolling under the chain swings it, by the change in speed.
        const road = scroller.current;
        let lastTop = road?.scrollTop ?? 0, lastV = 0;
        const onScroll = () => {
            if (!road) return;
            const v = road.scrollTop - lastTop;
            lastTop = road.scrollTop;
            const kick = clamp((v - lastV) * 0.25, 3);
            lastV = v;
            if (Math.abs(kick) > 0.05) {
                nudge(chain, kick * (Math.random() * 0.6 + 0.7), 0);
                wake();
            }
        };

        canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerleave", onLeave);
        road?.addEventListener("scroll", onScroll, { passive: true });
        draw();
        wake();
        return () => {
            cancelAnimationFrame(raf);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerleave", onLeave);
            road?.removeEventListener("scroll", onScroll);
        };
    }, [span.ax, span.ay, span.bx, span.by, left, top, W, H, done, reduce, scroller]);

    return (
        <canvas
            ref={ref}
            aria-hidden
            className={`road-chain ${done ? "chain-gold" : ""}`}
            style={{ left, top, width: W, height: H }}
        />
    );
}
