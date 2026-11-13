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
import { useProgression } from "@/context/ProgressionContext";
import { ownedCountsById } from "@/lib/collection";
import CardGallery, { type GalleryItem } from "@/components/card/CardGallery";
import { CardCloseUp } from "@/components/card/CardPlate";
import type { StageCard } from "@/components/packs/stage/plate";
import TabletButton from "@/components/ui/TabletButton";
import RewardRite, { RiteNote, RiteSearch } from "@/components/rewards/RewardRite";

interface StarlightSearchModalProps {
    entry: RewardEntry;
    /** Grant the chosen card + mark the reward claimed, then the modal closes. */
    onChoose: (card: PulledCard) => void;
    onClose: () => void;
}

/**
 * The Starlight Rare wildcard claim — a full-catalog search (unlike the plain
 * wildcard, which is limited to the won pack). A card is eligible iff it has a
 * printing dated up to the won pack, included (`earliestPrintingDate <= sets[wonFromSetIndex]
 * .tcg_date`) — a pure-date gate, so off-timeline cards (e.g. structure-deck
 * classics) are reachable, matching the Starlight rule. Tapping a result opens
 * its close-up for confirmation (a starlight is one-shot); confirming grants it
 * as a Starlight Rare PulledCard.
 */
export default function StarlightSearchModal({ entry, onChoose, onClose }: StarlightSearchModalProps) {
    const { collection } = useProgression();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Card[]>([]);
    const [loading, setLoading] = useState(false);
    /** A tapped card awaiting confirmation in its close-up. */
    const [pending, setPending] = useState<StageCard | null>(null);
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

    // Keep only cards with a printing dated up to the won pack, that pack included (Starlight gate).
    const eligible = useMemo(() => {
        if (!gate) return [];
        const { anchorDate, setDates } = gate;
        return results
            .filter((card) => {
                const earliest = earliestPrintingDate(card, setDates);
                if (earliest == null) return false;
                return anchorDate == null ? true : earliest <= anchorDate;
            })
            .slice(0, 40);
    }, [results, gate]);

    // The earliest set_code among the card's pre-anchor printings — used as the
    // collection key's set component so the granted copy is attributable.
    const grantSetCode = (card: Card): string => {
        if (!gate) return "STARLIGHT";
        const { anchorDate, setDates } = gate;
        let best: { date: string; code: string } | null = null;
        for (const printing of card.card_sets ?? []) {
            const date = setDates.get(printing.set_name);
            if (date == null) continue;
            if (anchorDate != null && date > anchorDate) continue;
            if (best == null || date < best.date) best = { date, code: printing.set_code };
        }
        return best?.code ?? "STARLIGHT";
    };

    // Each eligible card as it would be granted: a Starlight Rare.
    const owned = ownedCountsById(collection);
    const items: GalleryItem[] = eligible.map((card) => {
        const n = owned.get(card.id) ?? 0;
        return {
            key: String(card.id),
            count: 0,
            card: { card, image: card.card_images[0]?.image_url ?? "", tier: "Secret", rarity: "Starlight Rare", code: grantSetCode(card), owned: n, ownedNote: n ? `You own ×${n}` : "Not owned yet" },
        };
    });

    const confirmChoice = () => {
        if (!pending) return;
        onChoose({ ...pending.card, pulled_rarity: "Starlight Rare", pulled_set_code: grantSetCode(pending.card) });
    };

    return (
        <RewardRite
            prizeId={entry.prizeId}
            kicker={`Won on the ${entry.wonFromPackName} wheel`}
            title={prizeLabel}
            lead={<>Any card released up to <b>{entry.wonFromPackName}</b> (its own cards included), as a Starlight Rare.</>}
            tools={<RiteSearch value={query} onChange={setQuery} placeholder={gate ? "Search a card name" : "Loading the catalog…"} disabled={!gate} />}
            onClose={onClose}
        >
            {!gate || loading ? (
                <RiteNote pulse>{gate ? "Searching…" : "Loading the catalog…"}</RiteNote>
            ) : (
                <CardGallery
                    items={items}
                    flat
                    onOpen={(item) => setPending(item.card)}
                    empty={<RiteNote>{query.trim().length < 2 ? "Type at least 2 letters of a card's name." : "No card by that name was out by this pack."}</RiteNote>}
                />
            )}

            {/* Confirm the pick in its close-up before granting. */}
            {pending && (
                <CardCloseUp
                    card={pending}
                    onClose={() => setPending(null)}
                    action={
                        <div className="rite__confirm">
                            <TabletButton onClick={confirmChoice}>Claim as Starlight</TabletButton>
                        </div>
                    }
                />
            )}
        </RewardRite>
    );
}
