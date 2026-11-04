"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import WaxSeal from "./WaxSeal";
import { handwrite } from "./handwriting";
import { burst, rasterize } from "./shards";

gsap.registerPlugin(useGSAP, DrawSVGPlugin);

function Stamp() {
    // Perforated edge: a bite every few units along each side.
    const bites = [];
    for (let x = 4; x <= 96; x += 7.6) bites.push([x, 0], [x, 120]);
    for (let y = 4; y <= 116; y += 7.6) bites.push([0, y], [100, y]);
    return (
        <svg viewBox="0 0 100 120" className="ob-stamp" aria-hidden>
            <defs>
                <mask id="ob-perf">
                    <rect width="100" height="120" fill="#fff" />
                    {bites.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#000" />)}
                </mask>
            </defs>
            <g mask="url(#ob-perf)">
                <rect width="100" height="120" fill="#f4ead2" />
                <rect x="9" y="9" width="82" height="102" fill="#6d1416" />
                <rect x="13" y="13" width="74" height="94" fill="none" stroke="#d9b45a" strokeWidth="1.2" />
                <path d="M50 30 L56.5 47.3 L75 48.1 L60.5 59.6 L65.5 77.4 L50 67.2 L34.5 77.4 L39.5 59.6 L25 48.1 L43.5 47.3 Z" fill="#e3c063" />
                <text x="50" y="96" textAnchor="middle" fontSize="8.5" letterSpacing="1.5" fill="#e3c063" fontFamily="serif">DUELIST</text>
                <text x="50" y="104" textAnchor="middle" fontSize="6" letterSpacing="1.2" fill="#e3c063" fontFamily="serif">KINGDOM</text>
            </g>
        </svg>
    );
}

function Postmark() {
    return (
        <svg viewBox="0 0 200 100" className="ob-postmark" aria-hidden>
            <defs>
                <path id="ob-pm-arc" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" />
            </defs>
            <g fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="50" cy="50" r="44" />
                <circle cx="50" cy="50" r="28" />
                {[30, 42, 54, 66].map((y) => (
                    <path key={y} d={`M100 ${y} q12 -7 24 0 t24 0 t24 0 t24 0`} />
                ))}
            </g>
            <text fontSize="11" letterSpacing="2.5" fill="currentColor" fontFamily="serif">
                <textPath href="#ob-pm-arc">PROGRESSION SERIES · DUELIST KINGDOM ·</textPath>
            </text>
            <text x="50" y="55" textAnchor="middle" fontSize="15" fill="currentColor" fontFamily="serif">2002</text>
        </svg>
    );
}

/** Pocket folds on the envelope's back: two side flaps and a bottom flap meeting under the top flap. */
function Folds() {
    return (
        <svg viewBox="0 0 100 62" preserveAspectRatio="none" className="ob-env__folds" aria-hidden>
            <path d="M0 0 L46 33 L0 62 Z" fill="rgba(80,52,24,0.07)" />
            <path d="M100 0 L54 33 L100 62 Z" fill="rgba(80,52,24,0.07)" />
            <path d="M0 62 L50 29 L100 62 Z" fill="rgba(255,255,255,0.08)" />
            <path d="M0 62 L50 29 L100 62" fill="none" stroke="rgba(80,52,24,0.35)" strokeWidth="0.35" />
            <path d="M0 0 L46 33 M100 0 L54 33" fill="none" stroke="rgba(80,52,24,0.25)" strokeWidth="0.3" />
        </svg>
    );
}

/**
 * The invitation arriving on the desk. It lands front up and writes its greeting, turns over,
 * and opens when the seal is broken; `onLetterOut` gets the letter's box as it clears the envelope.
 */
export default function Envelope({ reduce, onLetterOut, onSignIn, onGuest }: { reduce: boolean; onLetterOut: (rect: DOMRect) => void; onSignIn: () => void; onGuest: () => void }) {
    const root = useRef<HTMLDivElement>(null);
    const seal = useRef<SVGSVGElement>(null);
    const shards = useRef<HTMLCanvasElement>(null);
    const arrival = useRef<gsap.core.Timeline | null>(null);
    const [phase, setPhase] = useState<"front" | "back" | "opening">("front");
    const { context } = useGSAP(
        () => {
            const tl = gsap.timeline({ onComplete: () => setPhase("back") });
            tl.from(".ob-env", { x: "55vw", y: "-75vh", rotation: 32, scale: 1.25, duration: 1.15, ease: "power3.out" })
                .from(".ob-env__shadow", { opacity: 0, x: 60, y: 90, scale: 1.25, duration: 1.15, ease: "power3.out" }, "<")
                .to(".ob-env", { scale: 0.985, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" })
                .from(".ob-env-links", { autoAlpha: 0, y: 12, duration: 0.5 }, "<");
            const greeting = handwrite(tl, gsap.utils.toArray<HTMLElement>(".ob-write"), tl.duration() - 0.25);
            tl.fromTo(".ob-flourish", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.5, ease: "power1.inOut" }, greeting + gsap.utils.random(0.1, 0.2));
            const signed = handwrite(tl, gsap.utils.toArray<HTMLElement>(".ob-to"), greeting + gsap.utils.random(0.45, 0.6), 0.65);
            tl.addLabel("flip", signed + 0.5)
                .to(".ob-env__body", { rotationY: 180, duration: 0.95, ease: "power2.inOut" }, "flip")
                .to(".ob-env", { y: -14, duration: 0.475, yoyo: true, repeat: 1, ease: "sine.inOut" }, "flip")
                .to(".ob-env__shadow", { scaleX: 0.55, opacity: 0.6, duration: 0.475, yoyo: true, repeat: 1, ease: "sine.inOut" }, "flip")
                .fromTo(".ob-env-hint", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 });
            arrival.current = tl;
            if (reduce) tl.progress(1);
        },
        { scope: root },
    );

    const skipToFlip = () => {
        const tl = arrival.current;
        if (tl && tl.time() < tl.labels.flip!) tl.seek("flip");
    };

    // Handlers add their animations to the hook's context, so they're scoped to the envelope and reverted with it.
    const breakSeal = () => {
        if (phase !== "back" || !seal.current || !shards.current) return;
        setPhase("opening");
        const rect = seal.current.getBoundingClientRect();
        // Same pixel density as on screen, so the filter's lighting matches the seal.
        const image = rasterize(seal.current, Math.ceil(rect.width * Math.min(window.devicePixelRatio || 1, 2))).catch(() => null);
        context.add(() => {
        const tl = gsap.timeline();
        tl.to(".ob-env-hint, .ob-env-links", { autoAlpha: 0, duration: 0.3 })
            .fromTo(".ob-seal__cracks path", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.22, stagger: 0.04, ease: "power1.in" }, 0)
            .to(".ob-env__seal", { x: "+=1.5", duration: 0.04, repeat: 5, yoyo: true }, 0.05)
            .add(async () => {
                const img = await image;
                if (img && shards.current) void burst(shards.current, img, rect);
            }, 0.3)
            .set(".ob-env__seal", { autoAlpha: 0 }, 0.32)
            .to(".ob-env__flap-shade", { autoAlpha: 0, duration: 0.3 }, 0.35)
            .to(".ob-env__flap", { rotationX: 180, duration: 0.75, ease: "power2.inOut" }, 0.35)
            .set(".ob-env__flap", { z: -2 })
            .to(".ob-env__letter", { yPercent: -112, duration: 0.85, ease: "power2.out" }, ">-0.05")
            .add(() => {
                const letter = root.current?.querySelector(".ob-env__letter");
                if (letter) onLetterOut(letter.getBoundingClientRect());
            })
            .set(".ob-env__letter", { autoAlpha: 0 })
            .to(".ob-env", { y: "115vh", rotation: 9, duration: 0.9, ease: "power2.in" })
            .to(".ob-env__shadow", { opacity: 0, duration: 0.4 }, "<");
        if (reduce) tl.progress(1);
        });
    };

    const leave = (then: () => void) => {
        arrival.current?.kill();
        context.add(() => {
            gsap.timeline({ onComplete: then })
                .to(".ob-env-hint, .ob-env-links", { autoAlpha: 0, duration: 0.25 })
                .to(".ob-env", { y: "115vh", rotation: -8, duration: reduce ? 0 : 0.8, ease: "power2.in" }, 0);
        });
    };

    return (
        <div ref={root} className="ob-env-stage">
            <div className="ob-env">
                <div className="ob-env__shadow" />
                <div className="ob-env__body">
                    <div className="ob-env__face ob-paper ob-env__front" onClick={skipToFlip}>
                        <Stamp />
                        <Postmark />
                        <div className="ob-env__address">
                            <p className="ob-write ob-write--small">Welcome to the</p>
                            <p className="ob-write ob-write--big">Yu-Gi-Oh!</p>
                            <p className="ob-write ob-write--big">Progression Series</p>
                            <svg viewBox="0 0 300 20" className="ob-flourish-svg" aria-hidden>
                                <path className="ob-flourish" d="M4 12 C60 2 110 18 160 10 S250 4 296 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                            <p className="ob-to">To the duelist who finds this letter</p>
                        </div>
                    </div>
                    <div className="ob-env__face ob-env__back">
                        <div className="ob-env__inside" />
                        <div className="ob-env__letter ob-paper" />
                        <div className="ob-env__pocket ob-paper">
                            <Folds />
                        </div>
                        <div className="ob-env__flap-shade" />
                        <div className="ob-env__flap">
                            <div className="ob-env__flap-out ob-paper" />
                            <div className="ob-env__flap-in" />
                        </div>
                        <div className="ob-env__seal" onClick={breakSeal}>
                            <WaxSeal ref={seal} className="ob-seal" />
                        </div>
                    </div>
                </div>
            </div>
            <canvas ref={shards} className="ob-shards" aria-hidden />
            <div className="ob-env-under">
                <button type="button" className="ob-env-hint" onClick={breakSeal} disabled={phase !== "back"} aria-label="Break the seal">
                    Break the seal
                </button>
                <div className="ob-env-links">
                    <button type="button" className="ob-desk-link" onClick={() => leave(onSignIn)}>I already have an invitation</button>
                    <span aria-hidden>·</span>
                    <button type="button" className="ob-desk-link" onClick={() => leave(onGuest)}>Play as a guest</button>
                </div>
            </div>
        </div>
    );
}
