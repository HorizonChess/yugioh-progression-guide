"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useOpenNotification } from "@/lib/open-notification";
import { refreshPush, serviceWorker } from "@/lib/push-client";

/**
 * Where a tap on a push notification lands. With the game closed, it opens at
 * `?notification=<id>`; with it open, the service worker hands the id over. Either way the game
 * goes where the bell would have taken the player.
 */
export default function PushLanding() {
    const signedIn = !!useAuth().user;
    const { notifications, markAllRead } = useNotifications();
    const open = useOpenNotification();
    // Read before any page changes the address.
    const [wanted, setWanted] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("notification")));
    const opened = useRef(new Set<string>());

    // The service worker, ready for pushes; a device that has them keeps the server up to date.
    useEffect(() => {
        void serviceWorker().catch(() => undefined);
        if (signedIn) void refreshPush().catch(() => undefined);
    }, [signedIn]);

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; id?: string } | null;
            if (data?.type === "open-notification" && data.id) setWanted(data.id);
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }, []);

    // Once the notifications have loaded: open it, and take the id off the address.
    useEffect(() => {
        if (!wanted || opened.current.has(wanted)) return;
        const n = notifications.find((x) => x.id === wanted);
        if (!n) return;
        opened.current.add(wanted);
        const url = new URL(window.location.href);
        if (url.searchParams.has("notification")) {
            url.searchParams.delete("notification");
            window.history.replaceState(window.history.state, "", url);
        }
        markAllRead();
        void open(n);
    }, [wanted, notifications, markAllRead, open]);

    return null;
}
