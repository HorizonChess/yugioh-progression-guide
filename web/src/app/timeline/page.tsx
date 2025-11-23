"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TimelinePage() {
    const { matchHistory, recordMatch, advanceSet, currentSetIndex } = useProgression();
    const router = useRouter();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRecording, setIsRecording] = useState(false);

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

        if (confirm(`Confirm that ${winner === 'player' ? 'YOU' : 'OPPONENT'} won the match for ${currentSet.set_name}? This will advance to the next set.`)) {
            recordMatch({
                winner,
                packName: currentSet.set_name,
                date: new Date().toISOString()
            });
            advanceSet();
            setIsRecording(false);
            router.push('/'); // Go back to dashboard to see new set
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading Timeline...</div>
            </div>
        );
    }

    const currentSet = sets[currentSetIndex];

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-white">Progression Timeline</h1>
                    <Link href="/" className="text-[var(--primary)] hover:underline">
                        Back to Dashboard
                    </Link>
                </div>

                {/* Record Match Section */}
                {currentSet && (
                    <div className="glass-panel p-6 mb-12 border-l-4 border-[var(--primary)]">
                        <h2 className="text-xl font-bold mb-4">Current Match: {currentSet.set_name}</h2>
                        {!isRecording ? (
                            <button
                                onClick={() => setIsRecording(true)}
                                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-bold"
                            >
                                Record Match Result
                            </button>
                        ) : (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <p className="text-gray-300">Who won the match?</p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleRecordMatch('player')}
                                        className="flex-1 py-4 bg-green-900/50 border border-green-500/50 rounded-lg hover:bg-green-800/50 transition-colors font-bold text-green-400"
                                    >
                                        I Won (Victory)
                                    </button>
                                    <button
                                        onClick={() => handleRecordMatch('opponent')}
                                        className="flex-1 py-4 bg-red-900/50 border border-red-500/50 rounded-lg hover:bg-red-800/50 transition-colors font-bold text-red-400"
                                    >
                                        Opponent Won (Defeat)
                                    </button>
                                </div>
                                <button
                                    onClick={() => setIsRecording(false)}
                                    className="text-sm text-gray-500 hover:text-gray-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
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
