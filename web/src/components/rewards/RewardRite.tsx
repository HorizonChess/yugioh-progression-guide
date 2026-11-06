"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PrizeId } from "@/lib/rewards";
import Relic from "@/components/rewards/Relic";

/**
 * Where a reward is claimed: a full-screen chamber over the app, in the altar's
 * look. The relic and what the reward lets you do head it, then the picker
 * (a card gallery, a search, the rival's cards). `bare` hands the whole screen
 * to its contents (the pack opener). Escape or "Not now" leaves without claiming.
 */
export default function RewardRite({
    prizeId,
    kicker,
    title,
    lead,
    tools,
    onClose,
    bare = false,
    children,
}: {
    prizeId: PrizeId;
    kicker?: ReactNode;
    title: string;
    lead?: ReactNode;
    /** Under the heading: a search box, say. */
    tools?: ReactNode;
    onClose: () => void;
    bare?: boolean;
    children: ReactNode;
}) {
    useEffect(() => {
        // A card's close-up on top takes Escape for itself.
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".closeup") && onClose();
        addEventListener("keydown", onKey);
        return () => removeEventListener("keydown", onKey);
    }, [onClose]);

    if (typeof document === "undefined") return null;
    return createPortal(
        <div className={`rite ${bare ? "rite--bare" : ""}`} role="dialog" aria-label={title}>
            {bare ? (
                children
            ) : (
                <div className="rite__scroll custom-scrollbar">
                    <header className="rite__head">
                        <button type="button" className="rite__back" onClick={onClose}>‹ Not now</button>
                        <span className="rite__relic"><Relic prizeId={prizeId} /></span>
                        {kicker && <p className="rw-kicker">{kicker}</p>}
                        <h2>{title}</h2>
                        {lead && <p className="rite__lead">{lead}</p>}
                        {tools}
                    </header>
                    <div className="rite__body">{children}</div>
                </div>
            )}
        </div>,
        document.body,
    );
}

/** The chamber's search box. */
export const RiteSearch = ({ value, onChange, placeholder, disabled = false }: { value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) => (
    <label className="rite__search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input
            type="search"
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={placeholder}
            autoComplete="off"
            spellCheck={false}
        />
    </label>
);

/** The chamber's quiet line: loading, nothing found, a refusal. */
export const RiteNote = ({ children, pulse = false }: { children: ReactNode; pulse?: boolean }) => (
    <p className={`rite__note ${pulse ? "rite__note--pulse" : ""}`}>{children}</p>
);
