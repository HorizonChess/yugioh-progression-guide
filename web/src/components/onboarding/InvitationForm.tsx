"use client";

import { useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EmailSchema, PasswordSchema, type PublicUser } from "@ygo/shared";
import { signUp } from "@/lib/auth-client";
import FrameButton from "@/components/ui/FrameButton";
import { Field, NoticeLine, ParchmentCard, StarChip, StrengthMeter, passwordStrength, useNameCheck, type Notice } from "./parts";

/** The four star-chip sockets along the glove's cuff. */
const SLOTS = [62, 84, 106, 128];
const FINGERS = [
    { x: 58, h: 64, r: -6 },
    { x: 80, h: 74, r: -2 },
    { x: 102, h: 70, r: 3 },
    { x: 124, h: 56, r: 8 },
];

/** A Duelist Kingdom glove: leather fingers and a gold-trimmed cuff whose sockets take the star chips. */
function Glove({ filled }: { filled: boolean }) {
    const reduce = useReducedMotion();
    return (
        <svg viewBox="0 0 190 210" className="mx-auto h-48 w-48" role="img" aria-label="Your duelist glove">
            <defs>
                <linearGradient id="dk-leather" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#5a4128" />
                    <stop offset="0.55" stopColor="#3a2a1a" />
                    <stop offset="1" stopColor="#1f160d" />
                </linearGradient>
                <linearGradient id="dk-cuff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2a1f14" />
                    <stop offset="1" stopColor="#120c07" />
                </linearGradient>
                <radialGradient id="dk-chip" cx="0.4" cy="0.35" r="0.7">
                    <stop offset="0" stopColor="#fff3c4" />
                    <stop offset="0.45" stopColor="var(--primary)" />
                    <stop offset="1" stopColor="#7a5a12" />
                </radialGradient>
            </defs>
            {FINGERS.map((f) => (
                <rect key={f.x} x={f.x - 10} y={100 - f.h} width="20" height={f.h + 20} rx="10" fill="url(#dk-leather)" stroke="#120c07" strokeWidth="2" transform={`rotate(${f.r} ${f.x} 110)`} />
            ))}
            <rect x="30" y="98" width="30" height="58" rx="15" fill="url(#dk-leather)" stroke="#120c07" strokeWidth="2" transform="rotate(-38 45 150)" />
            <rect x="44" y="86" width="104" height="76" rx="22" fill="url(#dk-leather)" stroke="#120c07" strokeWidth="2" />
            <path d="M54 98 Q96 88 138 98" fill="none" stroke="var(--wood-border)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
            <path d="M66 110 Q72 130 70 150" fill="none" stroke="#120c07" strokeWidth="1.5" opacity="0.5" />
            <rect x="38" y="150" width="116" height="46" rx="8" fill="url(#dk-cuff)" stroke="var(--primary)" strokeWidth="2.5" />
            <line x1="44" y1="157" x2="148" y2="157" stroke="var(--primary)" strokeWidth="1" opacity="0.6" />
            <line x1="44" y1="189" x2="148" y2="189" stroke="var(--primary)" strokeWidth="1" opacity="0.6" />
            {SLOTS.map((cx, i) => (
                <g key={cx}>
                    <circle cx={cx} cy="173" r="10" fill="#0a0704" stroke="var(--wood-border)" strokeWidth="1.5" />
                    {filled && (
                        <motion.g
                            initial={reduce ? false : { y: -150, opacity: 0, scale: 1.8 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            transition={{ delay: 0.18 * i, duration: 0.55, ease: "easeOut" }}
                            style={{ transformOrigin: `${cx}px 173px` }}
                        >
                            <circle cx={cx} cy="173" r="8.5" fill="url(#dk-chip)" />
                            <path
                                d={`M${cx} 166.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z`}
                                fill="#fffbe6"
                                opacity="0.9"
                            />
                        </motion.g>
                    )}
                </g>
            ))}
        </svg>
    );
}

/** The unfolded invitation: duelist name, email and password, one star chip per check. */
export default function InvitationForm({ onSignedUp, onDone }: { onSignedUp: (user: PublicUser) => void; onDone: () => void }) {
    const [duelistName, setDuelistName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [accepted, setAccepted] = useState<PublicUser | null>(null);

    const name = useNameCheck(duelistName);
    const chips = [
        { label: "Duelist name", lit: name.ok },
        { label: "Email", lit: EmailSchema.safeParse(email).success },
        { label: "Password", lit: PasswordSchema.safeParse(password).success },
        { label: "Strong password", lit: passwordStrength(password) >= 3 },
    ];
    const ready = chips.slice(0, 3).every((c) => c.lit);

    const accept = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setNotice(null);
        const result = await signUp({ email, password, duelistName });
        setBusy(false);
        if (!result.ok) return setNotice({ kind: "error", text: result.message });
        setAccepted(result.data);
        onSignedUp(result.data);
    };

    if (accepted) {
        return (
            <ParchmentCard kicker="Invitation accepted" title={`Welcome, ${accepted.duelistName}`}>
                <Glove filled />
                <p className="text-center text-sm text-ink">
                    Your star chips are set. We sent a confirmation link to <b>{accepted.email}</b>. Check your email to confirm it.
                </p>
                <div className="flex justify-center">
                    <FrameButton onClick={onDone} className="h-12 px-6">Enter the Kingdom</FrameButton>
                </div>
            </ParchmentCard>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 30, scaleY: 0.6 }} animate={{ opacity: 1, y: 0, scaleY: 1 }} transition={{ duration: 0.45 }}>
            <ParchmentCard kicker="You are cordially invited to" title="Duelist Kingdom">
                <form onSubmit={accept} className="space-y-3" aria-label="Sign up">
                    <Field id="dk-name" label="Duelist name" hint={name.hint} value={duelistName} onChange={(e) => setDuelistName(e.target.value)} autoComplete="nickname" required />
                    <Field id="dk-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                    <Field id="dk-password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                    <StrengthMeter password={password} />
                    <div className="flex justify-center gap-3 py-1" aria-label="Star chips">
                        {chips.map((c) => <StarChip key={c.label} {...c} />)}
                    </div>
                    <NoticeLine notice={notice} />
                    <div className="flex justify-center">
                        <FrameButton type="submit" disabled={!ready || busy} className="h-12 px-6">
                            {busy ? "Sealing…" : "Accept the Invitation"}
                        </FrameButton>
                    </div>
                </form>
            </ParchmentCard>
        </motion.div>
    );
}
