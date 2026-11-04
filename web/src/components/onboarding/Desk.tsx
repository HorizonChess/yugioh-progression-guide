"use client";

import { useEffect, useRef } from "react";
import { WOOD } from "./textures";

/** Dust drifting through the candlelight, brighter near the flame. */
function Dust() {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const motes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, s: 0.2 + Math.random() * 0.8, p: Math.random() * 6.28 }));
        let raf = 0;
        const frame = (t: number) => {
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
            ctx.clearRect(0, 0, w, h);
            for (const m of motes) {
                m.y -= m.s * 0.00012;
                m.x += Math.sin(t * 0.0004 + m.p) * 0.00008;
                if (m.y < -0.02) Object.assign(m, { y: 1.02, x: Math.random() });
                const lit = Math.max(0, 1 - Math.hypot(m.x - 0.28, m.y - 0.18) * 1.5);
                ctx.globalAlpha = 0.08 + lit * 0.6;
                ctx.fillStyle = "#ffd9a0";
                ctx.beginPath();
                ctx.arc(m.x * w, m.y * h, m.r, 0, 6.283);
                ctx.fill();
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, []);
    return <canvas ref={ref} aria-hidden className="ob-dust" />;
}

/** A walnut desk at night, lit by a candle just off screen. `--lamp` (0–1) on an ancestor sets how bright. */
export default function Desk() {
    return (
        <div aria-hidden className="ob-desk">
            <div className="ob-desk__wood" style={{ backgroundImage: `${WOOD}` }} />
            <div className="ob-desk__warmth" />
            <div className="ob-desk__dark" />
            <Dust />
        </div>
    );
}
