"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TopBarProps {
    title?: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    children?: React.ReactNode;
}

import { useProgression } from "@/context/ProgressionContext";

export default function TopBar({ title, subtitle, showBack, onBack, children }: TopBarProps) {
    const { isGuideVisible, toggleGuide } = useProgression();
    const [duelistName, setDuelistName] = useState("Duelist");

    useEffect(() => {
        setDuelistName(localStorage.getItem("duelistName") || "Duelist");
    }, []);

    return (
        <div className="sticky top-0 z-50 bg-gradient-to-b from-gray-900 to-black border-b-2 border-gray-700 p-3 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-4">
                {showBack && (
                    <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                )}

                {/* Guide Toggle - Pixel Art Head */}
                <button
                    onClick={toggleGuide}
                    className={`relative w-10 h-10 rounded-full border-2 overflow-hidden transition-all duration-200 ${isGuideVisible
                        ? 'border-[var(--primary)] shadow-[0_0_10px_var(--primary)] bg-[var(--primary)]/20'
                        : 'border-gray-600 opacity-50 hover:opacity-100 hover:border-gray-400'
                        }`}
                    title={isGuideVisible ? "Hide Guide" : "Show Guide"}
                >
                    <img
                        src="/sprites/yugi_neutral_v2_transparent.png?v=4"
                        alt="Toggle Guide"
                        className="w-full h-full object-cover object-top scale-150 translate-y-1"
                    />
                </button>

                {title ? (
                    <div>
                        <h1 className="text-xl font-bold text-white leading-none">{title}</h1>
                        {subtitle && <p className="text-xs text-gray-400 font-mono">{subtitle}</p>}
                    </div>
                ) : (
                    <Link href="/menu" className="group flex items-center gap-4 hover:opacity-80 transition-opacity">
                        <div>
                            <h2 className="text-[var(--primary)] font-bold text-lg tracking-wider uppercase leading-none">{duelistName}</h2>
                            <p className="text-[10px] text-gray-500 font-mono">ID: 8492-001</p>
                        </div>
                    </Link>
                )}
            </div>

            <div className="flex items-center gap-6">
                {children}

                {!children && (
                    <>
                        <div className="hidden md:flex gap-4 text-xs font-bold tracking-widest text-gray-500">
                            <Link href="/map" className="hover:text-white transition-colors">CAMPAIGN</Link>
                            <Link href="/collection" className="hover:text-white transition-colors">COLLECTION</Link>
                            <Link href="/deck-builder" className="hover:text-white transition-colors">DECK BUILDER</Link>
                            <Link href="/menu" className="hover:text-white transition-colors">MENU</Link>
                        </div>
                        <div className="text-right">
                            <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                                PROGRESSION
                            </h1>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
