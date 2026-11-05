"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { CardSet } from "@/lib/api";
import { markLoaded } from "@/lib/utils";
import RoadChain, { type RoadSpan } from "@/components/timeline/RoadChain";
import { launchFlight } from "@/lib/pack-flight";

type Match = { winner: "player" | "opponent" } | undefined;

const LOCK = (
    <svg className="road-stop__lock" viewBox="0 0 40 48" aria-hidden="true">
        <path d="M10 22V14a10 10 0 0 1 20 0v8" fill="none" stroke="#8d877c" strokeWidth="5" />
        <rect x="4" y="21" width="32" height="25" rx="4" fill="#77716a" stroke="#2b2722" strokeWidth="1.5" />
        <circle cx="20" cy="31" r="3.5" fill="#2b2722" />
        <rect x="18.5" y="32" width="3" height="8" rx="1" fill="#2b2722" />
    </svg>
);

/**
 * The phone timeline: the packs climb a vertical road, zigzagging left and
 * right, joined by the same physics chain as the desktop carousel. Every pack is
 * the same size; tapping one opens its packs, as on desktop.
 */
export default function TimelineRoad({
    sets,
    currentSetIndex,
    matchFor,
}: {
    sets: CardSet[];
    currentSetIndex: number;
    matchFor: (set: CardSet) => Match;
}) {
    const road = useRef<HTMLDivElement>(null);
    const [spans, setSpans] = useState<RoadSpan[]>([]);
    // Only the chains near the screen get a canvas: a long series has over a hundred.
    const [near, setNear] = useState({ top: 0, bottom: 0 });

    // Hang a chain from the bottom of each pack to the top of the next, re-measured when the road resizes.
    useLayoutEffect(() => {
        const el = road.current;
        if (!el) return;
        const measure = () => {
            const arts = [...el.querySelectorAll<HTMLElement>(".road-stop__art")];
            const r = el.getBoundingClientRect();
            const at = (b: DOMRect, y: number) => [b.left + b.width / 2 - r.left + el.scrollLeft, y - r.top + el.scrollTop] as const;
            setSpans(arts.slice(1).map((art, i) => {
                const from = arts[i]!.getBoundingClientRect(), to = art.getBoundingClientRect();
                const [ax, ay] = at(from, from.bottom - 8), [bx, by] = at(to, to.top + 8);
                return { ax: Math.round(ax), ay: Math.round(ay), bx: Math.round(bx), by: Math.round(by) };
            }));
        };
        let bucket = NaN;
        const track = () => {
            const b = Math.floor(el.scrollTop / 300);
            if (b === bucket) return;
            bucket = b;
            setNear({ top: b * 300 - el.clientHeight, bottom: b * 300 + el.clientHeight * 2 });
        };
        const resize = () => {
            measure();
            bucket = NaN;
            track();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        el.addEventListener("scroll", track, { passive: true });
        return () => {
            ro.disconnect();
            el.removeEventListener("scroll", track);
        };
    }, [sets.length]);

    // Open on the current set, centred.
    useLayoutEffect(() => {
        const el = road.current, stop = document.getElementById(`set-${currentSetIndex}`);
        if (el && stop) el.scrollTop = stop.offsetTop - el.clientHeight / 2 + stop.offsetHeight / 2;
    }, [currentSetIndex, sets.length]);

    return (
        <div ref={road} className="road">
            {sets.map((set, idx) => {
                const state = idx < currentSetIndex ? "past" : idx === currentSetIndex ? "current" : "future";
                const match = matchFor(set);
                return (
                    <div key={`${set.set_code}-${idx}`}>
                        {idx > 0 && <div className="road-gap" />}
                        <Link
                            href={`/packs?set=${idx}`}
                            onClick={() => launchFlight(idx)}
                            id={`set-${idx}`}
                            className={`road-stop road-stop--${state} ${idx % 2 ? "road-stop--alt" : ""}`}
                        >
                            <div className="road-stop__art art-loading">
                                {set.set_image && (
                                    <img
                                        ref={markLoaded}
                                        onLoad={markLoaded}
                                        src={set.set_image}
                                        alt={set.set_name}
                                        loading={Math.abs(idx - currentSetIndex) < 3 ? "eager" : "lazy"}
                                        fetchPriority={idx === currentSetIndex ? "high" : "auto"}
                                    />
                                )}
                                {match && (
                                    <div className="road-stop__stamp">
                                        <span className={`timeline-stamp timeline-stamp--inked ${match.winner === "player" ? "timeline-stamp--won" : "timeline-stamp--lost"}`}>
                                            {match.winner === "player" ? "WON" : "LOST"}
                                        </span>
                                    </div>
                                )}
                                {state === "future" && LOCK}
                            </div>
                            <div className="road-stop__info">
                                <h3>{set.set_name}</h3>
                                <span>{set.tcg_date}</span>
                                {state === "current" && <span className="road-stop__now">NOW PLAYING</span>}
                            </div>
                        </Link>
                    </div>
                );
            })}
            {spans.map((span, i) => span.by > near.top && span.ay < near.bottom && (
                <RoadChain key={i} span={span} done={i + 1 <= currentSetIndex} scroller={road} />
            ))}
        </div>
    );
}
