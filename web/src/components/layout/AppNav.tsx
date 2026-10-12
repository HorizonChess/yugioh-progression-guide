"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProgression } from "@/context/ProgressionContext";
import { asset } from '@/lib/utils';

/* AppNav — the app's single persistent nav bar. It's hoisted into the root layout
   and rendered ONCE, above the routed content and outside the page-transition
   template, so it never unmounts or animates on navigation and sits pixel-
   identically across pages. It shows only on the "app main zone" routes that opted
   in (an explicit allow-list, not an opt-out list) and returns null everywhere else
   — onboarding/root/menu have no nav.

   It's a client component, so it can vary itself per route via `usePathname()`
   (e.g. the active-link highlight below) without breaking that persistence. */
const NAV_ROUTES = new Set(["/timeline", "/collection", "/deck-builder", "/packs", "/record-match", "/rewards"]);

const NAV_LINKS = [
    { href: "/timeline", label: "CAMPAIGN" },
    { href: "/collection", label: "COLLECTION" },
    { href: "/deck-builder", label: "DECK BUILDER" },
    { href: "/rewards", label: "REWARDS" },
    { href: "/menu", label: "MENU" },
];

export default function AppNav() {
    // trailingSlash (for static hosting) makes this "/timeline/"; strip it so route lookups match
    const pathname = usePathname().replace(/(.)\/$/, "$1");
    const { isGuideVisible, toggleGuide, duelistName } = useProgression();

    if (!NAV_ROUTES.has(pathname)) return null;

    return (
        <div className="z-[100] bg-gradient-to-b from-gray-900 to-black border-b-2 border-gray-700 p-3 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-4">
                <Link href="/menu" className="group flex items-center gap-4 hover:opacity-80 transition-opacity">
                    <div>
                        <h2 className="text-primary font-bold text-lg tracking-wider uppercase leading-none">{duelistName ?? "Duelist"}</h2>
                        <p className="text-[10px] text-gray-500 font-mono">ID: 8492-001</p>
                    </div>
                </Link>

                {/* Guide Toggle - Pixel Art Head */}
                <button
                    onClick={toggleGuide}
                    className={`relative w-10 h-10 rounded-full border-2 overflow-hidden transition-all duration-200 ${isGuideVisible
                        ? 'border-primary shadow-[0_0_10px_var(--primary)] bg-primary/20'
                        : 'border-gray-600 opacity-50 hover:opacity-100 hover:border-gray-400'
                        }`}
                    title={isGuideVisible ? "Hide Guide" : "Show Guide"}
                >
                    <img
                        src={asset("/sprites/yugi_neutral_v2_transparent.png?v=4")}
                        alt="Toggle Guide"
                        className="w-full h-full object-cover object-top scale-150 translate-y-1"
                    />
                </button>
            </div>

            <div className="flex items-center gap-6">
                <div className="hidden md:flex gap-4 text-xs font-bold tracking-widest text-gray-500">
                    {NAV_LINKS.map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            aria-current={pathname === href ? "page" : undefined}
                            className={`topbar-nav-link ${pathname === href ? "topbar-nav-link--active" : ""}`}
                        >
                            {label}
                        </Link>
                    ))}
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] pr-1">
                        PROGRESSION
                    </h1>
                </div>
            </div>
        </div>
    );
}
