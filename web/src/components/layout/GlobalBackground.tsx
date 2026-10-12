"use client";

import { usePathname } from "next/navigation";
import { asset } from '@/lib/utils';

export default function GlobalBackground() {
    // trailingSlash (for static hosting) makes this "/menu/"; strip it so the check matches
    const pathname = usePathname().replace(/(.)\/$/, "$1");

    // Don't show on menu page
    if (pathname === '/menu') {
        return null;
    }

    return (
        <>
            {/* Background Texture - Full Screen */}
            {/* Background Texture - Full Screen */}
            <div className="fixed inset-0 z-[-1]" style={{
                backgroundImage: `url('${asset("/bg-stone.png")}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
                filter: 'brightness(1.3) contrast(1.1)'
            }}></div>
            <div className="fixed inset-0 bg-black/50 z-[-1] pointer-events-none"></div>
        </>
    );
}
