"use client";

import Link from "next/link";
import { CardSet } from "@/lib/api";
import ChainConnector from "@/components/timeline/ChainConnector";

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
        <div className="timeline-link">
            {showConnector && (
                <div className="timeline-link__connector">
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
                        <div className="timeline-node__art-inner">
                            <img
                                src={set.set_image}
                                alt={set.set_name}
                                className="timeline-node__img"
                                loading="lazy"
                                style={{ imageRendering: "auto" }}
                            />
                        </div>
                    ) : (
                        <div className="timeline-node__art-fallback">No Image</div>
                    )}

                    {match && (
                        <div className="timeline-node__stamp-overlay">
                            <span className={`timeline-stamp ${match.winner === "player" ? "timeline-stamp--won" : "timeline-stamp--lost"}`}>
                                {match.winner === "player" ? "WON" : "LOST"}
                            </span>
                        </div>
                    )}
                </Link>

                <div className="timeline-node__caption">
                    <h3 className={`timeline-node__name ${current ? "timeline-node__name--current" : "timeline-node__name--other"}`}>
                        {set.set_name}
                    </h3>
                    <span className={`timeline-node__date ${current ? "timeline-node__date--current" : "timeline-node__date--other"}`}>
                        {set.tcg_date}
                    </span>
                </div>
            </div>
        </div>
    );
}
