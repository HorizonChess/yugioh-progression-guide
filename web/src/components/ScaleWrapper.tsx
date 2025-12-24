"use client";

import { useState, useEffect, ReactNode } from "react";
import { useLayoutDesignerContext } from "@/context/LayoutDesignerContext";

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
 * Scales content based on viewport width, with height adapting dynamically.
 * This ensures layouts fill the viewport exactly on any screen size.
 *
 * Usage:
 * ```tsx
 * <ScaleWrapper>
 *     <div className="h-full">  // Use h-full, not h-screen!
 *         Your page content
 *     </div>
 * </ScaleWrapper>
 * ```
 *
 * Important: Content inside should use `h-full` instead of `h-screen`
 * since it needs to reference the container, not the viewport.
 */
export default function ScaleWrapper({ children, backgroundColor = '#0f172a' }: ScaleWrapperProps) {
    const { setScaleFactor } = useLayoutDesignerContext();
    const [zoom, setZoom] = useState(1);
    const [designHeight, setDesignHeight] = useState(911); // Initial value, will be recalculated

    useEffect(() => {
        function updateZoom() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Scale based on width - ensures content always fills viewport horizontally
            const scale = vw / DESIGN_WIDTH;

            // Calculate height to fill viewport exactly
            // designHeight * scale = vh, so designHeight = vh / scale
            const adaptiveHeight = vh / scale;

            setZoom(scale);
            setDesignHeight(adaptiveHeight);
            setScaleFactor(scale); // Report scale to designer context
        }

        updateZoom();
        window.addEventListener('resize', updateZoom);
        return () => window.removeEventListener('resize', updateZoom);
    }, [setScaleFactor]);

    return (
        // Outer container - takes full viewport, clips overflow
        // Using 100% instead of 100vw to avoid scrollbar width issues on Windows
        <div
            data-scale-wrapper="true"
            data-scale={zoom}
            style={{
                width: '100%',
                height: '100vh',
                overflow: 'hidden',
                backgroundColor,
                position: 'fixed',
                top: 0,
                left: 0,
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
