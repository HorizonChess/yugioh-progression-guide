import { API_BASE } from "@/lib/auth-client";
import { apiRequest } from "@/lib/repo/remote";

/*
 * The account-level side of duo play: invites (by name or link) and the
 * notifications a rival's moves send, live over a WebSocket.
 */

export interface Invite {
    /** Absent on a link invite's preview. */
    id?: string;
    from: string;
    series: { id: string; name: string; rules: { startSetIndex: number; packsPerSet: number }; startSetName: string | null };
    expiresAt: string;
}

export type NotificationType =
    | "invite"
    | "invite-accepted"
    | "invite-declined"
    | "report"
    | "report-confirmed"
    | "report-rejected"
    | "snatched"
    | "banlist"
    | "rival-left";

export interface AppNotification {
    id: string;
    type: NotificationType;
    seriesId: string;
    payload: Record<string, string | number | boolean>;
    read: boolean;
    createdAt: string;
}

/** Invites `duelistName`, or (no name) makes a fresh link code; the old link stops working. */
export const inviteRival = (seriesId: string, duelistName?: string) =>
    apiRequest<{ code?: string; invite?: { id: string; to: string } }>("POST", `/api/series/${seriesId}/invites`, duelistName ? { duelistName } : {});

export const listInvites = async () => (await apiRequest<{ invites: Invite[] }>("GET", "/api/invites")).invites;

export const previewInvite = async (code: string) =>
    (await apiRequest<{ invite: Invite }>("GET", `/api/invites/link?code=${encodeURIComponent(code)}`)).invite;

/** Joins the series; returns its id. */
export const acceptInvite = async (by: { inviteId: string } | { code: string }) =>
    (await apiRequest<{ seriesId: string }>("POST", "/api/invites/accept", by)).seriesId;

export const declineInvite = (inviteId: string) => apiRequest("POST", `/api/invites/${inviteId}/decline`);

export const fetchNotifications = () => apiRequest<{ notifications: AppNotification[]; unread: number }>("GET", "/api/notifications");

export const markNotificationsRead = () => apiRequest("POST", "/api/notifications/read", {});

/** The link a rival opens to join. */
export const inviteLink = (code: string) => `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/join/?code=${code}`;

/** Where a sign-in started from a join link picks up again. */
export const PENDING_JOIN_KEY = "pendingJoinCode";

/**
 * Hands each new notification to `onNotification` as it happens, reconnecting
 * (with growing pauses) whenever the connection drops. Returns a stop function.
 */
export function liveNotifications(onNotification: (n: AppNotification) => void): () => void {
    const base = API_BASE || window.location.origin;
    const url = `${base.replace(/^http/, "ws")}/api/notifications/live`;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let stopped = false;

    const connect = () => {
        socket = new WebSocket(url);
        socket.onopen = () => (delay = 1000);
        socket.onmessage = (event) => {
            try {
                const { notification } = JSON.parse(String(event.data)) as { notification?: AppNotification };
                if (notification) onNotification(notification);
            } catch {
                // Not ours; ignore.
            }
        };
        socket.onclose = () => {
            if (stopped) return;
            retry = setTimeout(connect, delay);
            delay = Math.min(delay * 2, 30_000);
        };
    };
    connect();
    return () => {
        stopped = true;
        clearTimeout(retry);
        socket?.close();
    };
}

/** One line saying what happened. */
export function describeNotification({ type, payload: p }: AppNotification): string {
    const series = `“${p.seriesName}”`;
    switch (type) {
        case "invite":
            return `${p.from} invites you to the duo series ${series}.`;
        case "invite-accepted":
            return `${p.from} joined ${series}. Let the duels begin!`;
        case "invite-declined":
            return `${p.from} declined your invite to ${series}.`;
        case "report":
            return `${p.from} reports that ${p.youWon ? "you" : "they"} won on ${p.setName}. Confirm it?`;
        case "report-confirmed":
            return `${p.from} confirmed your ${p.youWon ? "win" : "loss"} on ${p.setName}.`;
        case "report-rejected":
            return `${p.from} rejected your result on ${p.setName}. Report it again.`;
        case "snatched":
            return `${p.from} used Snatch Steal on one of your cards in ${series}.`;
        case "banlist":
            return `${p.from} ${p.banned ? "banned" : "unbanned"} a card in ${series}.`;
        case "rival-left":
            return `${p.from} left ${series}. The series is paused.`;
    }
}
