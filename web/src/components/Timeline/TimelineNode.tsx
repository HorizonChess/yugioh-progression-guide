"use client";

import Link from "next/link";
import { CardSet } from "@/lib/api";
import ChainConnector from "@/components/ChainConnector";

type Match = { winner: "player" | "opponent" } | undefined;

/**
 * One booster-pack tile in the timeline carousel: chain connector (except
 * first), pack art with an optional WON/LOST stamp, and the set name/date.
 * The `current` set is scaled up and gold-ringed; others are dimmed + greyed.
 */
export default function TimelineNode({
    set,
    index,
    current,
    reached,
    match,
    showConnector,
}: {
    set: CardSet;
    index: number;
    current: boolean;
    reached: boolean;
    match: Match;
    showConnector: boolean;
}) {
    return (
        <div className="flex items-center">
            {showConnector && (
                <div className="flex-shrink-0 -mx-4 z-0">
                    <ChainConnector active={reached} />
                </div>
            )}

            <div
                id={`set-${index}`}
                className={`timeline-node ${current ? "timeline-node--current" : "timeline-node--other"}`}
            >
                <Link
                    href={`/packs?set=${index}`}
                    className={`timeline-node__art ${current ? "timeline-node__art--current" : "timeline-node__art--other"}`}
                >
                    {set.set_image ? (
                        <div className="w-full h-full flex items-center justify-center overflow-hidden">
                            <img
                                src={set.set_image}
                                alt={set.set_name}
                                className="w-full h-full object-contain transform hover:scale-110 transition-transform duration-700"
                                loading="lazy"
                                style={{ imageRendering: "auto" }}
                            />
                        </div>
                    ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs text-gray-500">
                            No Image
                        </div>
                    )}

                    {match && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                            <span className={`timeline-stamp ${match.winner === "player" ? "timeline-stamp--won" : "timeline-stamp--lost"}`}>
                                {match.winner === "player" ? "WON" : "LOST"}
                            </span>
                        </div>
                    )}
                </Link>

                <div className="text-center max-w-[min(12rem,40vw)]">
                    <h3 className={`font-bold text-sm mb-1 truncate ${current ? "text-white text-[clamp(1rem,2.2vh,1.25rem)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" : "text-gray-500"}`}>
                        {set.set_name}
                    </h3>
                    {!current && (
                        <span className="text-xs text-gray-600 font-mono tracking-widest">{set.tcg_date}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
