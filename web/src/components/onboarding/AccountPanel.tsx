"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PasswordSchema } from "@ygo/shared";
import { useAuth } from "@/context/AuthContext";
import * as auth from "@/lib/auth-client";
import FrameButton from "@/components/ui/FrameButton";
import InvitationEnvelope from "./InvitationEnvelope";
import InvitationForm from "./InvitationForm";
import { Field, NoticeLine, ParchmentCard, StrengthMeter, useNameCheck, type Notice } from "./parts";

export type AccountView = "envelope" | "invite" | "signin" | "forgot" | "reset" | "claim";

/** What a reset link or the Google redirect asked for (`?reset=`, `?google=`). */
export interface Landing {
    reset?: string;
    google?: string;
}

const GOOGLE_PROBLEMS: Record<string, string> = {
    denied: "Google sign-in was cancelled.",
    failed: "Google sign-in didn't work. Please try again.",
    unverified: "Google says that email address isn't verified, so it can't be used here.",
};

const linkClass = "text-sm font-bold text-wood-light underline hover:text-ink";

/** The account flows, shown in the menu's left column in place of the menu items. */
export default function AccountPanel({ start, landing, onClose }: { start: AccountView; landing?: Landing; onClose: () => void }) {
    const { signedIn } = useAuth();
    const [view, setView] = useState<AccountView>(landing?.reset ? "reset" : landing?.google === "claim" ? "claim" : start);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [busy, setBusy] = useState(false);
    const [claim, setClaim] = useState<auth.GoogleClaim | null>(null);

    const [identifier, setIdentifier] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [duelistName, setDuelistName] = useState("");
    const name = useNameCheck(view === "claim" ? duelistName : "");

    useEffect(() => {
        if (!landing) return;
        let cancelled = false;
        void (async () => {
            let next: Notice | null = null;
            if (landing.google === "claim") {
                const pending = await auth.getGoogleClaim();
                if (cancelled) return;
                setClaim(pending);
                if (!pending) {
                    setView("signin");
                    next = { kind: "error", text: "That Google sign-in expired. Please start again." };
                }
            } else if (landing.google && landing.google !== "ok") {
                next = { kind: "error", text: GOOGLE_PROBLEMS[landing.google] ?? GOOGLE_PROBLEMS.failed! };
            }
            if (!cancelled) setNotice(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [landing]);

    const run = async (task: () => Promise<Notice | null | void>) => {
        setBusy(true);
        setNotice(null);
        const result = await task();
        setBusy(false);
        if (result) setNotice(result);
    };

    const onSignIn = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.signIn({ identifier, password });
            if (!result.ok) return { kind: "error", text: result.message };
            signedIn(result.data);
            onClose();
        });
    };

    const onForgot = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.forgotPassword(email);
            return result.ok ? { kind: "ok", text: "If that email has an account, a reset link is on its way." } : { kind: "error", text: result.message };
        });
    };

    const onReset = (event: FormEvent) => {
        event.preventDefault();
        if (!landing?.reset) return;
        void run(async () => {
            const result = await auth.resetPassword(landing.reset!, password);
            if (!result.ok) return { kind: "error", text: result.message };
            setPassword("");
            setView("signin");
            return { kind: "ok", text: "Password changed. Sign in with your new password." };
        });
    };

    const onClaim = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.claimGoogleName(duelistName);
            if (!result.ok) return { kind: "error", text: result.message };
            signedIn(result.data);
            onClose();
        });
    };

    let body;
    if (view === "envelope") body = <InvitationEnvelope onOpen={() => setView("invite")} />;
    else if (view === "invite") body = <InvitationForm onSignedUp={signedIn} onDone={onClose} />;
    else if (view === "claim")
        body = (
            <ParchmentCard kicker={claim ? `Signed in with Google as ${claim.email}` : "One last step"} title="Choose your duelist name">
                <form onSubmit={onClaim} className="space-y-3" aria-label="Choose a duelist name">
                    <Field id="dk-claim" label="Duelist name" hint={name.hint} value={duelistName} onChange={(e) => setDuelistName(e.target.value)} autoComplete="nickname" required />
                    <NoticeLine notice={notice} />
                    <div className="flex justify-center">
                        <FrameButton type="submit" disabled={!name.ok || busy} className="h-12 px-6">Claim the Name</FrameButton>
                    </div>
                </form>
            </ParchmentCard>
        );
    else if (view === "reset")
        body = (
            <ParchmentCard kicker="Forgotten no more" title="Choose a new password">
                <form onSubmit={onReset} className="space-y-3" aria-label="Choose a new password">
                    <Field id="dk-new-password" label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                    <StrengthMeter password={password} />
                    <NoticeLine notice={notice} />
                    <div className="flex justify-center">
                        <FrameButton type="submit" disabled={!PasswordSchema.safeParse(password).success || busy} className="h-12 px-6">Change Password</FrameButton>
                    </div>
                </form>
            </ParchmentCard>
        );
    else if (view === "forgot")
        body = (
            <ParchmentCard kicker="Lost your invitation?" title="Reset your password">
                <form onSubmit={onForgot} className="space-y-3" aria-label="Forgot password">
                    <Field id="dk-forgot-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    <NoticeLine notice={notice} />
                    <div className="flex justify-center">
                        <FrameButton type="submit" disabled={busy} className="h-12 px-6">Send Reset Link</FrameButton>
                    </div>
                    <p className="text-center"><button type="button" className={linkClass} onClick={() => setView("signin")}>Back to sign in</button></p>
                </form>
            </ParchmentCard>
        );
    else
        body = (
            <ParchmentCard kicker="Halt, duelist" title="Present your invitation">
                <form onSubmit={onSignIn} className="space-y-3" aria-label="Sign in">
                    <Field id="dk-identifier" label="Email or duelist name" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
                    <Field id="dk-password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                    <NoticeLine notice={notice} />
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <FrameButton type="submit" disabled={busy} className="h-12 px-6">Sign In</FrameButton>
                        <a href={auth.GOOGLE_START_URL} className="rounded-lg border-2 border-wood-border px-4 py-2 text-sm font-bold text-ink hover:bg-wood-border/20">
                            Sign in with Google
                        </a>
                    </div>
                    <p className="flex justify-between">
                        <button type="button" className={linkClass} onClick={() => setView("forgot")}>Forgot password?</button>
                        <button type="button" className={linkClass} onClick={() => setView("envelope")}>No invitation? Sign up</button>
                    </p>
                </form>
            </ParchmentCard>
        );

    return (
        <div className="w-full max-w-md space-y-4">
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-white transition-colors">◀ BACK TO MENU</button>
            {body}
        </div>
    );
}
