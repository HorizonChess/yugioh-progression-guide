"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import { fetchNotifications, listInvites, liveNotifications, markNotificationsRead, type AppNotification, type Invite } from "@/lib/duo-client";

interface NotificationsContextType {
    notifications: AppNotification[];
    unread: number;
    /** Invites by name waiting for an answer. */
    invites: Invite[];
    markAllRead: () => void;
    refreshInvites: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const KEEP = 30;
interface Inbox {
    userId: string;
    notifications: AppNotification[];
    unread: number;
    invites: Invite[];
}

/**
 * A signed-in player's notifications: loaded once, then kept current over a
 * WebSocket. A rival's move also refreshes the series it happened in.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
    const userId = useAuth().user?.id ?? null;
    const { refresh } = useProgression();
    const [inbox, setInbox] = useState<Inbox | null>(null);

    // The socket outlives renders; it reaches the latest refresh through this ref.
    const onEvent = useRef<(n: AppNotification) => void>(() => undefined);
    const refreshInvites = useCallback(async () => {
        if (!userId) return;
        const invites = await listInvites().catch(() => null);
        if (invites) setInbox((prev) => prev && prev.userId === userId ? { ...prev, invites } : prev);
    }, [userId]);
    useEffect(() => {
        onEvent.current = (n) => {
            void refresh(n.seriesId).catch(() => undefined);
            if (n.type === "invite") void refreshInvites();
        };
    }, [refresh, refreshInvites]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        void Promise.all([fetchNotifications(), listInvites()])
            .then(([{ notifications, unread }, invites]) => {
                if (!cancelled) setInbox({ userId, notifications, unread, invites });
            })
            .catch(() => undefined);
        const stop = liveNotifications((n) => {
            setInbox((prev) => prev && { ...prev, notifications: [n, ...prev.notifications].slice(0, KEEP), unread: prev.unread + 1 });
            onEvent.current(n);
        });
        return () => {
            cancelled = true;
            stop();
        };
    }, [userId]);

    const current = inbox && inbox.userId === userId ? inbox : null;
    const markAllRead = () => {
        if (!current?.unread) return;
        setInbox({ ...current, unread: 0, notifications: current.notifications.map((n) => ({ ...n, read: true })) });
        void markNotificationsRead().catch(() => undefined);
    };

    return (
        <NotificationsContext.Provider
            value={{ notifications: current?.notifications ?? [], unread: current?.unread ?? 0, invites: current?.invites ?? [], markAllRead, refreshInvites }}
        >
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationsContext);
    if (!context) throw new Error("useNotifications must be used within a NotificationsProvider");
    return context;
}
