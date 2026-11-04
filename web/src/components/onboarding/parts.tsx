"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DuelistNameSchema } from "@ygo/shared";
import { checkDuelistName } from "@/lib/auth-client";
import ParchmentInput from "@/components/ui/ParchmentInput";

export function ParchmentCard({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) {
    return (
        <div className="parchment-bg rounded-xl p-6 shadow-2xl space-y-4">
            <header className="text-center">
                {kicker && <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-wood-light">{kicker}</p>}
                <h2 className="text-xl font-black uppercase tracking-wider text-ink">{title}</h2>
            </header>
            {children}
        </div>
    );
}

export function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-wood-light">{label}</label>
            <ParchmentInput id={id} className="w-full text-base" {...input} />
            {hint && <p className="text-xs text-wood-light">{hint}</p>}
        </div>
    );
}

export type Notice = { kind: "ok" | "error"; text: string };

export function NoticeLine({ notice }: { notice: Notice | null }) {
    if (!notice) return null;
    return (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm font-bold ${notice.kind === "ok" ? "border-green-800/40 text-green-900" : "border-red-800/40 text-red-800"}`}>
            {notice.text}
        </p>
    );
}

export function StarChip({ lit, label }: { lit: boolean; label: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`h-7 w-7 transition-all duration-300 ${lit ? "drop-shadow-[0_0_6px_var(--primary)] scale-110" : "opacity-40"}`} role="img" aria-label={`Star chip for ${label.toLowerCase()}${lit ? ": ready" : ""}`}>
            <circle cx="12" cy="12" r="11" fill={lit ? "var(--primary)" : "var(--wood-border)"} stroke="var(--wood-dark)" strokeWidth="1" />
            <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7z" fill={lit ? "#fff8dc" : "var(--parchment)"} />
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
        <div className="flex items-center gap-2" aria-label={`Password strength: ${STRENGTH[score]}`}>
            <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded ${i <= score ? "bg-primary" : "bg-wood-border/40"}`} />
                ))}
            </div>
            <span className="w-16 text-right text-[10px] font-bold uppercase text-wood-light">{password ? STRENGTH[score] : ""}</span>
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
