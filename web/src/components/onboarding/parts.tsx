"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { DuelistNameSchema } from "@ygo/shared";
import { checkDuelistName } from "@/lib/auth-client";

/** A line to write on, the way a letter has one. */
export function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="ob-field ob-ink">
            <label htmlFor={id}>{label}</label>
            <input id={id} {...input} />
            {hint && <p className="ob-field__hint">{hint}</p>}
        </div>
    );
}

export type Notice = { kind: "ok" | "error"; text: string };

export function NoticeLine({ notice }: { notice: Notice | null }) {
    if (!notice) return null;
    return (
        <p role="status" className={`ob-notice ob-notice--${notice.kind}`}>
            {notice.text}
        </p>
    );
}

/** A wax-red button, pressed like a seal. */
export function WaxButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button type="submit" className="ob-wax-btn ob-ink" {...props}>
            {children}
        </button>
    );
}

/** A gold star chip with a pressed star; unlit it's dull pewter. */
export function StarChip({ lit, label, size = 30 }: { lit: boolean; label?: string; size?: number }) {
    const id = useId();
    return (
        <svg
            viewBox="0 0 40 40"
            width={size}
            height={size}
            className={`ob-chip ${lit ? "ob-chip--lit" : ""}`}
            role={label ? "img" : undefined}
            aria-hidden={label ? undefined : true}
            aria-label={label ? `Star chip for ${label.toLowerCase()}${lit ? ": ready" : ""}` : undefined}
        >
            <defs>
                <radialGradient id={`${id}f`} cx="0.35" cy="0.3" r="0.8">
                    <stop offset="0" stopColor={lit ? "#fff6cf" : "#b9b4aa"} />
                    <stop offset="0.45" stopColor={lit ? "#e0b743" : "#7d776c"} />
                    <stop offset="1" stopColor={lit ? "#7a5410" : "#3e3a33"} />
                </radialGradient>
                <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={lit ? "#fff1b8" : "#cfcac0"} />
                    <stop offset="1" stopColor={lit ? "#5c3e08" : "#2a2722"} />
                </linearGradient>
            </defs>
            <circle cx="20" cy="20" r="18.5" fill={`url(#${id}r)`} />
            <circle cx="20" cy="20" r="16" fill={`url(#${id}f)`} />
            <path d="M20 8.5l3.4 7 7.7 1.1-5.6 5.4 1.3 7.6L20 26l-6.8 3.6 1.3-7.6-5.6-5.4 7.7-1.1z" fill={lit ? "#8a6312" : "#4a463f"} opacity="0.55" transform="translate(0.6 0.8)" />
            <path d="M20 8.5l3.4 7 7.7 1.1-5.6 5.4 1.3 7.6L20 26l-6.8 3.6 1.3-7.6-5.6-5.4 7.7-1.1z" fill={lit ? "#fff3c2" : "#a39d92"} />
            <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity={lit ? 0.45 : 0.15} transform="rotate(-30 14 12)" />
        </svg>
    );
}

/** 0–4: length, more length, mixed case, a digit or symbol. */
export function passwordStrength(password: string): number {
    if (password.length < 8) return 0;
    return 1 + Number(password.length >= 12) + Number(/[a-z]/.test(password) && /[A-Z]/.test(password)) + Number(/[\d\W_]/.test(password));
}

const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

export function StrengthMeter({ password }: { password: string }) {
    const score = passwordStrength(password);
    return (
        <div className="ob-strength ob-ink" aria-label={`Password strength: ${STRENGTH[score]}`}>
            <div className="ob-strength__bars">
                {[1, 2, 3, 4].map((i) => <span key={i} className={i <= score ? "is-on" : ""} />)}
            </div>
            <span className="ob-strength__word">{password ? STRENGTH[score] : ""}</span>
        </div>
    );
}

/** Live "is this duelist name free?" check, debounced. */
export function useNameCheck(name: string) {
    const [result, setResult] = useState<{ name: string; available: boolean; reason?: string } | null>(null);
    const trimmed = name.trim();
    useEffect(() => {
        if (!DuelistNameSchema.safeParse(trimmed).success) return;
        const timer = setTimeout(() => {
            void checkDuelistName(trimmed).then((r) => setResult({ name: trimmed, ...r }));
        }, 400);
        return () => clearTimeout(timer);
    }, [trimmed]);

    const valid = DuelistNameSchema.safeParse(trimmed);
    if (!trimmed) return { ok: false, hint: "3–20 characters. Rivals invite you by this name." };
    if (!valid.success) return { ok: false, hint: valid.error.issues[0]?.message ?? "Not a valid name" };
    if (result?.name !== trimmed) return { ok: false, hint: "Checking…" };
    return result.available ? { ok: true, hint: "✓ Available" } : { ok: false, hint: `✗ ${result.reason ?? "Taken"}` };
}
