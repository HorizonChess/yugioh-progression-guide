"use client";

import { useEffect, useState } from "react";
import { useProgression } from "@/context/ProgressionContext";
import { useAuth } from "@/context/AuthContext";
import { fetchAllSets, type CardSet } from "@/lib/api";
import BotsArena from "@/components/duel/BotsArena";
import GuideSprite from "@/components/layout/GuideSprite";

/**
 * The Bots Arena (route: /bots-arena): practice matches against the bots, any time and as often as
 * you like, with the save's decks and the cards and rules of the set it's at.
 */
export default function BotsArenaPage() {
    const { series, savedDecks, currentSetIndex } = useProgression();
    const userId = useAuth().user?.id;
    const [sets, setSets] = useState<CardSet[] | null>(null);
    useEffect(() => void fetchAllSets().then(setSets), []);

    // (A finished series stays at its last set.)
    const set = sets?.[Math.min(currentSetIndex, sets.length - 1)];
    if (!series || !set) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-xl animate-pulse">{series === null ? "Pick a save first." : "Loading..."}</div>
            </div>
        );
    }
    return (
        <>
            <BotsArena key={series.id} seriesId={series.id} guest={!userId} setName={set.set_name} setDate={set.tcg_date} decks={savedDecks} />
            <GuideSprite />
        </>
    );
}
