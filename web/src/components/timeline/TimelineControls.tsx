"use client";

import NavArrow from "@/components/ui/NavArrow";

/** Back/forward arrows that flank the timeline carousel. */
export default function TimelineControls({
    onScroll,
}: {
    onScroll: (direction: "left" | "right") => void;
}) {
    return (
        <>
            <NavArrow dir="prev" label="Scroll timeline left" onClick={() => onScroll("left")} className="nav-arrow--lg absolute top-1/2 -translate-y-1/2 z-20 left-4 sm:left-8" />
            <NavArrow dir="next" label="Scroll timeline right" onClick={() => onScroll("right")} className="nav-arrow--lg absolute top-1/2 -translate-y-1/2 z-20 right-4 sm:right-8" />
        </>
    );
}
