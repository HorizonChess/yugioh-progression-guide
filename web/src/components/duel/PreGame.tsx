"use client";

import { useEffect, useMemo, useState } from "react";
import type { DuelPregameView, MatchDeck, PregameAction, RpsHand } from "@ygo/shared";
import { fetchCardsByIds, type Card } from "@/lib/api";
import { cardImage } from "./parts";
import "./duel-launcher.css";

/*
 * Before a game of a match (best of 3). Game 1: rock-paper-scissors, and its winner chooses who
 * goes first. Games 2 and 3: both players may swap cards with their side deck, and the loser of
 * the last game chooses who goes first. The server keeps what each player has done; this shows it
 * and sends the next step.
 */

const HANDS: { hand: RpsHand; glyph: string; label: string }[] = [
    { hand: "rock", glyph: "✊", label: "Rock" },
    { hand: "paper", glyph: "✋", label: "Paper" },
    { hand: "scissors", glyph: "✌", label: "Scissors" },
];
const handName = (h: RpsHand) => HANDS.find((x) => x.hand === h)!.label;
const glyphOf = (h: RpsHand) => HANDS.find((x) => x.hand === h)!.glyph;

export default function PreGame({ view, busy, onAct, onGiveUp }: {
    view: DuelPregameView;
    /** A step is on its way to the server. */
    busy: boolean;
    onAct: (action: PregameAction) => void;
    onGiveUp: () => void;
}) {
    const rival = view.rival.name;
    const { chooser, rps, siding } = view;
    return (
        <div className="df-arena">
            <div className="df-waiting dl pg">
                <b className="rm-ask">Game {view.game} of 3</b>
                <div className="pg-score" aria-label={`You ${view.score[0]}, ${rival} ${view.score[1]}`}>
                    <span>You</span><b>{view.score[0]}</b><i>–</i><b>{view.score[1]}</b><span>{rival}</span>
                </div>

                {rps && (
                    <div className="dl-card">
                        <p>Rock, paper, scissors: the winner chooses who goes first.</p>
                        {rps.tied && !rps.mine && <p className="dl-note">You both threw {handName(rps.tied)}. Again!</p>}
                        {rps.mine ? <p className="pg-wait"><span className="pg-hand">{glyphOf(rps.mine)}</span> You threw {handName(rps.mine)}. Waiting for {rival}…</p> : (
                            <div className="pg-hands">
                                {HANDS.map((h) => (
                                    <button key={h.hand} type="button" className="dl-slab" disabled={busy} onClick={() => onAct({ rps: h.hand })} aria-label={h.label}>
                                        <span className="pg-hand" aria-hidden>{h.glyph}</span><span>{h.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {chooser && (
                    <div className="dl-card">
                        {chooser.hands && <p className="pg-duel"><span><i className="pg-hand">{glyphOf(chooser.hands.mine)}</i>You</span><b>{chooser.side === "me" ? "beats" : "loses to"}</b><span><i className="pg-hand">{glyphOf(chooser.hands.theirs)}</i>{rival}</span></p>}
                        <p>
                            {chooser.why === "rps" ? (chooser.side === "me" ? "You won, so you choose who goes first." : `${rival} won, and chooses who goes first.`)
                                : chooser.why === "lost" ? (chooser.side === "me" ? "You lost the last game, so you choose who goes first." : `${rival} lost the last game, and chooses who goes first.`)
                                : chooser.side === "me" ? "The last game was a draw. The coin says you choose who goes first." : `The last game was a draw. The coin says ${rival} chooses who goes first.`}
                        </p>
                        {chooser.chosen ? <p className="dl-note">Chosen. The game starts once both decks are in.</p>
                            : chooser.side === "me" ? (
                                <div className="dl-row">
                                    <button type="button" className="dl-btn dl-btn--main" disabled={busy} onClick={() => onAct({ first: true })}>Go first</button>
                                    <button type="button" className="dl-btn" disabled={busy} onClick={() => onAct({ first: false })}>Go second</button>
                                </div>
                            ) : <p className="pg-wait">Waiting for {rival} to choose…</p>}
                    </div>
                )}

                {siding && (siding.done
                    ? <div className="dl-card"><p>Your deck is in.{siding.rivalDone ? "" : ` Waiting for ${rival}'s…`}</p></div>
                    : <SideDecking key={view.game} deck={siding.deck} rival={rival} rivalDone={siding.rivalDone} busy={busy} onDone={(deck) => onAct({ deck })} />)}

                <button type="button" className="rm-back" onClick={onGiveUp}>Give the match up</button>
            </div>
        </div>
    );
}

/** The deck between games: tap a card to move it between the main deck (or Extra Deck) and the side deck. */
function SideDecking({ deck, rival, rivalDone, busy, onDone }: { deck: MatchDeck; rival: string; rivalDone: boolean; busy: boolean; onDone: (deck: MatchDeck) => void }) {
    const [now, setNow] = useState<MatchDeck>(deck);
    const [cards, setCards] = useState<Map<number, Card>>(new Map());
    const all = useMemo(() => [...new Set([...deck.main, ...deck.extra, ...deck.side])], [deck]);
    useEffect(() => {
        fetchCardsByIds(all).then((list) => setCards(new Map(list.map((c) => [c.id, c]))));
    }, [all]);
    const isExtra = (id: number) => /Fusion|Synchro|XYZ|Link/i.test(cards.get(id)?.type ?? "");
    const without = (list: number[], at: number) => list.filter((_, i) => i !== at);
    const toSide = (from: "main" | "extra", at: number) => setNow((d) => ({ ...d, [from]: without(d[from], at), side: [...d.side, d[from][at]!] }));
    const fromSide = (at: number) => setNow((d) => {
        const id = d.side[at]!, to = isExtra(id) ? "extra" : "main";
        return { ...d, side: without(d.side, at), [to]: [...d[to], id] };
    });
    // Every part must end the size it started: one in, one out.
    const off = (["main", "extra", "side"] as const).filter((k) => now[k].length !== deck[k].length);
    const changed = (["main", "extra", "side"] as const).some((k) => [...now[k]].sort().join() !== [...deck[k]].sort().join());
    const row = (k: "main" | "extra" | "side", label: string, onTap: (i: number) => void) => (
        <div className="pg-part">
            <b className={now[k].length !== deck[k].length ? "is-off" : ""}>{label} <span>{now[k].length}/{deck[k].length}</span></b>
            <div className="pg-cards">
                {now[k].map((id, i) => (
                    <button key={`${id}:${i}`} type="button" className="pg-card" title={cards.get(id)?.name} aria-label={`${cards.get(id)?.name ?? "Card"} in the ${label}`} onClick={() => onTap(i)}>
                        <img src={cardImage(id)} alt="" />
                    </button>
                ))}
                {!now[k].length && <span className="dl-note">Empty</span>}
            </div>
        </div>
    );
    return (
        <div className="dl-card pg-siding">
            <p>Side decking{deck.side.length ? ": tap a card to move it between your deck and your side deck." : ": this deck has no side deck, so there's nothing to swap."}</p>
            {row("main", "Main Deck", (i) => toSide("main", i))}
            {deck.extra.length + deck.side.filter(isExtra).length > 0 && row("extra", "Extra Deck", (i) => toSide("extra", i))}
            {deck.side.length > 0 && row("side", "Side Deck", fromSide)}
            {off.length > 0 && <p className="dl-note">Each part keeps its size: for every card that goes in, one comes out.</p>}
            <div className="dl-row">
                <button type="button" className="dl-btn dl-btn--main" disabled={busy || off.length > 0} onClick={() => onDone(now)}>{changed ? "Play with these changes" : "Keep the deck as it is"}</button>
                {changed && <button type="button" className="dl-btn dl-btn--quiet" onClick={() => setNow(deck)}>Undo the changes</button>}
            </div>
            <p className="dl-note">{rivalDone ? `${rival}'s deck is in.` : `${rival} is side decking too.`}</p>
        </div>
    );
}
