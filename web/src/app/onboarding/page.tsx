"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProgression } from "@/context/ProgressionContext";

export default function OnboardingPage() {
    const [name, setName] = useState("");
    const router = useRouter();
    // We'll need to add a setName method to context later, for now just local state/logic
    // const { setUserName } = useProgression(); 

    const handleStart = () => {
        if (!name.trim()) return;

        // TODO: Save name to context/persistence
        localStorage.setItem("duelistName", name);

        router.push("/menu");
    };

    return (
        <main className="min-h-screen bg-black text-white flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--primary)_0%,_transparent_70%)] opacity-10 animate-pulse"></div>
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>

            <div className="relative z-10 max-w-md w-full bg-black/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-[var(--primary)] to-yellow-200 mb-2">
                        WELCOME DUELIST
                    </h1>
                    <p className="text-gray-400">Enter your name to begin your progression journey.</p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                            Duelist Name
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Seto Kaiba"
                            className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-4 py-3 text-lg font-bold text-white placeholder-gray-600 focus:border-[var(--primary)] focus:outline-none transition-colors"
                            onKeyDown={(e) => e.key === "Enter" && handleStart()}
                        />
                    </div>

                    <button
                        onClick={handleStart}
                        disabled={!name.trim()}
                        className="w-full py-4 bg-primary text-black font-black text-xl rounded-xl hover:bg-primary-hover transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(212,175,55,0.3)]"
                    >
                        START JOURNEY
                    </button>
                </div>
            </div>
        </main>
    );
}
