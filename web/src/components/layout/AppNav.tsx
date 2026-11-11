"use client";

import { Fragment, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { listenForSwipes } from "@/lib/swipe-nav";
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
    { href: "/timeline", label: "Campaign" },
    { href: "/collection", label: "Collection" },
    { href: "/deck-builder", label: "Deck Builder" },
    { href: "/rewards", label: "Rewards" },
    { href: "/menu", label: "Menu" },
];

/** The section icons, drawn as filled glyphs with dark carved lines: a pyramid, a binder, a card fan, a chest and the Millennium Eye. */
const CUT = { fill: "none", stroke: "#0b0810", strokeWidth: 1.3, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" } as const;
const NAV_ICONS: Record<string, React.ReactNode> = {
    "/timeline": <><circle cx="18.5" cy="5" r="2.2" /><path d="M10 5.5 20.5 21H1.5Z" /><path {...CUT} d="M10 5.5 12.5 21M6 14.5h8.6M3.8 18h12.9" /></>,
    "/collection": <><path d="M6 2.5h12.5a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6Z" /><path d="M4 3.5h1.2v17H4z" /><path {...CUT} d="M9.5 6.5h7v4.5h-7zM9.5 13.5h7v4.5h-7z" /><path {...LINE} d="M3 7h3.5M3 12h3.5M3 17h3.5" /></>,
    "/deck-builder": <><rect x="3" y="5" width="9" height="13" rx="1" transform="rotate(-16 7.5 11.5)" /><rect x="12" y="5" width="9" height="13" rx="1" transform="rotate(16 16.5 11.5)" /><rect x="7.5" y="3" width="9" height="13.5" rx="1" stroke="#0b0810" strokeWidth="1.2" /><circle {...CUT} cx="12" cy="9.75" r="2.4" /></>,
    "/rewards": <><path d="M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M3 10a9 5.5 0 0 1 18 0v.5H3Z" /><path {...CUT} d="M3 13.5h18M12 10.5v5" /><rect x="10.4" y="12.4" width="3.2" height="3.6" rx=".5" stroke="#0b0810" strokeWidth="1.1" /></>,
    "/menu": <><path d="M1.5 10.5Q12 1 22.5 10.5Q12 20 1.5 10.5Z" /><circle cx="12" cy="10.5" r="3.4" fill="#0b0810" /><circle cx="12" cy="10.5" r="1.6" /><path {...LINE} d="M12 16.6v5M8.5 15.8 6.5 20M15.5 15.8l2 4.2" /></>,
};
const NavIcon = ({ href }: { href: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{NAV_ICONS[href]}</svg>
);
const TAB_LABELS: Record<string, string> = { "/deck-builder": "Deck" };

/** "Stage 3 · Solo", or "Stage 3 · vs Kaiba" in duo, under the duelist's name in both bars. */
const stageLine = (series: { currentSetIndex: number; mode?: string; members?: { id: string; duelistName: string }[] } | null | undefined, userId?: string | null) => {
    if (!series) return "No save picked";
    const rival = series.mode === "duo" ? series.members?.find((m) => m.id !== userId)?.duelistName : undefined;
    return `Stage ${series.currentSetIndex + 1} · ${series.mode !== "duo" ? "Solo" : rival ? `vs ${rival}` : "Duo"}`;
};

const useNavPath = () => usePathname().replace(/(.)\/$/, "$1"); // trailingSlash makes it "/timeline/"

/** Phones: the app sections as a bottom tab bar (the layout puts it below the page). */
export function PhoneTabBar() {
    const pathname = useNavPath();
    const router = useRouter();
    const { activeSeriesId } = useProgression();

    // A swipe across a tab's page goes to the neighbouring tab (locked ones skipped). Only
    // from the tabs themselves: the pack and record screens aren't in the row.
    useEffect(() => {
        const at = NAV_LINKS.findIndex((l) => l.href === pathname);
        if (at === -1 || !window.matchMedia("(max-width: 767px)").matches) return;
        const open = NAV_LINKS.filter((l) => activeSeriesId || l.href === "/menu");
        return listenForSwipes((dir) => {
            const here = open.findIndex((l) => l.href === pathname);
            const next = here === -1 ? undefined : open[here + dir];
            if (!next) return false;
            router.push(next.href);
            return true;
        });
    }, [pathname, activeSeriesId, router]);

    if (!NAV_ROUTES.has(pathname)) return null;
    return (
        <nav className="phone-tabs md:hidden" aria-label="Main">
            {NAV_LINKS.map(({ href, label }) => {
                const inner = (
                    <>
                        <NavIcon href={href} />
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
    const userId = useAuth().user?.id;
    const wins = matchHistory.filter((m) => m.winner === "player").length;
    const losses = matchHistory.filter((m) => m.winner === "opponent").length;
    const sub = stageLine(series, userId);
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
            <Link href="/menu" className={`phone-bar__who ${pathname === "/timeline" ? "phone-bar__who--score" : ""}`}>
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
    const { isGuideVisible, toggleGuide, activeSeriesId, series } = useProgression();
    const user = useAuth().user;
    const userId = user?.id;
    const duelistName = user?.duelistName ?? "Guest";

    if (!NAV_ROUTES.has(pathname)) return null;
    const sub = stageLine(series, userId);

    return (
        <>
        <PhoneBar duelistName={duelistName} signedIn={!!user} />
        <header className="app-bar hidden md:flex">
            <button
                type="button"
                onClick={toggleGuide}
                className={`app-bar__face ${isGuideVisible ? "" : "app-bar__face--off"}`}
                style={{ backgroundImage: `url('${asset("/sprites/yugi_neutral_v2_transparent.webp")}')` }}
                aria-label={isGuideVisible ? "Hide Guide" : "Show Guide"}
                aria-pressed={isGuideVisible}
                title={isGuideVisible ? "Hide Guide" : "Show Guide"}
            />
            <Link href="/menu" className="app-bar__who">
                <div className="app-bar__name">{duelistName}</div>
                <div className="app-bar__sub">{sub}</div>
            </Link>
            <nav className="app-bar__links" aria-label="Main">
                {NAV_LINKS.map(({ href, label }, i) => (
                    <Fragment key={href}>
                        {i > 0 && <span className="app-bar__sep" aria-hidden="true" />}
                        {!activeSeriesId && href !== "/menu" ? (
                            <span aria-disabled="true" title="Pick a save first">{label}</span>
                        ) : (
                            <Link href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>
                        )}
                    </Fragment>
                ))}
            </nav>
            <div className="app-bar__end">{user && <NotificationBell />}</div>
        </header>
        </>
    );
}
