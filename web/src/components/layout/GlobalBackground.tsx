"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { asset } from '@/lib/utils';
import type { ArenaScene } from "./arena-scene";

const DESKTOP = "(min-width: 768px)";
const loadScene = () => import("./arena-scene");
const canWebGL2 = () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };

/**
 * The Bots Arena's wall (desktop): going in, the camera moves along the wall every page shows, round
 * its corner, to a torch-lit wall (three.js, ./arena-scene), and stays there, the torch burning;
 * coming out, it moves back. Its first and last frames are this page's wall exactly, so it takes
 * over from it and hands back without a jump. Phones keep the plain wall.
 */
function ArenaWall({ arena }: { arena: boolean }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const scene = useRef<Promise<ArenaScene> | null>(null);
    const turn = useRef(0);
    const [shown, setShown] = useState(false);

    // Fetched while the page rests, so it's ready when the arena is opened.
    useEffect(() => {
        if (!window.matchMedia(DESKTOP).matches) return;
        const id = window.setTimeout(() => void loadScene().catch(() => {}), 2500);
        return () => window.clearTimeout(id);
    }, []);

    useEffect(() => {
        const mine = ++turn.current;
        if (arena) {
            if (!window.matchMedia(DESKTOP).matches || !canvas.current || !canWebGL2()) return;
            const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            scene.current ??= loadScene().then(({ createArenaScene }) => createArenaScene(canvas.current!, asset));
            scene.current.then((s) => {
                if (turn.current !== mine) return;
                setShown(true);
                s.enter(instant);
            }).catch(() => { scene.current = null; });
        } else if (scene.current) {
            const going = scene.current;
            going.then(async (s) => {
                await s.leave(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
                if (turn.current !== mine) return;
                // back on the page's wall: the canvas goes, and with it the work of drawing it
                setShown(false);
                s.dispose();
                scene.current = null;
            }).catch(() => {});
        }
    }, [arena]);

    useEffect(() => () => { void scene.current?.then((s) => s.dispose()); }, []);

    return <canvas ref={canvas} aria-hidden className={`arena-3d ${shown ? "is-shown" : ""}`} />;
}

export default function GlobalBackground() {
    // trailingSlash (for static hosting) makes this "/menu/"; strip it so the check matches
    const pathname = usePathname().replace(/(.)\/$/, "$1");

    // The Bots Arena: the camera moves along the wall, round its corner, to the torch that lights it.
    const arena = pathname === '/bots-arena';

    // The title screen draws its own background.
    if (pathname === '/') {
        return null;
    }

    const wall = (src: string) => ({
        backgroundColor: '#2a1d10',
        backgroundImage: `url('${asset(src)}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(1.15) contrast(1.15) saturate(1.05)',
    });

    return (
        <>
            {/* The hieroglyph wall (a sharper repaint of the original stone); the warm
                base shows while it loads, instead of grey. Phones get a portrait crop. */}
            <div className="fixed inset-0 z-[-1] hidden md:block" style={wall("/bg-wall.webp")}></div>
            <div className="fixed inset-0 z-[-1] md:hidden" style={wall("/bg-wall-phone.webp")}></div>
            {/* Torchlight flickering over it, then a vignette so the middle stays readable. */}
            <div className="wall-torch hidden md:block" style={{ left: '12%', top: '30%' }}></div>
            <div className="wall-torch wall-torch--b hidden md:block" style={{ left: '88%', top: '26%' }}></div>
            <div className="fixed inset-0 z-[-1] pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0,0,0,.25), rgba(0,0,0,.72) 100%)' }}></div>
            <ArenaWall arena={arena} />
        </>
    );
}
