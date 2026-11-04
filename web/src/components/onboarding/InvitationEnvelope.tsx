"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** A sealed invitation; clicking cracks the wax seal, opens the flap, then calls `onOpen`. */
export default function InvitationEnvelope({ onOpen }: { onOpen: () => void }) {
    const [cracked, setCracked] = useState(false);
    const reduce = useReducedMotion();

    const open = () => {
        if (cracked) return;
        setCracked(true);
        setTimeout(onOpen, reduce ? 0 : 900);
    };

    const half = (side: -1 | 1) => ({
        initial: { x: 0, rotate: 0, opacity: 1 },
        animate: cracked ? { x: side * 26, y: 18, rotate: side * 35, opacity: 0 } : {},
        transition: { duration: 0.6, ease: "easeIn" as const },
    });

    return (
        <div className="flex flex-col items-center gap-5">
            <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-primary">A letter has arrived for you</p>
            <button type="button" onClick={open} aria-label="Break the seal" className="group w-full max-w-sm focus:outline-none">
                <svg viewBox="0 0 320 210" className="w-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)] transition-transform group-hover:-translate-y-1">
                    <defs>
                        <radialGradient id="dk-wax" cx="0.38" cy="0.32" r="0.75">
                            <stop offset="0" stopColor="#c43a3a" />
                            <stop offset="0.6" stopColor="#8b1a1a" />
                            <stop offset="1" stopColor="#5c0f0f" />
                        </radialGradient>
                        <linearGradient id="dk-paper" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="var(--parchment-light)" />
                            <stop offset="1" stopColor="var(--parchment)" />
                        </linearGradient>
                    </defs>
                    <rect x="4" y="4" width="312" height="202" rx="8" fill="url(#dk-paper)" stroke="var(--wood-border)" strokeWidth="3" />
                    <path d="M4 206 L4 4 L160 116 Z M316 206 L316 4 L160 116 Z" fill="#000" opacity="0.04" />
                    <path d="M4 206 L160 108 L316 206" fill="none" stroke="var(--wood-border)" strokeWidth="2" opacity="0.6" />
                    <motion.path
                        d="M4 4 L160 116 L316 4 Z"
                        fill="var(--parchment-light)"
                        stroke="var(--wood-border)"
                        strokeWidth="3"
                        style={{ originY: 0, transformBox: "fill-box" }}
                        animate={cracked ? { scaleY: -0.6 } : { scaleY: 1 }}
                        transition={{ duration: 0.5, delay: reduce ? 0 : 0.35 }}
                    />
                    <text x="160" y="190" textAnchor="middle" fontSize="11" letterSpacing="4" fill="var(--wood-light)" fontFamily="serif">
                        DUELIST KINGDOM
                    </text>
                    <g transform="translate(160 112)">
                        {cracked ? (
                            <>
                                <motion.path d="M0 -28 A28 28 0 0 0 0 28 L4 10 L-3 0 L4 -12 Z" fill="url(#dk-wax)" stroke="#4a0b0b" strokeWidth="2" {...half(-1)} />
                                <motion.path d="M0 -28 A28 28 0 0 1 0 28 L4 10 L-3 0 L4 -12 Z" fill="url(#dk-wax)" stroke="#4a0b0b" strokeWidth="2" {...half(1)} />
                            </>
                        ) : (
                            <>
                                <path
                                    d="M0 -31 C9 -31 13 -27 20 -25 C27 -21 31 -14 30 -5 C33 3 30 13 24 19 C19 27 9 31 0 30 C-9 32 -18 28 -24 21 C-30 14 -32 4 -30 -5 C-31 -15 -25 -23 -17 -27 C-11 -30 -6 -31 0 -31 Z"
                                    fill="url(#dk-wax)"
                                    stroke="#4a0b0b"
                                    strokeWidth="1.5"
                                />
                                <circle r="20" fill="none" stroke="#5c0f0f" strokeWidth="2.5" opacity="0.8" />
                                <circle r="20" fill="none" stroke="#d65050" strokeWidth="0.8" opacity="0.5" transform="translate(-0.8 -0.8)" />
                                <path d="M0 -12l3.5 7.2 8 1.1-5.8 5.6 1.4 7.9L0 6.1l-7.1 3.7 1.4-7.9-5.8-5.6 8-1.1z" fill="var(--primary)" stroke="#7a5a12" strokeWidth="0.8" />
                            </>
                        )}
                    </g>
                </svg>
            </button>
            <p className="text-xs text-gray-500">{cracked ? "Opening…" : "Click the seal to open it"}</p>
        </div>
    );
}
