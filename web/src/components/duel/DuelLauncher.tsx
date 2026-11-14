"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BOT_LEVELS, duelistById, ruleEraFor, type BotLevel } from "@ygo/shared";
import type { SavedDeck } from "@/lib/storage";
import { acceptDuel, carryGuestToken, concedeDuel, declineDuel, duelPath, getDuel, lastGuestDuel, openDuels, startDuel, startGuestDuel, type BotChoice, type DuelSummary, type PracticeOpponent } from "@/lib/duel-client";
import { alertRepoError } from "@/context/ProgressionContext";
import { latestDeck, markDeckUsed } from "@/lib/deck-choice";
import { BotGlyph, HandGlyph, SwordsGlyph } from "./DuelGlyphs";
import OpponentPicker, { opponentName, type Opponent } from "./OpponentPicker";
import "./duel-launcher.css";

/**
 * Playing the duel here, on the server's rules engine: practice against the bot or solo, challenge
 * the rival (duo), answer the rival's challenge, or go back to a duel in progress. A guest only
 * practices: their decks live in this browser, so the deck itself goes to the server.
 */
const OPPONENT_KEY = "ygo-opponent";
/** Before duelists, only the bot's level was kept. */
const LEVEL_KEY = "ygo-bot-level";

/** The opponent last chosen in this browser (one still on the roster), or the practice bot. */
function savedOpponent(): Opponent {
    try {
        const o = JSON.parse(localStorage.getItem(OPPONENT_KEY) ?? "null") as Opponent | null;
        if (o?.kind === "duelist" && duelistById(o.id)?.eras.some((e) => e.id === o.era)) return o;
        if (o?.kind === "bot" && (BOT_LEVELS as readonly string[]).includes(o.level)) return o;
    } catch {
        // (Unreadable: start over.)
    }
    const level = localStorage.getItem(LEVEL_KEY);
    return { kind: "bot", level: level && (BOT_LEVELS as readonly string[]).includes(level) ? (level as BotLevel) : "normal" };
}

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
    const [deckId, setDeckId] = useState("");
    // The deck saved or used last, once the decks are in.
    const offered = latestDeck(legal)?.id ?? "";
    useEffect(() => setDeckId((d) => (legal.some((x) => x.id === d) ? d : offered)), [offered]); // eslint-disable-line react-hooks/exhaustive-deps -- `legal` follows `decks`
    const [open, setOpen] = useState<DuelSummary[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [opponent, setOpponent] = useState<Opponent>({ kind: "bot", level: "normal" });
    // Choosing who to practice against, and who was chosen last (in this browser).
    const [picking, setPicking] = useState(false);
    useEffect(() => setOpponent(savedOpponent()), []);
    const choose = (o: Opponent) => {
        setOpponent(o);
        localStorage.setItem(OPPONENT_KEY, JSON.stringify(o));
    };
    const era = ruleEraFor(setDate);

    const load = useCallback(async () => {
        try {
            if (guest) {
                // A guest's practice duel still going in this browser.
                const last = lastGuestDuel();
                let duel = last ? (await getDuel(last).catch(() => null))?.duel : null;
                // A match left between two games: its next game is the one that's open.
                while (duel?.status === "finished" && duel.next) {
                    carryGuestToken(duel.id, duel.next);
                    duel = (await getDuel(duel.next).catch(() => null))?.duel;
                }
                setOpen(duel?.status === "active" || duel?.status === "pregame" ? [duel] : []);
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
        markDeckUsed(deck.id);
        const bot: BotChoice = opponent.kind === "bot" ? { level: opponent.level } : { duelist: { id: opponent.id, era: opponent.era } };
        go(guest ? await startGuestDuel({ main: deck.mainDeck, extra: deck.extraDeck, side: deck.sideDeck ?? [] }, setName ?? "", against, bot) : await startDuel(seriesId, deckId, against, bot));
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

    // Practice is always there (one at a time), also while your challenge waits for the rival.
    const practiceSlabs = !practice && (
        <>
            <button type="button" className={`dl-slab ${duo ? "" : "dl-slab--main"}`} disabled={!deckId || busy} onClick={() => setPicking(true)} aria-label="Practice against the bot">
                <BotGlyph /><span>Duel the bot</span><small>Choose your opponent</small>
            </button>
            <button type="button" className="dl-slab" disabled={!deckId || busy} onClick={() => practise("solo")} aria-label="Solo: test your deck">
                <HandGlyph /><span>Solo</span><small>Test your deck</small>
            </button>
        </>
    );

    // Who to practice against, over the whole screen: the match starts from there.
    const picker = picking && !practice && open && (
        <OpponentPicker
            choice={opponent}
            onChoose={choose}
            onClose={() => setPicking(false)}
            disabled={busy}
            deckPicker={deckPicker}
            action={
                <div className="dl-row">
                    <button type="button" className="dl-btn dl-btn--main" disabled={!deckId || busy} onClick={() => practise("bot")}>Duel {opponentName(opponent)} · best of 3</button>
                    <button type="button" className="dl-btn dl-btn--quiet" disabled={busy} onClick={() => setPicking(false)}>Back</button>
                </div>
            }
        />
    );

    return (
        <div className="dl">
            <b className="rm-ask rm-carved">{duo ? `Duel ${rival}` : "Duel here"} <span className="dl-tag">Experimental</span></b>
            <p className="dl-rules">Played by {era.name}: {era.changes[0]?.toLowerCase()}.</p>
            {open === null && <p className="dl-note">Looking for open duels…</p>}

            {(challenge?.status === "active" || challenge?.status === "pregame") && <button type="button" className="dl-btn dl-btn--main" onClick={() => go(challenge)}>Back to your match with {rival}</button>}
            {practice && (
                <div className="dl-row">
                    <button type="button" className="dl-btn" onClick={() => go(practice)}>Back to your practice {practice.match ? "match" : "duel"}</button>
                    {/* A practice duel that went wrong (or that you're done with) shouldn't stand in the way of a new one. */}
                    <button type="button" className="dl-btn" disabled={busy} onClick={() => run(() => concedeDuel(practice.id, true))}>End it, start a new one</button>
                </div>
            )}

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
                    {/* No need to sit and wait: practice meanwhile. */}
                    {practiceSlabs && <>
                        <p className="dl-note">Meanwhile, you can practice:</p>
                        {deckPicker}
                        <div className="dl-slabs">{practiceSlabs}</div>
                    </>}
                </div>
            )}
            {picker}

            {open && !challenge && (
                <div className="dl-card">
                    {deckPicker}
                    {/* The ways to duel, as slabs of the board's stone: the one that counts is the wide one on top. */}
                    <div className="dl-slabs">
                        {duo && (
                            <button type="button" className="dl-slab dl-slab--main" disabled={!deckId || busy} onClick={() => run(() => { markDeckUsed(deckId); return startDuel(seriesId, deckId, "rival"); })}>
                                <SwordsGlyph /><span>Challenge {rival}</span><small>Best of 3 · counts for the series</small>
                            </button>
                        )}
                        {practiceSlabs}
                    </div>
                    <p className="dl-note">
                        {duo ? "The match against your rival counts for the series. Practice doesn't." : "Practice doesn't count for the series: a duel played for real is recorded below."}
                        {" "}In solo the opponent only passes its turns, so you can draw and play out your own.
                    </p>
                </div>
            )}
            <button type="button" className="rm-back" onClick={onBack}>Played it somewhere else? Record the result →</button>
        </div>
    );
}
