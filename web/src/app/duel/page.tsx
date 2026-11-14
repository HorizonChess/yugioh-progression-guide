"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ruleChangeAt, ruleEraFor } from "@ygo/shared";
import DuelScreen from "@/components/duel/DuelScreen";
import GuideSprite from "@/components/layout/GuideSprite";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets } from "@/lib/api";
import { acceptDuel, carryGuestToken, concedeDuel, declineDuel, duelPath, getDuel, getDuelRecord, guestDuelToken, pregameAct, type DuelSummary } from "@/lib/duel-client";
import type { DuelPregameView, PregameAction } from "@ygo/shared";
import type { LocalGame } from "@/components/duel/useDuel";
import PreGame from "@/components/duel/PreGame";
import { gameConfirm } from "@/components/ui/GameDialog";
import { latestDeck, markDeckUsed } from "@/lib/deck-choice";
import { ruleLines } from "@/lib/guide/lines";
import { guide } from "@/lib/guide/store";
import "@/components/duel/duel-field.css";
import "@/components/duel/duel-launcher.css";

/**
 * A duel on the server's rules engine (route: /duel/?id=<duelId>). Before it starts, the
 * challenger waits and the rival picks a deck to accept with; then the board takes the screen.
 */
const noSubscribe = () => () => {};

function DuelPageContent() {
    const id = useSearchParams().get("id");
    const router = useRouter();
    const { user } = useAuth();
    const { refresh, series, savedDecks, matchHistory, loadSeries, activeSeriesId } = useProgression();
    const [duel, setDuel] = useState<DuelSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** The server couldn't rebuild this duel: why, to show and report. */
    const [broken, setBroken] = useState<string | null>(null);
    const [deckId, setDeckId] = useState("");
    /** Before a game of a match: what's still to be done, and whether a step of mine is on its way. */
    const [pregame, setPregame] = useState<DuelPregameView | null>(null);
    const [acting, setActing] = useState(false);
    /** Once the game is on: whether it's played on this device (a practice game against the bot), and how. */
    const [local, setLocal] = useState<{ id: string; game?: LocalGame } | undefined>(undefined);
    // A guest's practice duel opens with the token this browser kept. The server can't see it, so
    // the page renders as loading until the browser has looked (no mismatch, no "Sign in" flash).
    const hasToken = useSyncExternalStore(noSubscribe, () => !!id && !!guestDuelToken(id), () => null);
    const allowed = !!user || !!hasToken;

    useEffect(() => {
        if (!id || !allowed) return;
        let live = true;
        const load = () => getDuel(id).then(({ duel: d, broken: b, pregame: p, device, match }) => {
            if (!live) return;
            // (Once: from there on the game is played on the device, or over the live socket.)
            if (d.status === "active" || d.status === "finished") setLocal((had) => (had?.id === id ? had : { id, ...(device ? { game: { device, ...(match ? { match } : {}) } } : {}) }));
            setDuel(d);
            setBroken(b ?? null);
            setPregame(p ?? null);
        }).catch((e: Error) => live && setError(e.message));
        void load();
        // While waiting for the rival (their answer to the challenge, their hand, their deck), look again now and then.
        const t = setInterval(() => (duel?.status === "waiting" || duel?.status === "pregame") && void load(), duel?.status === "pregame" ? 1500 : 5000);
        return () => {
            live = false;
            clearInterval(t);
        };
    }, [id, allowed, duel?.status]);

    // The duel belongs to a series: make it the active one, so decks and the result land there.
    useEffect(() => {
        if (duel?.seriesId && activeSeriesId !== duel.seriesId) void loadSeries(duel.seriesId);
    }, [duel, activeSeriesId, loadSeries]);

    // Yugi on the rules: when this set changed them, or on the very first duel of the series.
    const active = duel?.status === "active";
    useEffect(() => {
        if (!active || !duel) return;
        let live = true;
        fetchAllSets().then((sets) => {
            if (!live) return;
            const i = sets.findIndex((s) => s.set_name === duel.setName);
            const change = i >= 0 ? ruleChangeAt(sets[i]!.tcg_date, sets[i - 1]?.tcg_date) : null;
            const era = change ?? (matchHistory.length === 0 ? ruleEraFor(sets[i]?.tcg_date) : null);
            if (era) setTimeout(() => guide.sayAll(ruleLines(era)), 1500);
        });
        return () => {
            live = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per duel
    }, [active, duel?.id]);

    // Where leaving goes: practice back to the Bots Arena, a duel with the rival to Play / Record.
    const home = duel?.kind === "rival" ? "/record-match" : "/bots-arena";
    if (hasToken === null && !user) return <Message text="Shuffling the decks…" />;
    if (!allowed) return <Message text="Sign in to duel." onBack={() => router.push(home)} />;
    if (error) return <Message text={error} onBack={() => router.push(home)} />;
    // (Also between a match's games: the next game's page, while its duel loads.)
    if (!id || !duel || duel.id !== id) return <Message text="Shuffling the decks…" />;
    if (broken && duel.status === "active") {
        const rival = duel.kind === "rival";
        const end = () => void concedeDuel(id).then(() => router.push(home)).catch((e: Error) => setError(e.message));
        // The duel as stored, saved as a file: sent with a bug report, it replays the duel exactly.
        const save = () => void getDuelRecord(id).then((record) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(record)], { type: "application/json" }));
            a.download = `duel-${id}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }).catch((e: Error) => setError(e.message));
        return (
            <div className="df-arena">
                <div className="df-loading">
                    <div className="dl">
                        <p>This duel hit a server error and can&rsquo;t be picked up again. Sorry!</p>
                        <p><small>{broken}</small></p>
                        <button type="button" className="dl-btn" onClick={save}>Download the duel record</button>
                        <button type="button" className="dl-btn" onClick={end}>{rival ? "End it (it counts as a loss)" : "End this duel"}</button>
                        <button type="button" className="dl-btn" onClick={() => router.push(home)}>Back</button>
                    </div>
                </div>
            </div>
        );
    }

    if (duel.status === "waiting" && user) {
        const mine = duel.challengerId === user.id;
        const legal = savedDecks.filter((d) => d.mainDeck.length >= 40 && d.mainDeck.length <= 60);
        const chosen = deckId || latestDeck(legal)?.id || "";
        return (
            <div className="df-arena">
                <div className="df-waiting dl">
                    <b className="rm-ask">{mine ? "Challenge sent" : `${duel.challenger} challenges you!`}</b>
                    <div className="dl-card">
                        <p>{mine ? "Waiting for your rival to accept…" : `A duel on ${duel.setName}. Pick your deck:`}</p>
                        {!mine && (legal.length ? (
                            <label className="dl-deck"><span>Your deck</span>
                                <select value={chosen} onChange={(e) => setDeckId(e.target.value)}>{legal.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.mainDeck.length})</option>)}</select>
                            </label>
                        ) : <p className="dl-note">Build a deck of 40 to 60 cards first.</p>)}
                        <div className="dl-row">
                            {!mine && <button type="button" className="dl-btn dl-btn--main" disabled={!chosen} onClick={() => { markDeckUsed(chosen); acceptDuel(duel.id, chosen).then(setDuel, (e: Error) => setError(e.message)); }}>Accept</button>}
                            <button type="button" className="dl-btn dl-btn--quiet" onClick={() => declineDuel(duel.id).finally(() => router.push("/record-match"))}>{mine ? "Withdraw" : "Decline"}</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (duel.status === "pregame" && pregame) {
        const act = (action: PregameAction) => {
            setActing(true);
            pregameAct(id, action).then(({ duel: d, pregame: p }) => {
                setDuel(d);
                setPregame(p ?? null);
            }).catch((e: Error) => setError(e.message)).finally(() => setActing(false));
        };
        const giveUp = async () => {
            const rival = duel.kind === "rival";
            if (!(await gameConfirm(rival ? <>Give the match up? It counts as a loss for the series.</> : <>End this practice match?</>, { title: "Give up?", confirmLabel: "Give up", cancelLabel: "Keep playing" }))) return;
            await concedeDuel(id).catch((e: Error) => setError(e.message));
            if (duel.seriesId) await refresh(duel.seriesId);
            router.push(rival ? "/rewards" : home);
        };
        return <PreGame duelId={id} view={pregame} busy={acting} onAct={act} onGiveUp={() => void giveUp()} />;
    }
    if (duel.status === "pregame") return <Message text="Shuffling the decks…" />;
    if (duel.status === "cancelled") return <Message text="That duel was called off. Nothing was recorded, and a new challenge can be sent." onBack={() => router.push(home)} />;
    if (duel.status === "declined") return <Message text="That challenge was turned down." onBack={() => router.push(home)} />;
    if (local?.id !== duel.id) return <Message text="Shuffling the decks…" />;

    return (
        <>
            <DuelScreen
                key={duel.id}
                duelId={duel.id}
                local={local.game}
                // The match's next game: its page, which opens on side decking.
                onNext={(next) => {
                    carryGuestToken(duel.id, next);
                    router.push(duelPath(next));
                }}
                onLeave={async (outcome) => {
                    if (duel.seriesId) await refresh(duel.seriesId);
                    // A duel called off has no reward to go to.
                    router.push(duel.kind === "practice" || outcome === null ? home : "/rewards");
                }}
            />
            {series && <GuideSprite />}
        </>
    );
}

function Message({ text, onBack }: { text: string; onBack?: () => void }) {
    return (
        <div className="df-arena">
            <div className="df-loading">
                <div className="dl">
                    <p>{text}</p>
                    {onBack && <button type="button" className="dl-btn" onClick={onBack}>Back</button>}
                </div>
            </div>
        </div>
    );
}

export default function DuelPage() {
    return (
        <Suspense fallback={<Message text="Shuffling the decks…" />}>
            <DuelPageContent />
        </Suspense>
    );
}
