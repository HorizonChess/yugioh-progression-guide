"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ruleEraFor } from "@ygo/shared";
import type { SavedDeck } from "@/lib/storage";
import { acceptDuel, concedeDuel, declineDuel, duelPath, getDuel, lastGuestDuel, openDuels, startDuel, startGuestDuel, type DuelSummary, type PracticeOpponent } from "@/lib/duel-client";
import { alertRepoError } from "@/context/ProgressionContext";
import "./duel-launcher.css";

/**
 * Playing the duel here, on the server's rules engine: practice against the bot or solo, challenge
 * the rival (duo), answer the rival's challenge, or go back to a duel in progress. A guest only
 * practices: their decks live in this browser, so the deck itself goes to the server.
 */
export default function DuelLauncher({ seriesId, guest, setName, duo, rival, decks, setDate, onBack, onOpenChange }: {
    seriesId: string;
    /** Playing as a guest: practice only, with the deck sent along. */
    guest?: boolean;
    /** The current set: a guest's practice duel is played there. */
    setName?: string;
    duo: boolean;
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
    const [deckId, setDeckId] = useState(legal[0]?.id ?? "");
    const [open, setOpen] = useState<DuelSummary[] | null>(null);
    const [busy, setBusy] = useState(false);
    const era = ruleEraFor(setDate);

    const load = useCallback(async () => {
        try {
            if (guest) {
                // A guest's practice duel still going in this browser.
                const last = lastGuestDuel();
                const duel = last ? (await getDuel(last).catch(() => null))?.duel : null;
                setOpen(duel?.status === "active" ? [duel] : []);
            } else {
                setOpen(await openDuels(seriesId));
            }
        } catch {
            setOpen([]);
        }
    }, [seriesId, guest]);
    useEffect(() => {
        // The first load, then (signed in) a slow poll for the rival.
        void load();
        if (guest) return;
        const t = setInterval(load, 10_000);
        return () => clearInterval(t);
    }, [load, guest]);

    const challenge = open?.find((d) => d.kind === "rival");
    const practice = open?.find((d) => d.kind === "practice");
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
    const practise = (against: PracticeOpponent) => run(async () => {
        const deck = legal.find((d) => d.id === deckId);
        if (!deck) return;
        go(guest ? await startGuestDuel({ main: deck.mainDeck, extra: deck.extraDeck }, setName ?? "", against) : await startDuel(seriesId, deckId, against));
    });

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
            <b className="rm-ask rm-carved">Duel here <span className="dl-tag">Experimental</span></b>
            <p className="dl-note">Dueling in the app is still being built: expect rough edges, and record your duel below if something goes wrong.</p>
            <p className="dl-rules">Played by {era.name}: {era.changes[0]?.toLowerCase()}.</p>
            {open === null && <p className="dl-note">Looking for open duels…</p>}

            {challenge?.status === "active" && <button type="button" className="dl-btn dl-btn--main" onClick={() => go(challenge)}>Back to your duel with {rival}</button>}
            {practice && (
                <div className="dl-row">
                    <button type="button" className="dl-btn" onClick={() => go(practice)}>Back to your practice duel</button>
                    {/* A practice duel that went wrong (or that you're done with) shouldn't stand in the way of a new one. */}
                    <button type="button" className="dl-btn dl-btn--quiet" disabled={busy} onClick={() => run(() => concedeDuel(practice.id))}>End it, start a new one</button>
                </div>
            )}

            {theirs && (
                <div className="dl-card">
                    <p><b>{rival}</b> challenges you to a duel on {challenge.setName}!</p>
                    {deckPicker}
                    <div className="dl-row">
                        <button type="button" className="dl-btn dl-btn--main" disabled={!deckId || busy} onClick={() => run(async () => go(await acceptDuel(challenge.id, deckId)))}>Accept</button>
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
                    <div className="dl-row">
                        {duo && <button type="button" className="dl-btn dl-btn--main" disabled={!deckId || busy} onClick={() => run(() => startDuel(seriesId, deckId, "rival"))}>Challenge {rival}</button>}
                        {!practice && <button type="button" className="dl-btn" disabled={!deckId || busy} onClick={() => practise("bot")}>Practice against the bot</button>}
                        {!practice && <button type="button" className="dl-btn" disabled={!deckId || busy} onClick={() => practise("solo")}>Solo: test your deck</button>}
                    </div>
                    <p className="dl-note">
                        {duo ? "The rival duel counts for the series. Practice doesn't." : "Practice doesn't count: record your real duels below as before."}
                        {" "}In solo the opponent only passes its turns, so you can draw and play out your own.
                    </p>
                </div>
            )}
            <button type="button" className="rm-back" onClick={onBack}>← Record a duel played elsewhere</button>
        </div>
    );
}
