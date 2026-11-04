"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProgression } from "@/context/ProgressionContext";
import { NAV_ROUTES } from "@/components/layout/AppNav";

/** Game pages need a save: until one is picked they show a way back to the menu instead. */
export default function SeriesGate({ children }: { children: ReactNode }) {
    const pathname = usePathname().replace(/(.)\/$/, "$1");
    const { hasLoaded, activeSeriesId } = useProgression();

    if (!NAV_ROUTES.has(pathname) || (hasLoaded && activeSeriesId)) return <>{children}</>;

    return (
        <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
            {hasLoaded ? (
                <>
                    <h1 className="text-2xl font-bold text-white">No save selected</h1>
                    <p className="text-gray-400">Pick or start a run from Campaign Mode first.</p>
                    <Link href="/menu" className="text-primary font-bold hover:underline">Go to the menu</Link>
                </>
            ) : (
                <div className="text-xl animate-pulse text-white/80">Loading…</div>
            )}
        </div>
    );
}
