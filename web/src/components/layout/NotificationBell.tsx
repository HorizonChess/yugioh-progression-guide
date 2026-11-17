"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "@/context/NotificationsContext";
import { describeNotification, type AppNotification } from "@/lib/duo-client";
import { useOpenNotification } from "@/lib/open-notification";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push-client";

/** The nav bar's bell: a rival's moves, newest first, each leading to where it's answered. */
export default function NotificationBell() {
    const { notifications, unread, markAllRead } = useNotifications();
    const openNotification = useOpenNotification();
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

    const go = (n: AppNotification) => {
        close();
        void openNotification(n);
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
                    <PushToggle />
                </div>
            )}
        </div>
    );
}

/** The bell's foot: these as notifications on this device, even with the game closed. */
function PushToggle() {
    const [status, setStatus] = useState<PushStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        void pushStatus().then(setStatus, () => setStatus("unsupported"));
    }, []);
    if (!status || status === "unsupported") return null;

    const flip = async () => {
        setBusy(true);
        setFailed(false);
        try {
            setStatus(await (status === "on" ? disablePush() : enablePush()));
        } catch {
            setFailed(true);
            setStatus(await pushStatus().catch(() => "off" as const));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="p-3 text-xs text-gray-400 bg-gray-900/60 border-t border-gray-800 sticky bottom-0">
            {status === "install" ? (
                <p>To get these on your iPhone even with the game closed, add it to your Home Screen (Share, then Add to Home Screen) and open it from there.</p>
            ) : status === "blocked" ? (
                <p>Notifications are blocked for this site. Allow them in your browser&apos;s site settings to get these on this device.</p>
            ) : (
                <div className="flex items-center justify-between gap-3">
                    <span>
                        {failed
                            ? "This browser couldn't turn them on (a private window can't get them). Try again?"
                            : status === "on" ? "These come to this device too, even with the game closed." : "Get these on this device, even with the game closed?"}
                    </span>
                    <button type="button" disabled={busy} onClick={() => void flip()} className="shrink-0 px-3 py-1 rounded border border-gray-600 text-white hover:bg-gray-800 disabled:opacity-50">
                        {status === "on" ? "Turn off" : "Turn on"}
                    </button>
                </div>
            )}
        </div>
    );
}
