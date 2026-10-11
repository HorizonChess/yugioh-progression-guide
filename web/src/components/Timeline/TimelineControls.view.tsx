"use client";

/** Left/right scroll arrows that flank the timeline carousel. */
export default function TimelineControls({
    onScroll,
}: {
    onScroll: (direction: "left" | "right") => void;
}) {
    return (
        <>
            <button
                onClick={() => onScroll("left")}
                aria-label="Scroll timeline left"
                className="timeline-scroll-btn left-4 sm:left-8"
            >
                <svg className="timeline-scroll-btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <button
                onClick={() => onScroll("right")}
                aria-label="Scroll timeline right"
                className="timeline-scroll-btn right-4 sm:right-8"
            >
                <svg className="timeline-scroll-btn__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </button>
        </>
    );
}
