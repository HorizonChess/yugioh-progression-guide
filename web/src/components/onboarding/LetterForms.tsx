"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import gsap from "gsap";
import { EmailSchema, PasswordSchema, type PublicUser } from "@ygo/shared";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import * as auth from "@/lib/auth-client";
import { describeMove, guestSaves, moveGuestSaves } from "@/lib/guest-saves";
import StarCuff from "./StarCuff";
import { Field, NoticeLine, StarChip, StrengthMeter, WaxButton, useNameCheck, type Notice } from "./parts";

export type LetterView = "invite" | "signin" | "forgot" | "reset" | "claim";

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

function Heading({ kicker, title }: { kicker: string; title: string }) {
    return (
        <header className="ob-letter__head ob-ink">
            <p className="ob-kicker">{kicker}</p>
            <h2 className="ob-heading">{title}</h2>
        </header>
    );
}

const Links = ({ children }: { children: ReactNode }) => <p className="ob-letter__links ob-ink">{children}</p>;

/** Every account form, written on the letter. `onEnter` leaves for the menu once signed in. */
export default function LetterForms({ start, landing, reduce, onEnter, onGuest }: { start: LetterView; landing?: Landing; reduce: boolean; onEnter: () => void; onGuest: () => void }) {
    const { signedIn } = useAuth();
    const { refresh } = useProgression();
    const [view, setView] = useState<LetterView>(start);
    const [accepted, setAccepted] = useState<PublicUser | null>(null);
    const [guestCount, setGuestCount] = useState(0);
    const [bringSaves, setBringSaves] = useState(true);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [busy, setBusy] = useState(false);
    const [claim, setClaim] = useState<auth.GoogleClaim | null>(null);

    const [identifier, setIdentifier] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [duelistName, setDuelistName] = useState("");
    const name = useNameCheck(view === "invite" || view === "claim" ? duelistName : "");

    const body = useRef<HTMLDivElement>(null);
    const pageKey = accepted ? "accepted" : view;
    const lastPage = useRef<string | null>(null);
    // The letter inks in its first page; later pages ink in here.
    useLayoutEffect(() => {
        const first = lastPage.current === null || lastPage.current === pageKey;
        lastPage.current = pageKey;
        if (first) return;
        const ctx = gsap.context(() => {
            gsap.fromTo(".ob-ink", { autoAlpha: 0, y: 6, filter: "blur(3px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: reduce ? 0 : 0.4, stagger: reduce ? 0 : 0.05, ease: "power2.out", clearProps: "filter" });
        }, body);
        return () => ctx.revert();
    }, [pageKey, reduce]);

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

    const go = (next: LetterView) => {
        setNotice(null);
        setView(next);
    };

    const run = (event: FormEvent, task: () => Promise<Notice | null | void>) => {
        event.preventDefault();
        setBusy(true);
        setNotice(null);
        void task().then((result) => {
            setBusy(false);
            if (result) setNotice(result);
        });
    };

    const onSignUp = (e: FormEvent) =>
        run(e, async () => {
            const result = await auth.signUp({ email, password, duelistName });
            if (!result.ok) return { kind: "error", text: result.message };
            signedIn(result.data);
            setGuestCount(guestSaves().length);
            setAccepted(result.data);
        });

    // Guest saves from before signing up come along unless unticked; any that fail stay offered in Campaign Mode.
    const onAccepted = (e: FormEvent) =>
        run(e, async () => {
            if (guestCount && bringSaves) {
                const result = await moveGuestSaves(guestSaves());
                await refresh().catch(() => undefined);
                if (result.failed.length) {
                    setGuestCount(guestSaves().length);
                    return { kind: "error", text: describeMove(result) };
                }
            }
            onEnter();
        });

    const onSignIn = (e: FormEvent) =>
        run(e, async () => {
            const result = await auth.signIn({ identifier, password });
            if (!result.ok) return { kind: "error", text: result.message };
            signedIn(result.data);
            onEnter();
        });

    const onForgot = (e: FormEvent) =>
        run(e, async () => {
            const result = await auth.forgotPassword(email);
            return result.ok ? { kind: "ok", text: "If that email has an account, a reset link is on its way." } : { kind: "error", text: result.message };
        });

    const onReset = (e: FormEvent) =>
        run(e, async () => {
            if (!landing?.reset) return;
            const result = await auth.resetPassword(landing.reset, password);
            if (!result.ok) return { kind: "error", text: result.message };
            setPassword("");
            setView("signin");
            return { kind: "ok", text: "Password changed. Sign in with your new password." };
        });

    const onClaim = (e: FormEvent) =>
        run(e, async () => {
            const result = await auth.claimGoogleName(duelistName);
            if (!result.ok) return { kind: "error", text: result.message };
            signedIn(result.data);
            onEnter();
        });

    const chips = [
        { label: "Duelist name", lit: name.ok },
        { label: "Email", lit: EmailSchema.safeParse(email).success },
        { label: "Password", lit: PasswordSchema.safeParse(password).success },
    ];

    let page: ReactNode;
    if (accepted) {
        page = (
            <form onSubmit={onAccepted} aria-label="Enter the Kingdom">
                <Heading kicker="Invitation accepted" title={`Welcome, ${accepted.duelistName}`} />
                <StarCuff chips={chips.length} reduce={reduce} />
                <p className="ob-letter__text ob-ink">
                    Your star chips are set. We sent a confirmation link to <b>{accepted.email}</b>. Check your email to confirm it.
                </p>
                {guestCount > 0 && (
                    <label className="ob-check ob-ink">
                        <input type="checkbox" checked={bringSaves} onChange={(e) => setBringSaves(e.target.checked)} />
                        Bring the {guestCount} guest save{guestCount === 1 ? "" : "s"} on this device into your account
                    </label>
                )}
                <NoticeLine notice={notice} />
                <div className="ob-letter__actions">
                    <WaxButton disabled={busy}>Enter the Kingdom</WaxButton>
                </div>
            </form>
        );
    } else if (view === "invite") {
        page = (
            <form onSubmit={onSignUp} aria-label="Sign up">
                <Heading kicker="You are cordially invited to" title="Duelist Kingdom" />
                <p className="ob-letter__text ob-ink">Sign below to accept, and take your place in the series.</p>
                <Field id="dk-name" label="Duelist name" hint={name.hint} value={duelistName} onChange={(e) => setDuelistName(e.target.value)} autoComplete="nickname" required />
                <Field id="dk-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                <Field id="dk-password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                <StrengthMeter password={password} />
                <div className="ob-chips ob-ink" aria-label="Star chips">
                    {chips.map((c) => <StarChip key={c.label} {...c} />)}
                </div>
                <NoticeLine notice={notice} />
                <div className="ob-letter__actions">
                    <WaxButton disabled={!chips.every((c) => c.lit) || busy}>{busy ? "Sealing…" : "Accept the Invitation"}</WaxButton>
                </div>
                <Links>
                    <button type="button" onClick={() => go("signin")}>Already invited? Present your invitation</button>
                    <button type="button" onClick={onGuest}>Play as a guest</button>
                </Links>
            </form>
        );
    } else if (view === "claim") {
        page = (
            <form onSubmit={onClaim} aria-label="Choose a duelist name">
                <Heading kicker={claim ? `Signed in with Google as ${claim.email}` : "One last step"} title="Choose your duelist name" />
                <Field id="dk-claim" label="Duelist name" hint={name.hint} value={duelistName} onChange={(e) => setDuelistName(e.target.value)} autoComplete="nickname" required />
                <NoticeLine notice={notice} />
                <div className="ob-letter__actions">
                    <WaxButton disabled={!name.ok || busy}>Claim the Name</WaxButton>
                </div>
            </form>
        );
    } else if (view === "reset") {
        page = (
            <form onSubmit={onReset} aria-label="Choose a new password">
                <Heading kicker="Forgotten no more" title="Choose a new password" />
                <Field id="dk-new-password" label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                <StrengthMeter password={password} />
                <NoticeLine notice={notice} />
                <div className="ob-letter__actions">
                    <WaxButton disabled={!PasswordSchema.safeParse(password).success || busy}>Change Password</WaxButton>
                </div>
            </form>
        );
    } else if (view === "forgot") {
        page = (
            <form onSubmit={onForgot} aria-label="Forgot password">
                <Heading kicker="Lost your invitation?" title="Reset your password" />
                <Field id="dk-forgot-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                <NoticeLine notice={notice} />
                <div className="ob-letter__actions">
                    <WaxButton disabled={busy}>Send Reset Link</WaxButton>
                </div>
                <Links>
                    <button type="button" onClick={() => go("signin")}>Back to sign in</button>
                </Links>
            </form>
        );
    } else {
        page = (
            <form onSubmit={onSignIn} aria-label="Sign in">
                <Heading kicker="Halt, duelist" title="Present your invitation" />
                <Field id="dk-identifier" label="Email or duelist name" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
                <Field id="dk-password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                <NoticeLine notice={notice} />
                <div className="ob-letter__actions">
                    <WaxButton disabled={busy}>Sign In</WaxButton>
                    <a href={auth.GOOGLE_START_URL} className="ob-google ob-ink">Sign in with Google</a>
                </div>
                <Links>
                    <button type="button" onClick={() => go("forgot")}>Forgot password?</button>
                    <button type="button" onClick={() => go("invite")}>No invitation? Sign up</button>
                    <button type="button" onClick={onGuest}>Play as a guest</button>
                </Links>
            </form>
        );
    }

    return (
        <div ref={body} key={pageKey} className="ob-letter__page">
            {page}
        </div>
    );
}
