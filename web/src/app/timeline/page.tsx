"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets, CardSet } from "@/lib/api";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import RecordMatch from "@/components/RecordMatch";
import TopBar from "@/components/TopBar";
import GuideSprite from "@/components/GuideSprite";

export default function TimelinePage() {
    const { matchHistory, recordMatch, advanceSet, currentSetIndex } = useProgression();
    const router = useRouter();
    const [sets, setSets] = useState<CardSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAnimation, setShowAnimation] = useState<'victory' | 'defeat' | null>(null);

    useEffect(() => {
        async function loadSets() {
            const data = await fetchAllSets();
            setSets(data);
            setLoading(false);
        }
        loadSets();
    }, []);

    // Calculate win rate and streak from match history
    const wins = matchHistory.filter(m => m.winner === 'player').length;
    const total = matchHistory.length;
    const winRate = total > 0 ? `${Math.round((wins / total) * 100)}%` : '--';

    // Calculate current streak
    let streak = 0;
    for (let i = matchHistory.length - 1; i >= 0; i--) {
        const isWin = matchHistory[i].winner === 'player';
        if (i === matchHistory.length - 1) {
            streak = isWin ? 1 : -1;
        } else {
            const prevWin = matchHistory[i + 1].winner === 'player';
            if (isWin === prevWin) {
                streak += isWin ? 1 : -1;
            } else {
                break;
            }
        }
    }
    const streakDisplay = streak === 0 ? '--' : (streak > 0 ? `+${streak}` : `${streak}`);

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
                <div className="text-xl animate-pulse">Loading...</div>
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
        <div className="min-h-screen flex flex-col">
            <div className="sticky top-0 z-[40]">
                <TopBar showBack onBack={() => router.push('/map')} title="Record Match" />
            </div>

            {currentSet && (
                <RecordMatch
                    onRecord={handleRecordMatch}
                    onCancel={() => router.push('/map')}
                    mode="fullPage"
                    winRate={winRate}
                    streak={streakDisplay}
                />
            )}

            {/* Character Sprite - Bottom Left */}
            <GuideSprite />
        </div>
    );
}
