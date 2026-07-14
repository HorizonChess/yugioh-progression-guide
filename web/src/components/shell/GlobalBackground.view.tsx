"use client";

import { usePathname } from "next/navigation";

export default function GlobalBackground() {
    const pathname = usePathname();

    // Don't show on menu page
    if (pathname === '/menu') {
        return null;
    }

    return (
        <>
            {/* Background Texture - Full Screen */}
            {/* Background Texture - Full Screen */}
            <div className="fixed inset-0 z-[-1]" style={{
                backgroundImage: "url('/bg-stone.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
                filter: 'brightness(1.3) contrast(1.1)'
            }}></div>
            <div className="fixed inset-0 bg-black/50 z-[-1] pointer-events-none"></div>
        </>
    );
}
