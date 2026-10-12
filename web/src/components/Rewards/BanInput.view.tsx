"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, searchCardsByName, fetchCardsByIds } from "@/lib/api";
import Modal from "@/components/ui/Modal.view";
import ParchmentInput from "@/components/ui/ParchmentInput.view";
import CardDetailModal from "@/components/card/CardDetailModal.view";
import FrameButton from "@/components/ui/FrameButton.view";

interface BanInputProps {
    mode: "ban" | "unban";
    /** For unban: the card ids currently banned (the pick pool). Ignored for ban. */
    bannedCardIds?: number[];
    /** Chosen card → the controller bans/unbans it + claims the reward. */
    onPick: (card: Card) => void;
    onClose: () => void;
}

/**
 * The Ban / Unban reward claim — a parchment typeahead hosted in the shared
 * `Modal`. Ban searches the FULL card DB (`searchCardsByName`, restricted to
 * cards that existed by the cutoff); Unban lists the save's currently-banned
 * cards (`fetchCardsByIds(bannedCardIds)`). Clicking a result opens its detail
 * modal for CONFIRMATION — only confirming there hands the card up. The ban
 * itself is cosmetic (the deck builder reads `bannedCardIds` and blocks/greys
 * the add — no saved decks are stripped).
 */
export default function BanInput({ mode, bannedCardIds = [], onPick, onClose }: BanInputProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Card[]>([]);
    const [loading, setLoading] = useState(false);
    /** A clicked card awaiting confirmation in its detail modal. */
    const [pending, setPending] = useState<Card | null>(null);
    const reqId = useRef(0);

    const isBan = mode === "ban";

    // Unban: load the banned cards once (the fixed pick pool).
    useEffect(() => {
        if (isBan) return;
        let cancelled = false;
        setLoading(true);
        fetchCardsByIds(bannedCardIds)
            .then((cards) => {
                if (!cancelled) setResults(cards);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // bannedCardIds identity is stable for the modal's lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBan]);

    // Ban: debounced full-DB search as the player types.
    useEffect(() => {
        if (!isBan) return;
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const myReq = ++reqId.current;
        const t = setTimeout(async () => {
            const cards = await searchCardsByName(q);
            // Ignore out-of-order responses (a later keystroke already fired).
            if (myReq !== reqId.current) return;
            setResults(cards.slice(0, 40));
            setLoading(false);
        }, 300);
        return () => clearTimeout(t);
    }, [query, isBan]);

    // Unban list is filtered client-side by the same box.
    const shown = useMemo(() => {
        if (isBan) return results;
        const q = query.trim().toLowerCase();
        return q ? results.filter((c) => c.name.toLowerCase().includes(q)) : results;
    }, [isBan, results, query]);

    const panelClassName =
        "relative w-full max-w-2xl h-[80vh] max-h-[760px] bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col";

    return (
        <Modal onClose={onClose} panelClassName={panelClassName} showCloseButton>
            <div className="shrink-0 px-6 py-4 border-b border-white/10">
                <h2 className="text-2xl font-black text-white">{isBan ? "Ban a Card" : "Unban a Card"}</h2>
                <p className="text-primary text-sm font-bold">
                    {isBan
                        ? "Search any card to ban it from your decks."
                        : "Choose one of your banned cards to lift its ban."}
                </p>
            </div>

            <div className="shrink-0 px-6 py-3">
                <ParchmentInput
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={isBan ? "Type a card name…" : "Filter banned cards…"}
                    className="w-full"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 pb-6">
                {loading ? (
                    <div className="py-10 text-center text-white/70 animate-pulse">Searching…</div>
                ) : shown.length === 0 ? (
                    <div className="py-10 text-center text-white/50">
                        {isBan
                            ? query.trim().length < 2
                                ? "Type at least 2 characters."
                                : "No cards found."
                            : "No banned cards."}
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {shown.map((card) => (
                            <li key={card.id}>
                                <button
                                    onClick={() => setPending(card)}
                                    className="w-full flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 transition-colors text-left"
                                >
                                    <div className="relative w-10 h-[58px] shrink-0 rounded overflow-hidden bg-black/40">
                                        {card.card_images?.[0]?.image_url_small && (
                                            <img
                                                src={card.card_images[0].image_url_small}
                                                alt={card.name}
                                                className="w-full h-full object-cover"
                                            />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-white font-bold text-sm truncate">{card.name}</div>
                                        <div className="text-white/50 text-xs truncate">{card.type}</div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Confirm the pick inside its detail modal before committing. */}
            {pending && (
                <CardDetailModal
                    card={pending}
                    onClose={() => setPending(null)}
                    action={
                        <div className="flex items-center gap-3">
                            <FrameButton
                                onClick={() => onPick(pending)}
                                className="h-11 px-5 flex-1 min-w-0"
                                textClassName="tracking-[0.1em] text-[0.72rem] truncate"
                            >
                                {isBan ? "Ban This Card" : "Unban This Card"}
                            </FrameButton>
                            <button
                                onClick={() => setPending(null)}
                                className="h-11 px-4 shrink-0 rounded-lg border border-white/15 text-white/70 text-sm font-bold hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    }
                />
            )}
        </Modal>
    );
}
