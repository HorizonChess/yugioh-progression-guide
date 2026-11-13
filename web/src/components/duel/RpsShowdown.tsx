"use client";

import type { ReactNode } from "react";
import type { RpsHand } from "@ygo/shared";
import { CARD_BACK } from "./parts";
import "./rps-showdown.css";

/*
 * Rock-paper-scissors as a showdown of cards: both hands come in face down, turn over together,
 * and the winning card strikes while the losing one breaks (a tie: both bounce back). Each hand is
 * a card (art on R2, from scripts/images/rps-art.mjs): Rock in a monster's orange, Paper in a
 * spell's teal, Scissors in a trap's magenta.
 */

export const RPS_HANDS: { hand: RpsHand; label: string; beats: RpsHand }[] = [
    { hand: "rock", label: "Rock", beats: "scissors" },
    { hand: "paper", label: "Paper", beats: "rock" },
    { hand: "scissors", label: "Scissors", beats: "paper" },
];
const info = (h: RpsHand) => RPS_HANDS.find((x) => x.hand === h)!;
export const handLabel = (h: RpsHand) => info(h).label;

const IMG = process.env.NEXT_PUBLIC_IMAGE_HOST ?? "";

/** One hand as a card face. */
export function RpsCard({ hand }: { hand: RpsHand }) {
    const h = info(hand);
    return <img className="rps-face" src={`${IMG}/rps/${hand}.webp`} alt={`${h.label}: ${h.label} beats ${info(h.beats).label}.`} draggable={false} />;
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
