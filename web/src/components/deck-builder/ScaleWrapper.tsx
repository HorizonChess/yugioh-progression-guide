"use client";

import { useState, useEffect, useRef, ReactNode } from "react";

// Design width - the reference width for scaling (1080p monitor)
const DESIGN_WIDTH = 1920;

interface ScaleWrapperProps {
    children: ReactNode;
    /** Optional background color for the outer container (visible if content doesn't fill) */
    backgroundColor?: string;
}

/**
 * ScaleWrapper - Adaptive scaling for fixed-width layouts
 *
 * Scales a fixed 1920-wide canvas to fill its CONTAINER (not the viewport), with
 * height adapting dynamically. It's `absolute inset-0`, so it fills whatever
 * `relative` box it's placed in — e.g. the layout's content row BELOW the
 * persistent nav — instead of covering the whole screen. That keeps the nav
 * unscaled and above the board.
 *
 * Usage:
 * ```tsx
 * <div className="relative"> // sized parent
 *     <ScaleWrapper>
 *         <div className="h-full">Your page content</div>
 *     </ScaleWrapper>
 * </div>
 * ```
 *
 * Important: Content inside should use `h-full` instead of `h-screen`
 * since it needs to reference the container, not the viewport.
 */
export default function ScaleWrapper({ children, backgroundColor = '#0f172a' }: ScaleWrapperProps) {
    const outerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(1);
    const [designHeight, setDesignHeight] = useState(911); // Initial value, will be recalculated

    useEffect(() => {
        const el = outerRef.current;
        if (!el) return;

        const updateZoom = () => {
            const cw = el.clientWidth;
            const ch = el.clientHeight;
            if (cw === 0 || ch === 0) return;

            // Scale based on width - ensures content always fills the container horizontally
            const scale = cw / DESIGN_WIDTH;

            // Calculate the design height that, once scaled, exactly fills the container
            // designHeight * scale = ch, so designHeight = ch / scale
            const adaptiveHeight = ch / scale;

            setZoom(scale);
            setDesignHeight(adaptiveHeight);
        };

        updateZoom();
        // Observe the CONTAINER, not the window — the content row can change size
        // independent of the viewport (e.g. the nav row above it).
        const ro = new ResizeObserver(updateZoom);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        // Outer container - fills its (relative) parent, clips overflow.
        <div
            ref={outerRef}
            data-scale-wrapper="true"
            data-scale={zoom}
            style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                backgroundColor,
            }}
        >
            {/* Inner container - fixed width, adaptive height, scaled with transform */}
            <div
                data-scaled-container="true"
                style={{
                    width: DESIGN_WIDTH,
                    height: designHeight,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                {children}
            </div>
        </div>
    );
}
