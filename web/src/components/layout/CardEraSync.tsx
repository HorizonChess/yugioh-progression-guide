"use client";

import { useEffect } from "react";
import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets } from "@/lib/api";
import { setCardEra } from "@/lib/card-era";

/** Keeps card text in step with the active series' current set (see lib/card-era). Renders nothing. */
export default function CardEraSync() {
    const { series, currentSetIndex } = useProgression();
    useEffect(() => {
        if (!series) return setCardEra(null);
        let live = true;
        fetchAllSets().then((sets) => live && setCardEra(sets[currentSetIndex]?.tcg_date ?? null));
        return () => {
            live = false;
        };
    }, [series, currentSetIndex]);
    return null;
}
