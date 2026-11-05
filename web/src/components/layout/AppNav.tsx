"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import { asset } from '@/lib/utils';
import NotificationBell from "@/components/layout/NotificationBell";

/* AppNav — the app's single persistent nav bar. It's hoisted into the root layout
   and rendered ONCE, above the routed content and outside the page-transition
   template, so it never unmounts or animates on navigation and sits pixel-
   identically across pages. It shows only on the "app main zone" routes that opted
   in (an explicit allow-list, not an opt-out list) and returns null everywhere else
   — root/menu have no nav.

   It's a client component, so it can vary itself per route via `usePathname()`
   (e.g. the active-link highlight below) without breaking that persistence. */
export const NAV_ROUTES = new Set(["/timeline", "/collection", "/deck-builder", "/packs", "/record-match", "/rewards"]);

const NAV_LINKS = [
    { href: "/timeline", label: "CAMPAIGN" },
    { href: "/collection", label: "COLLECTION" },
    { href: "/deck-builder", label: "DECK BUILDER" },
    { href: "/rewards", label: "REWARDS" },
    { href: "/menu", label: "MENU" },
];

/** Tab icons for the phone tab bar, in NAV_LINKS order. */
const TAB_ICONS = [
    "M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6",
    "M4 3h11v15H4zM9 21h9.5A1.5 1.5 0 0 0 20 19.5V7",
    "M4 7h16M4 12h16M4 17h10",
    "M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.8Z",
    "M4 6h16M4 12h16M4 18h16",
];
const TAB_LABELS: Record<string, string> = { "/deck-builder": "DECK" };

const useNavPath = () => usePathname().replace(/(.)\/$/, "$1"); // trailingSlash makes it "/timeline/"

/** Phones: the app sections as a bottom tab bar (the layout puts it below the page). */
export function PhoneTabBar() {
    const pathname = useNavPath();
    const { activeSeriesId } = useProgression();
    if (!NAV_ROUTES.has(pathname)) return null;
    return (
        <nav className="phone-tabs md:hidden" aria-label="Main">
            {NAV_LINKS.map(({ href, label }, i) => {
                const inner = (
                    <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={TAB_ICONS[i]} /></svg>
                        {TAB_LABELS[href] ?? label}
                    </>
                );
                return !activeSeriesId && href !== "/menu" ? (
                    <span key={href} aria-disabled="true" title="Pick a save first">{inner}</span>
                ) : (
                    <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{inner}</Link>
                );
            })}
        </nav>
    );
}

/** Phones: a lacquer bar with Yugi (the guide toggle), the duelist and stage, and on the timeline the painted scoreboard hanging from it. */
function PhoneBar({ duelistName, signedIn }: { duelistName: string; signedIn: boolean }) {
    const pathname = useNavPath();
    const { isGuideVisible, toggleGuide, series, matchHistory } = useProgression();
    const wins = matchHistory.filter((m) => m.winner === "player").length;
    const losses = matchHistory.filter((m) => m.winner === "opponent").length;
    const sub = series ? `Stage ${series.currentSetIndex + 1} · ${series.mode === "duo" ? "Duo" : "Solo"}` : "No save picked";
    return (
        <header className="phone-bar md:hidden">
            <button
                type="button"
                onClick={toggleGuide}
                className={`phone-bar__face ${isGuideVisible ? "" : "phone-bar__face--off"}`}
                style={{ backgroundImage: `url('${asset("/sprites/yugi_neutral_v2_transparent.webp")}')` }}
                aria-label={isGuideVisible ? "Hide Guide" : "Show Guide"}
                aria-pressed={isGuideVisible}
            />
            <Link href="/menu" className="phone-bar__who">
                <div className="phone-bar__name">{duelistName}</div>
                <div className="phone-bar__sub">{sub}</div>
            </Link>
            {pathname === "/timeline" ? (
                <div className="phone-bar__score" style={{ background: `url('${asset("/ui/stats_panel_cropped.webp")}') center / contain no-repeat` }} role="img" aria-label={`${wins} wins, ${losses} losses`}>
                    <div className="stats-gem" style={{ left: "30%" }}>
                        <span className="stats-gem__label text-win">Wins</span>
                        <span className="stats-gem__value">{wins}</span>
                    </div>
                    <div className="stats-gem" style={{ left: "70%" }}>
                        <span className="stats-gem__label text-loss">Losses</span>
                        <span className="stats-gem__value">{losses}</span>
                    </div>
                </div>
            ) : (
                <div className="ml-auto">{signedIn && <NotificationBell />}</div>
            )}
        </header>
    );
}

export default function AppNav() {
    const pathname = useNavPath();
    const { isGuideVisible, toggleGuide, activeSeriesId } = useProgression();
    const user = useAuth().user;
    const duelistName = user?.duelistName ?? "Guest";

    if (!NAV_ROUTES.has(pathname)) return null;

    return (
        <>
        <PhoneBar duelistName={duelistName} signedIn={!!user} />
        <div className="hidden md:flex z-[100] bg-gradient-to-b from-gray-900 to-black border-b-2 border-gray-700 p-3 justify-between items-center shadow-lg">
            <div className="flex items-center gap-4">
                <Link href="/menu" className="group flex items-center gap-4 hover:opacity-80 transition-opacity">
                    <div>
                        <h2 className="text-primary font-bold text-lg tracking-wider uppercase leading-none">{duelistName}</h2>
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
                        src={asset("/sprites/yugi_neutral_v2_transparent.webp")}
                        alt="Toggle Guide"
                        className="w-full h-full object-cover object-top scale-150 translate-y-1"
                    />
                </button>
            </div>

            <div className="flex items-center gap-6">
                <div className="hidden md:flex gap-4 text-xs font-bold tracking-widest text-gray-500">
                    {NAV_LINKS.map(({ href, label }) => !activeSeriesId && href !== "/menu" ? (
                        <span key={href} aria-disabled="true" title="Pick a save first" className="topbar-nav-link opacity-40 cursor-not-allowed">
                            {label}
                        </span>
                    ) : (
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
                {user && <NotificationBell />}
                <div className="text-right">
                    <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] pr-1">
                        PROGRESSION
                    </h1>
                </div>
            </div>
        </div>
        </>
    );
}
