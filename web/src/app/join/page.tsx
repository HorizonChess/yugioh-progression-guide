"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useProgression } from "@/context/ProgressionContext";
import { acceptInvite, declineInvite, listInvites, PENDING_JOIN_KEY, previewInvite, type Invite } from "@/lib/duo-client";
import { RepoError } from "@/lib/repo/types";

type Target = { code: string } | { inviteId: string };

/**
 * Joining a duo series (route: /join): from a shared link (?code=) or an
 * invite by name (?invite=). Signed out, it keeps the link and sends the
 * player to sign in first; the menu brings them back here.
 */
export default function JoinPage() {
    const { user, loading } = useAuth();
    const { refresh, loadSeries } = useProgression();
    const { refreshInvites } = useNotifications();
    const router = useRouter();
    const [target, setTarget] = useState<Target | null>(null);
    const [invite, setInvite] = useState<Invite | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (loading) return;
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const inviteId = params.get("invite");
        const found: Target | null = code ? { code } : inviteId ? { inviteId } : null;
        const show = async (): Promise<Invite> => {
            if (!found) throw new RepoError("This link is missing its invitation.");
            if ("code" in found) return previewInvite(found.code);
            const match = user ? (await listInvites()).find((i) => i.id === found.inviteId) : undefined;
            if (!match) throw new RepoError("This invitation is no longer open");
            return match;
        };
        let cancelled = false;
        show().then(
            (shown) => {
                if (cancelled) return;
                setTarget(found);
                setInvite(shown);
            },
            (error: unknown) => {
                if (!cancelled) setProblem(error instanceof RepoError ? error.message : "Couldn't load this invitation.");
            },
        );
        return () => {
            cancelled = true;
        };
    }, [loading, user]);

    const accept = async () => {
        if (!target) return;
        setBusy(true);
        try {
            const seriesId = await acceptInvite(target);
            await Promise.all([refresh(), refreshInvites()]);
            await loadSeries(seriesId);
            router.push("/timeline");
        } catch (error) {
            setProblem(error instanceof RepoError ? error.message : "Couldn't join. Try again.");
            setBusy(false);
        }
    };

    const decline = async () => {
        if (!target || !("inviteId" in target)) return;
        setBusy(true);
        await declineInvite(target.inviteId).catch(() => undefined);
        await refreshInvites();
        router.push("/menu");
    };

    const signInFirst = () => {
        try {
            if (target && "code" in target) sessionStorage.setItem(PENDING_JOIN_KEY, target.code);
        } catch {
            // Storage blocked: they'll need to open the link again after signing in.
        }
        router.push("/?invite");
    };

    return (
        <div className="h-full flex items-center justify-center p-6 bg-black/70 text-white font-mono">
            <div className="w-full max-w-md border border-[var(--primary)] bg-gray-950 p-6 space-y-4">
                <h1 className="text-xl font-bold uppercase tracking-widest text-[var(--primary)]">Duo Series Invitation</h1>
                {problem ? (
                    <p role="status" className="text-red-400">{problem}</p>
                ) : !invite ? (
                    <p className="animate-pulse text-gray-400">Loading…</p>
                ) : (
                    <>
                        <p>
                            <strong>{invite.from}</strong> challenges you to <strong>“{invite.series.name}”</strong>.
                        </p>
                        <ul className="text-sm text-gray-400 space-y-1">
                            <li>Starts at: {invite.series.startSetName ?? "the first set"}</li>
                            <li>Packs per set: {invite.series.rules.packsPerSet}</li>
                        </ul>
                        {invite.series.rules.startSetIndex > 0 && (
                            <p className="text-xs text-gray-500">This series skips the early sets: you can import your collection once, from the Collection page.</p>
                        )}
                        {user ? (
                            <div className="flex gap-3 justify-end">
                                {target && "inviteId" in target && (
                                    <button type="button" onClick={decline} disabled={busy} className="px-3 py-1 text-sm text-gray-400 hover:text-white">
                                        Decline
                                    </button>
                                )}
                                <button type="button" onClick={accept} disabled={busy} className="px-4 py-1 text-sm font-bold bg-[var(--primary)] text-black rounded hover:bg-yellow-400">
                                    Accept the Duel
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={signInFirst} className="w-full px-4 py-2 text-sm font-bold bg-[var(--primary)] text-black rounded hover:bg-yellow-400">
                                Sign in or sign up to accept
                            </button>
                        )}
                    </>
                )}
                <Link href="/menu" className="block text-xs text-gray-500 hover:text-white">◀ Back to the menu</Link>
            </div>
        </div>
    );
}
