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

    return (
        <>
            {/* The wall; the warm base shows while it loads, instead of grey. */}
            <div className="fixed inset-0 z-[-1]" style={{
                backgroundColor: '#2a1d10',
                backgroundImage: `url('${asset("/bg-stone.webp")}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
                filter: 'brightness(1.3) contrast(1.1)'
            }}></div>
            <div className="fixed inset-0 bg-black/50 z-[-1] pointer-events-none"></div>
        </>
    );
}
