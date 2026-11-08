"use client";

import Link from "next/link";
import { CardSet } from "@/lib/api";
import { markLoaded } from "@/lib/utils";
import ChainConnector from "@/components/timeline/ChainConnector";
import { launchFlight } from "@/lib/pack-flight";

type Match = { winner: "player" | "opponent" } | undefined;

/**
 * One booster-pack tile in the timeline carousel: chain connector (except
 * first), pack art with an optional WON/LOST stamp, and the set name/date.
 * Every tile is the same slot; inside, a gilt frame hugs the pack art: bronze, or a breathing gold
 * bevel on the `current` set. Others are dimmed + greyed.
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
                    onClick={() => launchFlight(index)}
                    className="timeline-node__art art-loading"
                >
                    {/* A fixed slot (the chains line up on it); the gilt frame inside hugs the pack art, as on phones. */}
                    <div className="timeline-node__frame">
                        {set.set_image ? (
                            <img
                                ref={markLoaded}
                                onLoad={markLoaded}
                                src={set.set_image}
                                alt={set.set_name}
                                className="timeline-node__img"
                                loading={current ? "eager" : "lazy"}
                                fetchPriority={current ? "high" : "auto"}
                            />
                        ) : (
                            <div className="timeline-node__art-fallback">No Image</div>
                        )}

                        {match && (
                            <div className="timeline-node__stamp-overlay">
                                <span className={`timeline-stamp timeline-stamp--inked ${match.winner === "player" ? "timeline-stamp--won" : "timeline-stamp--lost"}`}>
                                    {match.winner === "player" ? "WON" : "LOST"}
                                </span>
                            </div>
                        )}
                    </div>
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
