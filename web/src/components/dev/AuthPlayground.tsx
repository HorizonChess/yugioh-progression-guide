"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PublicUser } from "@ygo/shared";
import * as auth from "@/lib/auth-client";

/*
 * A deliberately plain page for trying out accounts end to end: sign up, sign
 * in, Google, email confirmation, password reset. It's also where email links
 * and the Google redirect land (`?verify=`, `?reset=`, `?google=`). The styled
 * Duelist Kingdom invitation replaces it in Phase 5.
 */

const PAGE_PATH = "/dev/auth/";

type View = "signin" | "signup" | "forgot";
type Notice = { kind: "ok" | "error"; text: string };

const GOOGLE_PROBLEMS: Record<string, string> = {
    denied: "Google sign-in was cancelled.",
    failed: "Google sign-in didn't work. Please try again.",
    unverified: "Google says that email address isn't verified, so it can't be used here.",
};

const inputClass =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-gray-500 focus:border-[var(--primary)] focus:outline-none";
const buttonClass =
    "rounded-lg bg-primary px-4 py-2 font-bold text-black transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";
const linkButtonClass = "text-sm text-gray-400 underline hover:text-white";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {label}
            </label>
            {children}
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
    );
}

function SignedIn({ me, busy, onResend, onSignOut }: { me: PublicUser; busy: boolean; onResend: () => void; onSignOut: () => void }) {
    const rows: [string, string][] = [
        ["Duelist name", me.duelistName],
        ["Email", me.email],
        ["Email confirmed", me.emailVerified ? "yes" : "no"],
        ["Role", me.role],
        ["Has password", me.hasPassword ? "yes" : "no"],
        ["Google linked", me.hasGoogle ? "yes" : "no"],
    ];
    return (
        <section aria-label="Signed in" className="space-y-4">
            <h2 className="text-xl font-bold">Signed in</h2>
            <dl className="divide-y divide-white/10 rounded-lg border border-white/10">
                {rows.map(([term, value]) => (
                    <div key={term} className="flex justify-between gap-4 px-3 py-2 text-sm">
                        <dt className="text-gray-400">{term}</dt>
                        <dd className="font-mono">{value}</dd>
                    </div>
                ))}
            </dl>
            <div className="flex gap-3">
                {!me.emailVerified && (
                    <button type="button" className={buttonClass} disabled={busy} onClick={onResend}>
                        Resend confirmation email
                    </button>
                )}
                <button type="button" className={buttonClass} disabled={busy} onClick={onSignOut}>
                    Sign out
                </button>
            </div>
        </section>
    );
}

export default function AuthPlayground() {
    const router = useRouter();
    const params = useSearchParams();

    const [me, setMe] = useState<PublicUser | null | undefined>(undefined);
    const [view, setView] = useState<View>("signin");
    const [notice, setNotice] = useState<Notice | null>(null);
    const [busy, setBusy] = useState(false);
    const [claim, setClaim] = useState<auth.GoogleClaim | null>(null);
    const [resetToken, setResetToken] = useState<string | null>(null);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [duelistName, setDuelistName] = useState("");
    const [identifier, setIdentifier] = useState("");
    const [nameCheck, setNameCheck] = useState<{ name: string; available: boolean; reason?: string } | null>(null);

    // Handle whatever the URL brought us here for, once, then tidy the URL.
    const handledUrl = useRef(false);
    useEffect(() => {
        if (handledUrl.current) return;
        handledUrl.current = true;

        const verifyToken = params.get("verify");
        const reset = params.get("reset");
        const google = params.get("google");

        void (async () => {
            if (verifyToken) {
                const result = await auth.verifyEmail(verifyToken);
                setNotice(result.ok ? { kind: "ok", text: "Email confirmed. Thank you!" } : { kind: "error", text: result.message });
            }
            if (reset) setResetToken(reset);
            if (google === "claim") {
                const pending = await auth.getGoogleClaim();
                setClaim(pending);
                if (!pending) setNotice({ kind: "error", text: "That Google sign-in expired. Please start again." });
            } else if (google === "ok") {
                setNotice({ kind: "ok", text: "Signed in with Google." });
            } else if (google) {
                setNotice({ kind: "error", text: GOOGLE_PROBLEMS[google] ?? GOOGLE_PROBLEMS.failed! });
            }
            if (verifyToken || reset || google) router.replace(PAGE_PATH);
            setMe(await auth.getMe());
        })();
    }, [params, router]);

    // Live "is this duelist name free?" check while signing up.
    useEffect(() => {
        const name = duelistName.trim();
        if (view !== "signup" || name.length < 3) return;
        const timer = setTimeout(() => {
            void auth.checkDuelistName(name).then((result) => setNameCheck({ name, ...result }));
        }, 400);
        return () => clearTimeout(timer);
    }, [duelistName, view]);

    const run = async (task: () => Promise<void>) => {
        setBusy(true);
        setNotice(null);
        try {
            await task();
        } finally {
            setBusy(false);
        }
    };
    const fail = (text: string) => setNotice({ kind: "error", text });
    const ok = (text: string) => setNotice({ kind: "ok", text });

    const onSignUp = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.signUp({ email, password, duelistName });
            if (!result.ok) return fail(result.message);
            setMe(result.data);
            setPassword("");
            ok("Account created. We emailed you a confirmation link.");
        });
    };

    const onSignIn = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.signIn({ identifier, password });
            if (!result.ok) return fail(result.message);
            setMe(result.data);
            setPassword("");
        });
    };

    const onForgot = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.forgotPassword(email);
            if (!result.ok) return fail(result.message);
            ok("If that email has an account, a reset link is on its way.");
        });
    };

    const onReset = (event: FormEvent) => {
        event.preventDefault();
        if (!resetToken) return;
        void run(async () => {
            const result = await auth.resetPassword(resetToken, password);
            if (!result.ok) return fail(result.message);
            setResetToken(null);
            setPassword("");
            setView("signin");
            ok("Password changed. Sign in with your new password.");
        });
    };

    const onClaim = (event: FormEvent) => {
        event.preventDefault();
        void run(async () => {
            const result = await auth.claimGoogleName(duelistName);
            if (!result.ok) return fail(result.message);
            setClaim(null);
            setMe(result.data);
            ok("Welcome, duelist!");
        });
    };

    const onSignOut = () =>
        void run(async () => {
            await auth.signOut();
            setMe(null);
            ok("Signed out.");
        });

    const onResend = () =>
        void run(async () => {
            const result = await auth.resendVerification();
            if (!result.ok) return fail(result.message);
            ok("Confirmation email sent.");
        });

    const trimmedName = duelistName.trim();
    const nameHint =
        view === "signup" && nameCheck && nameCheck.name === trimmedName
            ? nameCheck.available
                ? "✓ Available"
                : `✗ ${nameCheck.reason ?? "Not available"}`
            : "3–20 characters. Rivals invite you by this name.";

    let body: ReactNode;
    if (me === undefined) {
        body = <p className="text-gray-400">Loading…</p>;
    } else if (me) {
        body = <SignedIn me={me} busy={busy} onResend={onResend} onSignOut={onSignOut} />;
    } else if (claim) {
        body = (
            <form onSubmit={onClaim} className="space-y-4" aria-label="Choose a duelist name">
                <h2 className="text-xl font-bold">Choose your duelist name</h2>
                <p className="text-sm text-gray-400">Signed in with Google as {claim.email}. One last step:</p>
                <Field id="claim-name" label="Duelist name" hint="3–20 characters. Rivals invite you by this name.">
                    <input id="claim-name" className={inputClass} value={duelistName} onChange={(e) => setDuelistName(e.target.value)} autoComplete="nickname" required />
                </Field>
                <button type="submit" className={buttonClass} disabled={busy}>
                    Finish
                </button>
            </form>
        );
    } else if (resetToken) {
        body = (
            <form onSubmit={onReset} className="space-y-4" aria-label="Choose a new password">
                <h2 className="text-xl font-bold">Choose a new password</h2>
                <Field id="new-password" label="New password" hint="At least 8 characters.">
                    <input id="new-password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                </Field>
                <button type="submit" className={buttonClass} disabled={busy}>
                    Change password
                </button>
            </form>
        );
    } else if (view === "signup") {
        body = (
            <form onSubmit={onSignUp} className="space-y-4" aria-label="Sign up">
                <h2 className="text-xl font-bold">Sign up</h2>
                <Field id="su-name" label="Duelist name" hint={nameHint}>
                    <input id="su-name" className={inputClass} value={duelistName} onChange={(e) => setDuelistName(e.target.value)} autoComplete="nickname" required />
                </Field>
                <Field id="su-email" label="Email">
                    <input id="su-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </Field>
                <Field id="su-password" label="Password" hint="At least 8 characters.">
                    <input id="su-password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                </Field>
                <button type="submit" className={buttonClass} disabled={busy}>
                    Create account
                </button>
            </form>
        );
    } else if (view === "forgot") {
        body = (
            <form onSubmit={onForgot} className="space-y-4" aria-label="Forgot password">
                <h2 className="text-xl font-bold">Forgot your password?</h2>
                <Field id="fp-email" label="Email">
                    <input id="fp-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </Field>
                <button type="submit" className={buttonClass} disabled={busy}>
                    Send reset link
                </button>
            </form>
        );
    } else {
        body = (
            <form onSubmit={onSignIn} className="space-y-4" aria-label="Sign in">
                <h2 className="text-xl font-bold">Sign in</h2>
                <Field id="si-identifier" label="Email or duelist name">
                    <input id="si-identifier" className={inputClass} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
                </Field>
                <Field id="si-password" label="Password">
                    <input id="si-password" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </Field>
                <div className="flex items-center gap-4">
                    <button type="submit" className={buttonClass} disabled={busy}>
                        Sign in
                    </button>
                    <a href={auth.GOOGLE_START_URL} className="rounded-lg border border-white/20 px-4 py-2 font-bold hover:bg-white/10">
                        Sign in with Google
                    </a>
                </div>
            </form>
        );
    }

    const signedOutPlain = me === null && !claim && !resetToken;

    return (
        <div className="h-full overflow-y-auto bg-black px-4 py-8 text-white">
            <div className="mx-auto max-w-md space-y-6">
                <header>
                    <h1 className="text-2xl font-black">Account test page</h1>
                    <p className="text-sm text-gray-400">A plain form for trying accounts. The real sign-up arrives in a later phase.</p>
                </header>

                {notice && (
                    <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${notice.kind === "ok" ? "border-green-500/40 bg-green-500/10 text-green-200" : "border-red-500/40 bg-red-500/10 text-red-200"}`}>
                        {notice.text}
                    </p>
                )}

                {body}

                {signedOutPlain && (
                    <nav className="flex gap-4" aria-label="Switch form">
                        {view !== "signin" && (
                            <button type="button" className={linkButtonClass} onClick={() => setView("signin")}>
                                Sign in
                            </button>
                        )}
                        {view !== "signup" && (
                            <button type="button" className={linkButtonClass} onClick={() => setView("signup")}>
                                Sign up
                            </button>
                        )}
                        {view !== "forgot" && (
                            <button type="button" className={linkButtonClass} onClick={() => setView("forgot")}>
                                Forgot password
                            </button>
                        )}
                    </nav>
                )}
            </div>
        </div>
    );
}
