"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ruleEraFor } from "@ygo/shared";
import type { SavedDeck } from "@/lib/storage";
import { acceptDuel, declineDuel, duelPath, openDuels, startDuel, type DuelSummary } from "@/lib/duel-client";
import { alertRepoError } from "@/context/ProgressionContext";
import { latestDeck, markDeckUsed } from "@/lib/deck-choice";
import { SwordsGlyph } from "./DuelGlyphs";
import "./duel-launcher.css";

/**
 * Playing the series' duel here, on the server's rules engine (duo): challenge the rival, answer
 * the rival's challenge, or go back to the match in progress. (Practice against the bots is the
 * Bots Arena's.)
 */
export default function DuelLauncher({ seriesId, rival, decks, setDate, onBack, onOpenChange }: {
    seriesId: string;
    rival: string;
    decks: SavedDeck[];
    /** The current set's release date: the rules the duel is played under. */
    setDate?: string;
    onBack: () => void;
    /** Tells the page whether a duel is waiting on this player (so it can open here first). */
    onOpenChange?: (waitingOnMe: boolean) => void;
}) {
    const router = useRouter();
    const legal = decks.filter((d) => d.mainDeck.length >= 40 && d.mainDeck.length <= 60);
    const [deckId, setDeckId] = useState("");
    // The deck saved or used last, once the decks are in.
    const offered = latestDeck(legal)?.id ?? "";
    useEffect(() => setDeckId((d) => (legal.some((x) => x.id === d) ? d : offered)), [offered]); // eslint-disable-line react-hooks/exhaustive-deps -- `legal` follows `decks`
    const [open, setOpen] = useState<DuelSummary[] | null>(null);
    const [busy, setBusy] = useState(false);
    const era = ruleEraFor(setDate);

    const load = useCallback(async () => {
        try {
            setOpen((await openDuels(seriesId)).filter((d) => d.kind === "rival"));
        } catch {
            setOpen([]);
        }
    }, [seriesId]);
    useEffect(() => {
        // The first load, then a slow poll for the rival.
        void load();
        const t = setInterval(load, 10_000);
        return () => clearInterval(t);
    }, [load]);

    const challenge = open?.[0];
    const mineWaiting = challenge?.status === "waiting" && challenge.challenger !== rival;
    const theirs = challenge?.status === "waiting" && challenge.challenger === rival;
    useEffect(() => onOpenChange?.(!!theirs), [theirs, onOpenChange]);

    const run = async (task: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        try {
            await task();
        } catch (error) {
            alertRepoError(error);
        } finally {
            setBusy(false);
            void load();
        }
    };
    const go = (d: DuelSummary) => router.push(duelPath(d.id));

    const deckPicker = legal.length ? (
        <label className="dl-deck">
            <span>Your deck</span>
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                {legal.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.mainDeck.length})</option>)}
            </select>
        </label>
    ) : (
        <p className="dl-note">Build a deck of 40 to 60 cards in the deck builder first.</p>
    );

    return (
        <div className="dl">
            <b className="rm-ask rm-carved">Duel {rival} <span className="dl-tag">Experimental</span></b>
            <p className="dl-rules">Played by {era.name}: {era.changes[0]?.toLowerCase()}.</p>
            {open === null && <p className="dl-note">Looking for open duels…</p>}

            {(challenge?.status === "active" || challenge?.status === "pregame") && <button type="button" className="dl-btn dl-btn--main" onClick={() => go(challenge)}>Back to your match with {rival}</button>}
            {theirs && (
                <div className="dl-card">
                    <p><b>{rival}</b> challenges you to a duel on {challenge.setName}!</p>
                    {deckPicker}
                    <div className="dl-row">
                        <button type="button" className="dl-btn dl-btn--main" disabled={!deckId || busy} onClick={() => run(async () => { markDeckUsed(deckId); go(await acceptDuel(challenge.id, deckId)); })}>Accept</button>
                        <button type="button" className="dl-btn dl-btn--quiet" disabled={busy} onClick={() => run(() => declineDuel(challenge.id))}>Decline</button>
                    </div>
                </div>
            )}
            {mineWaiting && (
                <div className="dl-card">
                    <p>Waiting for <b>{rival}</b> to accept your challenge…</p>
                    <button type="button" className="dl-btn dl-btn--quiet" disabled={busy} onClick={() => run(() => declineDuel(challenge.id))}>Withdraw it</button>
                </div>
            )}
            {open && !challenge && (
                <div className="dl-card">
                    {deckPicker}
                    <div className="dl-slabs">
                        <button type="button" className="dl-slab dl-slab--main" disabled={!deckId || busy} onClick={() => run(() => { markDeckUsed(deckId); return startDuel(seriesId, deckId, "rival"); })}>
                            <SwordsGlyph /><span>Challenge {rival}</span><small>Best of 3 · counts for the series</small>
                        </button>
                    </div>
                </div>
            )}
            <button type="button" className="rm-back" onClick={onBack}>Played it somewhere else? Record the result →</button>
        </div>
    );
}
