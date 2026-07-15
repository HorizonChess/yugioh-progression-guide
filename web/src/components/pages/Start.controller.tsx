"use client";

import { useProgression } from "@/context/ProgressionContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function StartPage() {
    const { startSeries, hasStarted, hasLoaded } = useProgression();
    const router = useRouter();
    const [showContent, setShowContent] = useState(false);

    useEffect(() => {
        setShowContent(true);
    }, []);

    const handleStart = () => {
        if (hasStarted) {
            if (!confirm("Starting a new series will overwrite your current progress. Are you sure?")) {
                return;
            }
        }
        startSeries();
        router.push('/map');
    };

    const handleContinue = () => {
        router.push('/map');
    };

    if (!hasLoaded) return null;

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-black overflow-hidden relative">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-black to-black"></div>
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>

            <div className={`relative z-10 text-center transition-all duration-1000 transform ${showContent ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                <h1 className="text-8xl font-black mb-2 tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">
                    DUEL
                </h1>
                <h2 className="text-4xl font-bold mb-12 text-[var(--primary)] tracking-[1em] uppercase">
                    Monsters
                </h2>

                <div className="flex flex-col gap-6 items-center w-full max-w-md mx-auto">
                    {hasStarted && (
                        <button
                            onClick={handleContinue}
                            className="w-full py-4 bg-white text-black font-black text-xl rounded hover:bg-gray-200 transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                        >
                            CONTINUE JOURNEY
                        </button>
                    )}

                    <button
                        onClick={handleStart}
                        className={`w-full py-4 border border-white/20 text-white font-bold text-xl rounded hover:bg-white/10 transition-all ${!hasStarted ? 'bg-primary text-black border-none hover:bg-primary-hover' : ''}`}
                    >
                        NEW GAME
                    </button>
                </div>

                <p className="mt-16 text-gray-600 text-sm font-mono">
                    PROGRESSION SERIES SIMULATOR v1.0
                </p>
            </div>
        </main>
    );
}
