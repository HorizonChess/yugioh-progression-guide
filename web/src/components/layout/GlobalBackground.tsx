"use client";

import { usePathname } from "next/navigation";
import { asset } from '@/lib/utils';

export default function GlobalBackground() {
    // trailingSlash (for static hosting) makes this "/menu/"; strip it so the check matches
    const pathname = usePathname().replace(/(.)\/$/, "$1");

    // The menu and the title screen draw their own backgrounds.
    if (pathname === '/menu' || pathname === '/') {
        return null;
    }

    const wall = (src: string) => ({
        backgroundColor: '#2a1d10',
        backgroundImage: `url('${asset(src)}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(1.15) contrast(1.15) saturate(1.05)',
    });

    return (
        <>
            {/* The hieroglyph wall (a sharper repaint of the original stone); the warm
                base shows while it loads, instead of grey. Phones get a portrait crop. */}
            <div className="fixed inset-0 z-[-1] hidden md:block" style={wall("/bg-wall.webp")}></div>
            <div className="fixed inset-0 z-[-1] md:hidden" style={wall("/bg-wall-phone.webp")}></div>
            {/* Torchlight flickering over it, then a vignette so the middle stays readable. */}
            <div className="wall-torch hidden md:block" style={{ left: '12%', top: '30%' }}></div>
            <div className="wall-torch wall-torch--b hidden md:block" style={{ left: '88%', top: '26%' }}></div>
            <div className="fixed inset-0 z-[-1] pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0,0,0,.25), rgba(0,0,0,.72) 100%)' }}></div>
        </>
    );
}
