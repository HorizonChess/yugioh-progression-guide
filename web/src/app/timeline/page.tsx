"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StonePanel from "@/components/StonePanel";
import ParchmentButton from "@/components/ParchmentButton";

export default function TimelinePage() {
    const { matchHistory, recordMatch, advanceSet, currentSetIndex } = useProgression();
    const router = useRouter();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [showAnimation, setShowAnimation] = useState<'victory' | 'defeat' | null>(null);

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
    }, []);

    const handleRecordMatch = (winner: 'player' | 'opponent') => {
        const currentSet = sets[currentSetIndex];
        if (!currentSet) return;

        // Show animation first
        setShowAnimation(winner === 'player' ? 'victory' : 'defeat');

        // Delay actual recording and navigation to let animation play
        setTimeout(() => {
            recordMatch({
                winner,
                packName: currentSet.set_name,
                date: new Date().toISOString()
            });
            advanceSet();
            router.push('/map'); // Go to map to see progress
        }, 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading Timeline...</div>
            </div>
        );
    }

    if (showAnimation) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                <div className="text-center animate-in zoom-in duration-500">
                    <h1 className={`text-6xl md:text-8xl font-black uppercase tracking-tighter mb-4 ${showAnimation === 'victory'
                        ? 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]'
                        : 'text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 drop-shadow-[0_0_30px_rgba(220,38,38,0.5)]'
                        }`}>
                        {showAnimation === 'victory' ? 'VICTORY' : 'DEFEAT'}
                    </h1>
                    <p className="text-2xl text-white font-bold animate-pulse">
                        Advancing to next set...
                    </p>
                </div>
            </div>
        );
    }

    const currentSet = sets[currentSetIndex];

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-white">Progression Timeline</h1>
                    <Link href="/map" className="text-[var(--primary)] hover:underline">
                        Back to Map
                    </Link>
                </div>

                {/* Record Match Section */}
                {currentSet && (
                    <StonePanel title={`Current Match: ${currentSet.set_name}`} className="mb-12 border-l-4 border-[var(--primary)]">
                        {!isRecording ? (
                            <ParchmentButton
                                onClick={() => setIsRecording(true)}
                                className="w-full md:w-auto"
                            >
                                Record Match Result
                            </ParchmentButton>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <p className="text-[#e6dcc3] font-bold drop-shadow-md">Who won the match?</p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleRecordMatch('player')}
                                        className="flex-1 py-4 bg-green-900/80 border-2 border-green-500/50 rounded-xl hover:bg-green-800 transition-colors font-bold text-green-100 group relative overflow-hidden shadow-lg active:scale-95"
                                    >
                                        <span className="relative z-10 drop-shadow-md">I Won (Victory)</span>
                                        <div className="absolute inset-0 bg-green-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    </button>
                                    <button
                                        onClick={() => handleRecordMatch('opponent')}
                                        className="flex-1 py-4 bg-red-900/80 border-2 border-red-500/50 rounded-xl hover:bg-red-800 transition-colors font-bold text-red-100 group relative overflow-hidden shadow-lg active:scale-95"
                                    >
                                        <span className="relative z-10 drop-shadow-md">Opponent Won (Defeat)</span>
                                        <div className="absolute inset-0 bg-red-500/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                    </button>
                                </div>
                                <button
                                    onClick={() => setIsRecording(false)}
                                    className="text-sm text-[#d4af37] hover:text-[#f5c542] hover:underline font-bold"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </StonePanel>
                )}

                {/* Timeline */}
                <div className="relative border-l-2 border-white/10 ml-4 space-y-8 pb-12">
                    {matchHistory.length === 0 ? (
                        <div className="pl-8 text-gray-500 italic">No matches recorded yet.</div>
                    ) : (
                        matchHistory.slice().reverse().map((match, idx) => (
                            <div key={idx} className="relative pl-8">
                                {/* Timeline Dot */}
                                <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-[var(--background)] ${match.winner === 'player' ? 'bg-green-500' : 'bg-red-500'}`}></div>

                                <div className="glass-panel p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg">{match.packName}</h3>
                                        <span className="text-xs text-gray-500">{new Date(match.date).toLocaleDateString()}</span>
                                    </div>
                                    <div className={`font-bold ${match.winner === 'player' ? 'text-green-400' : 'text-red-400'}`}>
                                        {match.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
