"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import * as auth from "@/lib/auth-client";

const field = "w-full bg-black border border-gray-700 p-2 text-white text-sm focus:border-[var(--primary)] outline-none";
const label = "text-xs text-gray-500 uppercase font-bold block mb-1";
const link = "text-xs text-gray-400 hover:text-white";

/** The menu's own sign-in (and forgot-password) box; signing up still happens on the title screen's letter. */
export default function MenuSignIn({ onDone }: { onDone: () => void }) {
    const { signedIn } = useAuth();
    const [forgot, setForgot] = useState(false);
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setNotice(null);
        if (forgot) {
            const result = await auth.forgotPassword(identifier);
            setNotice(result.ok ? { error: false, text: "If that email has an account, a reset link is on its way." } : { error: true, text: result.message });
        } else {
            const result = await auth.signIn({ identifier, password });
            if (result.ok) {
                signedIn(result.data);
                return onDone();
            }
            setNotice({ error: true, text: result.message });
        }
        setBusy(false);
    };

    return (
        <form onSubmit={submit} aria-label={forgot ? "Forgot password" : "Sign in"} className="w-full max-w-md bg-gray-900 p-4 rounded border border-[var(--primary)] space-y-3">
            <h3 className="text-xl font-bold text-white uppercase tracking-widest">{forgot ? "Reset Password" : "Sign In"}</h3>
            <div>
                <label className={label} htmlFor="menu-identifier">{forgot ? "Email" : "Email or duelist name"}</label>
                <input
                    id="menu-identifier"
                    type={forgot ? "email" : "text"}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete={forgot ? "email" : "username"}
                    className={field}
                    autoFocus
                    required
                />
            </div>
            {!forgot && (
                <div>
                    <label className={label} htmlFor="menu-password">Password</label>
                    <input id="menu-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={field} required />
                </div>
            )}
            {notice && (
                <p role="status" className={`text-xs ${notice.error ? "text-red-400" : "text-green-400"}`}>
                    {notice.text}
                </p>
            )}
            <div className="flex items-center justify-between gap-2">
                {forgot ? (
                    <span />
                ) : (
                    <a href={auth.GOOGLE_START_URL} className={link}>Sign in with Google</a>
                )}
                <button type="submit" disabled={busy} className="text-xs bg-[var(--primary)] text-black px-3 py-1 rounded font-bold hover:bg-yellow-400 disabled:opacity-50">
                    {forgot ? "SEND RESET LINK" : busy ? "SIGNING IN…" : "SIGN IN"}
                </button>
            </div>
            <div className="flex gap-4 pt-1 border-t border-gray-800">
                <button type="button" onClick={() => { setForgot(!forgot); setNotice(null); }} className={link}>
                    {forgot ? "Back to sign in" : "Forgot password?"}
                </button>
                <Link href="/?invite" className={link}>No account? Sign up</Link>
            </div>
        </form>
    );
}
