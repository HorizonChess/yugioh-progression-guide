"use client";

import { useEffect, useState } from "react";
import { useProgression } from "@/context/ProgressionContext";
import { describeMove, guestSaves, moveGuestSaves } from "@/lib/guest-saves";
import type { SaveSlot } from "@/lib/storage";

const DISMISSED_KEY = "guestSavesDismissed";

/** Offers a signed-in player the guest saves left in this browser, to move into the account. */
export default function GuestSavesImport() {
    const { refresh } = useProgression();
    const [saves, setSaves] = useState<SaveSlot[]>([]);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);

    // Read after mounting: storage only exists in the browser.
    useEffect(() => {
        let dismissed = false;
        try {
            dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1";
        } catch {
            // Storage blocked: show the offer.
        }
        if (dismissed) return;
        const found = guestSaves();
        void Promise.resolve().then(() => {
            setSaves(found);
            setPicked(new Set(found.map((s) => s.id)));
        });
    }, []);

    const dismiss = () => {
        try {
            sessionStorage.setItem(DISMISSED_KEY, "1");
        } catch {
            // It just comes back next time.
        }
        setSaves([]);
    };

    const toggle = (id: string) =>
        setPicked((prev) => {
            const next = new Set(prev);
            if (!next.delete(id)) next.add(id);
            return next;
        });

    const move = async () => {
        setBusy(true);
        const result = await moveGuestSaves(saves.filter((s) => picked.has(s.id)));
        await refresh().catch(() => undefined);
        const left = guestSaves();
        setSaves(left);
        setPicked(new Set(left.map((s) => s.id)));
        setNote(describeMove(result));
        setBusy(false);
    };

    if (note) {
        return (
            <div role="status" className="bg-gray-900 border border-gray-700 p-3 text-xs text-gray-300 space-y-2">
                <p>{note}</p>
                <button type="button" onClick={() => setNote(null)} className="text-gray-500 hover:text-white">Done</button>
            </div>
        );
    }
    if (!saves.length) return null;

    return (
        <section aria-label="Guest saves" className="bg-gray-900 border border-[var(--primary)] p-3 text-sm text-gray-300 space-y-2">
            <p>
                This device has {saves.length} guest save{saves.length === 1 ? "" : "s"}. Move {saves.length === 1 ? "it" : "them"} into your account? Moved saves leave
                the guest list here.
            </p>
            <ul className="space-y-1">
                {saves.map((s) => (
                    <li key={s.id}>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                            <span className="text-white">{s.name}</span>
                            <span className="text-xs text-gray-500">
                                {s.currentSetName ?? "?"} · {Object.values(s.collection).reduce((a, b) => a + b, 0)} cards
                            </span>
                        </label>
                    </li>
                ))}
            </ul>
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={dismiss} className="text-xs text-gray-400 hover:text-white px-3 py-1">
                    NOT NOW
                </button>
                <button
                    type="button"
                    onClick={() => void move()}
                    disabled={busy || picked.size === 0}
                    className="text-xs bg-[var(--primary)] text-black px-3 py-1 rounded font-bold hover:bg-yellow-400 disabled:opacity-50"
                >
                    {busy ? "MOVING…" : "MOVE TO ACCOUNT"}
                </button>
            </div>
        </section>
    );
}
