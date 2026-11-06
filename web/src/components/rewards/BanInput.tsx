"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, searchCardsByName, fetchCardsByIds } from "@/lib/api";
import { useProgression } from "@/context/ProgressionContext";
import { ownedCountsById } from "@/lib/collection";
import CardGallery, { type GalleryItem } from "@/components/card/CardGallery";
import { CardCloseUp } from "@/components/card/CardPlate";
import { printedIn, type StageCard } from "@/components/packs/stage/plate";
import TabletButton from "@/components/ui/TabletButton";
import RewardRite, { RiteNote, RiteSearch } from "@/components/rewards/RewardRite";

interface BanInputProps {
    mode: "ban" | "unban";
    /** For unban: the card ids currently banned (the pick pool). Ignored for ban. */
    bannedCardIds?: number[];
    /** Chosen card → the page bans/unbans it + claims the reward. */
    onPick: (card: Card) => void;
    onClose: () => void;
    /** Which set's wheel it was won on, for the heading. */
    wonFrom?: string;
}

/**
 * The Ban / Unban reward claim: a search in the claiming chamber. Ban searches
 * the FULL card DB (`searchCardsByName`); Unban lists the currently-banned cards
 * (`fetchCardsByIds(bannedCardIds)`), filtered by the same box. Tapping a result
 * opens its close-up for CONFIRMATION: only confirming there hands the card up.
 * The ban itself is enforced by the deck builder, which reads `bannedCardIds`
 * and blocks/greys the add (no saved decks are stripped).
 */
export default function BanInput({ mode, bannedCardIds = [], onPick, onClose, wonFrom }: BanInputProps) {
    const { collection } = useProgression();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Card[]>([]);
    const [loading, setLoading] = useState(false);
    /** A tapped card awaiting confirmation in its close-up. */
    const [pending, setPending] = useState<StageCard | null>(null);
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

    const owned = ownedCountsById(collection);
    const items: GalleryItem[] = shown.map((card) => {
        const n = owned.get(card.id) ?? 0;
        return { key: String(card.id), count: 0, card: printedIn(card, card.card_sets?.[0]?.set_code ?? "", n, isBan ? (n ? `You own ×${n}` : "Not owned yet") : "Banned") };
    });

    return (
        <RewardRite
            prizeId={isBan ? "ban" : "unban"}
            kicker={wonFrom ? `Won on the ${wonFrom} wheel` : undefined}
            title={isBan ? "Ban a Card" : "Unban a Card"}
            lead={isBan ? "Name a card neither of you can put in a deck." : "Choose a banned card to lift its ban."}
            tools={<RiteSearch value={query} onChange={setQuery} placeholder={isBan ? "Search a card name" : "Filter the banned cards"} />}
            onClose={onClose}
        >
            {loading ? (
                <RiteNote pulse>Searching…</RiteNote>
            ) : (
                <CardGallery
                    items={items}
                    flat
                    onOpen={(item) => setPending(item.card)}
                    empty={<RiteNote>{isBan ? (query.trim().length < 2 ? "Type at least 2 letters of a card's name." : "No card by that name.") : "No cards are banned."}</RiteNote>}
                />
            )}

            {/* Confirm the pick in its close-up before committing. */}
            {pending && (
                <CardCloseUp
                    card={pending}
                    onClose={() => setPending(null)}
                    action={
                        <div className="rite__confirm">
                            <TabletButton onClick={() => onPick(pending.card)}>{isBan ? "Ban This Card" : "Lift the Ban"}</TabletButton>
                        </div>
                    }
                />
            )}
        </RewardRite>
    );
}
