"use client";

import { duelPath } from "@/lib/duel-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { useNotifications } from "@/context/NotificationsContext";
import { describeNotification, type AppNotification } from "@/lib/duo-client";

/** The nav bar's bell: a rival's moves, newest first, each leading to where it's answered. */
export default function NotificationBell() {
    const { notifications, unread, markAllRead } = useNotifications();
    const { loadSeries } = useProgression();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    // New ones stay marked while the list is open, and count as read once it closes.
    const close = useCallback(() => {
        setOpen(false);
        markAllRead();
    }, [markAllRead]);

    // A click or tap anywhere else, or Escape, closes it too.
    useEffect(() => {
        if (!open) return;
        const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
        const escape = (e: KeyboardEvent) => e.key === "Escape" && close();
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("keydown", escape);
        };
    }, [open, close]);

    const go = async (n: AppNotification) => {
        close();
        if (n.type === "invite") return router.push(`/join/?invite=${n.payload.inviteId}`);
        try {
            await loadSeries(n.seriesId);
        } catch (error) {
            return alertRepoError(error);
        }
        if ((n.type === "duel-challenge" || n.type === "duel-accepted") && typeof n.payload.duelId === "string") return router.push(duelPath(n.payload.duelId));
        router.push(n.type === "report" ? "/record-match" : n.type === "report-confirmed" || n.type === "duel-result" ? "/rewards" : "/timeline");
    };

    return (
        <div ref={root} className="relative">
            <button
                type="button"
                onClick={() => (open ? close() : setOpen(true))}
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                aria-expanded={open}
                className="nav-bell"
            >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
                    <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
                </svg>
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-5 text-center">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>
            {open && (
                <div role="dialog" aria-label="Notifications" className="absolute right-0 top-11 w-80 max-h-96 overflow-y-auto custom-scrollbar bg-gray-950 border border-gray-700 rounded shadow-2xl z-[150]">
                    {notifications.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">Nothing yet. Your rival&apos;s moves show up here.</p>
                    ) : (
                        <ul>
                            {notifications.map((n) => (
                                <li key={n.id}>
                                    <button
                                        type="button"
                                        onClick={() => void go(n)}
                                        className={`w-full text-left p-3 border-b border-gray-800 hover:bg-gray-900 text-sm ${n.read ? "text-gray-400" : "text-white"}`}
                                    >
                                        {describeNotification(n)}
                                        <span className="block text-[10px] text-gray-600 mt-1">{new Date(n.createdAt).toLocaleString()}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
