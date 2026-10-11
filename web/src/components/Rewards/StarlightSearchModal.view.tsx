"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Card,
    PulledCard,
    searchCardsByName,
    fetchAllSets,
    fetchSetDateMap,
    earliestPrintingDate,
} from "@/lib/api";
import { RewardEntry, getPrize } from "@/lib/rewards";
import Modal from "@/components/ui/Modal.view";
import ParchmentInput from "@/components/ui/ParchmentInput.view";
import CardDetailModal from "@/components/card/CardDetailModal.view";
import FrameButton from "@/components/ui/FrameButton.view";

interface StarlightSearchModalProps {
    entry: RewardEntry;
    /** Grant the chosen card + mark the reward claimed, then the modal closes. */
    onChoose: (card: PulledCard) => void;
    onClose: () => void;
}

/**
 * The Starlight Rare wildcard claim — a full-catalog typeahead (unlike the plain
 * wildcard, which is limited to the won pack). A card is eligible iff it has a
 * printing dated BEFORE the won pack (`earliestPrintingDate < sets[wonFromSetIndex]
 * .tcg_date`) — a pure-date gate, so off-timeline cards (e.g. structure-deck
 * classics) are reachable, matching the Starlight rule. Clicking a result opens
 * its detail modal for confirmation (a starlight is one-shot); confirming grants
 * it as a Starlight Rare PulledCard.
 */
export default function StarlightSearchModal({ entry, onChoose, onClose }: StarlightSearchModalProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Card[]>([]);
    const [loading, setLoading] = useState(false);
    /** A clicked card awaiting confirmation in its detail modal. */
    const [pending, setPending] = useState<Card | null>(null);
    /** The won pack's date — the eligibility ceiling — and the set-date lookup. */
    const [gate, setGate] = useState<{ anchorDate: string | null; setDates: Map<string, string> } | null>(null);
    const reqId = useRef(0);

    const prizeLabel = getPrize(entry.prizeId)?.label ?? "Wildcard (Starlight Rare)";

    // Resolve the "released before this pack" ceiling once from the won pack.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [sets, setDates] = await Promise.all([fetchAllSets(), fetchSetDateMap()]);
            if (cancelled) return;
            setGate({ anchorDate: sets[entry.wonFromSetIndex]?.tcg_date ?? null, setDates });
        })();
        return () => {
            cancelled = true;
        };
    }, [entry.wonFromSetIndex]);

    // Debounced full-DB search once the gate is loaded. Every state change happens
    // inside the timer (asynchronously), so the effect body only schedules work —
    // a <2-char query settles to an empty, non-loading result; a real query flips
    // to loading, fetches, then settles with the eligible cards.
    useEffect(() => {
        if (!gate) return;
        const q = query.trim();
        const short = q.length < 2;
        const myReq = ++reqId.current;
        const t = setTimeout(async () => {
            if (myReq !== reqId.current) return;
            if (short) {
                setResults([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            const cards = await searchCardsByName(q);
            // Ignore out-of-order responses (a later keystroke already fired).
            if (myReq !== reqId.current) return;
            setResults(cards);
            setLoading(false);
        }, short ? 0 : 300);
        return () => clearTimeout(t);
    }, [query, gate]);

    // Keep only cards with a printing dated before the won pack (Starlight gate).
    const eligible = useMemo(() => {
        if (!gate) return [];
        const { anchorDate, setDates } = gate;
        return results
            .filter((card) => {
                const earliest = earliestPrintingDate(card, setDates);
                if (earliest == null) return false;
                return anchorDate == null ? true : earliest < anchorDate;
            })
            .slice(0, 40);
    }, [results, gate]);

    const panelClassName =
        "relative w-full max-w-2xl h-[80vh] max-h-[760px] bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col";

    // The earliest set_code among the card's pre-anchor printings — used as the
    // collection key's set component so the granted copy is attributable.
    const grantSetCode = (card: Card): string => {
        if (!gate) return "STARLIGHT";
        const { anchorDate, setDates } = gate;
        let best: { date: string; code: string } | null = null;
        for (const printing of card.card_sets ?? []) {
            const date = setDates.get(printing.set_name);
            if (date == null) continue;
            if (anchorDate != null && date >= anchorDate) continue;
            if (best == null || date < best.date) best = { date, code: printing.set_code };
        }
        return best?.code ?? "STARLIGHT";
    };

    const confirmChoice = () => {
        if (!pending) return;
        const granted: PulledCard = {
            ...pending,
            pulled_rarity: "Starlight Rare",
            pulled_set_code: grantSetCode(pending),
        };
        onChoose(granted);
    };

    return (
        <Modal onClose={onClose} panelClassName={panelClassName} showCloseButton>
            <div className="shrink-0 px-6 py-4 border-b border-white/10">
                <h2 className="text-2xl font-black text-white">{prizeLabel}</h2>
                <p className="text-primary text-sm font-bold">
                    Search any card released before {entry.wonFromPackName} to claim it as a Starlight Rare.
                </p>
            </div>

            <div className="shrink-0 px-6 py-3">
                <ParchmentInput
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={gate ? "Type a card name…" : "Loading catalog…"}
                    disabled={!gate}
                    className="w-full"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 pb-6">
                {!gate || loading ? (
                    <div className="py-10 text-center text-white/70 animate-pulse">
                        {gate ? "Searching…" : "Loading catalog…"}
                    </div>
                ) : eligible.length === 0 ? (
                    <div className="py-10 text-center text-white/50">
                        {query.trim().length < 2
                            ? "Type at least 2 characters."
                            : "No eligible cards found (must be released before this pack)."}
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {eligible.map((card) => (
                            <li key={card.id}>
                                <button
                                    onClick={() => setPending(card)}
                                    className="w-full flex items-center gap-3 p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 transition-colors text-left"
                                >
                                    <div className="relative w-10 h-[58px] shrink-0 rounded overflow-hidden bg-black/40">
                                        {card.card_images?.[0]?.image_url_small && (
                                            // eslint-disable-next-line @next/next/no-img-element
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

            {/* Confirm the pick inside its detail modal before granting. */}
            {pending && (
                <CardDetailModal
                    card={pending}
                    onClose={() => setPending(null)}
                    action={
                        <div className="flex items-center gap-3">
                            <FrameButton
                                onClick={confirmChoice}
                                className="h-11 px-5 flex-1 min-w-0"
                                textClassName="tracking-[0.1em] text-[0.72rem] truncate"
                            >
                                Claim as Starlight
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
