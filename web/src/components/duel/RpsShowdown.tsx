"use client";

import type { CSSProperties, ReactNode } from "react";
import type { RpsHand } from "@ygo/shared";
import { CARD_BACK } from "./parts";
import "./rps-showdown.css";

/*
 * Rock-paper-scissors as a showdown of cards: both hands come in face down, turn over together,
 * and the winning card strikes while the losing one breaks (a tie: both bounce back). Each hand is
 * a card in a Yu-Gi-Oh! frame: Rock a monster's orange, Paper a spell's green, Scissors a trap's purple.
 */

export const RPS_HANDS: { hand: RpsHand; glyph: string; label: string; beats: RpsHand }[] = [
    { hand: "rock", glyph: "✊", label: "Rock", beats: "scissors" },
    { hand: "paper", glyph: "✋", label: "Paper", beats: "rock" },
    { hand: "scissors", glyph: "✌", label: "Scissors", beats: "paper" },
];
const info = (h: RpsHand) => RPS_HANDS.find((x) => x.hand === h)!;
export const handLabel = (h: RpsHand) => info(h).label;

/** One hand as a card face. */
export function RpsCard({ hand, style }: { hand: RpsHand; style?: CSSProperties }) {
    const h = info(hand);
    return (
        <span className={`rps-face rps-face--${hand}`} style={style}>
            <b className="rps-face__name">{h.label}</b>
            <span className="rps-face__art" aria-hidden>{h.glyph}</span>
            <span className="rps-face__text">{h.label} beats {info(h.beats).label}.</span>
        </span>
    );
}

/** The two hands, turned over together. `children` shows under the result once it's in. */
export default function RpsShowdown({ mine, theirs, rival, children, compact }: {
    mine: RpsHand;
    theirs: RpsHand;
    rival: string;
    children?: ReactNode;
    /** Smaller cards (in the pregame panel). */
    compact?: boolean;
}) {
    const outcome = mine === theirs ? "tie" : info(mine).beats === theirs ? "win" : "lose";
    const said = outcome === "tie" ? `You both threw ${handLabel(mine)}. Again!` : outcome === "win" ? "You win!" : `${rival} wins!`;
    return (
        <div className={`rps rps--${outcome} ${compact ? "rps--compact" : ""}`} role="status" aria-label={`${rival} threw ${handLabel(theirs)}, you threw ${handLabel(mine)}. ${said}`}>
            <div className="rps__table">
                <Slot hand={theirs} who={rival} side="opp" outcome={outcome === "win" ? "lose" : outcome === "lose" ? "win" : "tie"} />
                <span className="rps__vs" aria-hidden>VS</span>
                <Slot hand={mine} who="You" side="me" outcome={outcome} />
            </div>
            <p className="rps__said">{said}</p>
            {children && <div className="rps__after">{children}</div>}
        </div>
    );
}

function Slot({ hand, who, side, outcome }: { hand: RpsHand; who: string; side: "me" | "opp"; outcome: "win" | "lose" | "tie" }) {
    return (
        <div className={`rps__slot rps__slot--${side} is-${outcome}`}>
            <span className="rps__who">{who}</span>
            <span className="rps__card">
                <span className="rps__flip">
                    <span className="rps__front"><RpsCard hand={hand} /></span>
                    <img className="rps__back" src={CARD_BACK} alt="" draggable={false} />
                </span>
                {outcome === "lose" && <span className="rps__crack" aria-hidden />}
            </span>
        </div>
    );
}
