"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ruleChangeAt, ruleEraFor } from "@ygo/shared";
import DuelScreen from "@/components/duel/DuelScreen";
import GuideSprite from "@/components/layout/GuideSprite";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import { fetchAllSets } from "@/lib/api";
import { acceptDuel, declineDuel, getDuel, type DuelSummary } from "@/lib/duel-client";
import { ruleLines } from "@/lib/guide/lines";
import { guide } from "@/lib/guide/store";
import "@/components/duel/duel-field.css";
import "@/components/duel/duel-launcher.css";

/**
 * A duel on the server's rules engine (route: /duel/?id=<duelId>). Before it starts, the
 * challenger waits and the rival picks a deck to accept with; then the board takes the screen.
 */
function DuelPageContent() {
    const id = useSearchParams().get("id");
    const router = useRouter();
    const { user } = useAuth();
    const { refresh, series, savedDecks, matchHistory, loadSeries, activeSeriesId } = useProgression();
    const [duel, setDuel] = useState<DuelSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deckId, setDeckId] = useState("");

    useEffect(() => {
        if (!id || !user) return;
        let live = true;
        const load = () => getDuel(id).then(({ duel: d }) => live && setDuel(d)).catch((e: Error) => live && setError(e.message));
        void load();
        // While waiting for the rival, look again now and then.
        const t = setInterval(() => duel?.status === "waiting" && void load(), 5000);
        return () => {
            live = false;
            clearInterval(t);
        };
    }, [id, user, duel?.status]);

    // The duel belongs to a series: make it the active one, so decks and the result land there.
    useEffect(() => {
        if (duel && activeSeriesId !== duel.seriesId) void loadSeries(duel.seriesId);
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

    if (!user) return <Message text="Sign in to duel." />;
    if (error) return <Message text={error} onBack={() => router.push("/record-match")} />;
    if (!id || !duel) return <Message text="Shuffling the decks…" />;

    if (duel.status === "waiting") {
        const mine = duel.challengerId === user.id;
        const legal = savedDecks.filter((d) => d.mainDeck.length >= 40 && d.mainDeck.length <= 60);
        const chosen = deckId || legal[0]?.id || "";
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
                            {!mine && <button type="button" className="dl-btn dl-btn--main" disabled={!chosen} onClick={() => acceptDuel(duel.id, chosen).then(setDuel, (e: Error) => setError(e.message))}>Accept</button>}
                            <button type="button" className="dl-btn dl-btn--quiet" onClick={() => declineDuel(duel.id).finally(() => router.push("/record-match"))}>{mine ? "Withdraw" : "Decline"}</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (duel.status === "declined") return <Message text="That challenge was turned down." onBack={() => router.push("/record-match")} />;

    return (
        <>
            <DuelScreen
                duelId={duel.id}
                onLeave={async () => {
                    await refresh(duel.seriesId);
                    router.push(duel.kind === "practice" ? "/record-match" : "/rewards");
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
