"use client";

import { useState } from "react";

/** One of the two stone tablets: Yugi cheering (victory) or bowed (defeat), its gold lines lit when chosen. */
export function Tablet({ side, chosen = false, dim = false, onClick, label }: {
    side: "win" | "lose";
    chosen?: boolean;
    dim?: boolean;
    onClick?: () => void;
    label?: string;
}) {
    return (
        <button
            type="button"
            className={`rm-pick rm-pick--${side} ${chosen ? "rm-pick--chosen" : ""} ${dim ? "rm-pick--dim" : ""}`}
            onClick={onClick}
            disabled={!onClick}
            aria-label={label}
            aria-pressed={onClick ? undefined : chosen}
        >
            <span className="rm-tablet"><i className="rm-tablet__slab" /><i className="rm-tablet__lines" /></span>
            <b className={`rm-word rm-carved ${side === "lose" ? "rm-carved--red" : ""}`}>{side === "win" ? "Victory" : "Defeat"}</b>
        </button>
    );
}

/**
 * The choice: "How did the duel go?" over the two tablets. A tablet stays pressed and lit
 * while the result is reported; the page then plays the act that follows.
 */
export default function RecordMatch({ onRecord }: { onRecord: (winner: "player" | "opponent") => void | Promise<void> }) {
    const [picked, setPicked] = useState<"player" | "opponent" | null>(null);
    const pick = async (winner: "player" | "opponent") => {
        if (picked) return;
        setPicked(winner);
        try {
            await onRecord(winner);
        } finally {
            setPicked(null);
        }
    };
    return (
        <>
            <b className="rm-ask rm-carved">How did the duel go?</b>
            <div className="rm-tabs">
                <Tablet side="win" chosen={picked === "player"} dim={picked === "opponent"} onClick={picked ? undefined : () => void pick("player")} label="Record a victory" />
                <Tablet side="lose" chosen={picked === "opponent"} dim={picked === "player"} onClick={picked ? undefined : () => void pick("opponent")} label="Record a defeat" />
            </div>
        </>
    );
}
