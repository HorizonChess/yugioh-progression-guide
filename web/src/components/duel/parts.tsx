"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { DuelCardView, Side } from "@ygo/shared";
import type { Float } from "./useDuel";

const IMG = process.env.NEXT_PUBLIC_IMAGE_HOST ?? "";
export const cardImage = (code: number) => `${IMG}/cards/${code}_md.jpg`;
export const CARD_BACK = `${IMG}/cards/back_high.jpg`;

export interface CardMarks {
    /** Cards the question is about (or that have actions): they glow. */
    glow: ReadonlySet<string>;
    /** Cards chosen so far in a pick. */
    picked: ReadonlySet<string>;
    destroying: readonly string[];
    floats: readonly Float[];
    /** Zones a `place` question offers (by zoneKey), and what a tap on one does. */
    zones: ReadonlySet<string>;
    chosenZones: ReadonlySet<string>;
    onZone: (key: string) => void;
}

/** A card on the field: flies between zones by its uid, turns sideways in Defense Position, shows its ATK or DEF. */
export function FieldCard({ card, marks, onTap, onHover, side }: {
    card: DuelCardView;
    marks: CardMarks;
    onTap: (card: DuelCardView) => void;
    onHover?: (code: number) => void;
    side: Side;
}) {
    const up = card.faceUp && card.code > 0;
    const stat = card.atk !== undefined ? (card.defense ? { value: card.def!, base: card.baseDef! } : { value: card.atk!, base: card.baseAtk! }) : null;
    const tone = stat ? (stat.value > stat.base ? "up" : stat.value < stat.base ? "down" : "") : "";
    const cls = ["df-card", marks.glow.has(card.uid) ? "is-glow" : "", marks.picked.has(card.uid) ? "is-picked" : "", marks.destroying.includes(card.uid) ? "is-breaking" : ""].join(" ");
    return (
        <motion.button
            layoutId={card.uid}
            type="button"
            data-uid={card.uid}
            className={cls}
            onClick={() => onTap(card)}
            onPointerEnter={(e) => e.pointerType === "mouse" && card.code > 0 && onHover?.(card.code)}
            aria-label={card.code ? `${up ? "" : "Set: "}card ${card.code}` : side === "opp" ? "Set card" : "Card"}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
            <span className="df-card__lunge">
                <span className={`df-card__turn ${card.defense ? "is-def" : ""}`}>
                    <img src={up ? cardImage(card.code) : CARD_BACK} alt="" draggable={false} />
                    {!up && card.code > 0 && <i className="df-card__peek">Set</i>}
                </span>
                {stat && (
                    <span className={`df-stat ${card.defense ? "is-def" : ""}`}>
                        <b className={tone ? `is-${tone}` : ""}>{stat.value}</b>
                    </span>
                )}
            </span>
            {marks.floats.filter((f) => f.uid === card.uid).map((f) => <span key={f.key} className={`df-float df-float--${f.tone}`}>{f.text}</span>)}
        </motion.button>
    );
}

/** An empty zone or one holding a card. */
export function Zone({ card, label, marks, onTap, onHover, side, className = "", zone }: {
    card: DuelCardView | null;
    label?: string;
    marks: CardMarks;
    onTap: (card: DuelCardView) => void;
    onHover?: (code: number) => void;
    side: Side;
    className?: string;
    /** This zone's key, so a `place` question can offer it. */
    zone?: string;
}) {
    const offered = zone !== undefined && marks.zones.has(zone);
    const chosen = zone !== undefined && marks.chosenZones.has(zone);
    return (
        <div className={`df-zone ${label ? "df-zone--labelled" : ""} ${offered ? "is-offered" : ""} ${chosen ? "is-chosen" : ""} ${className}`} data-label={label} data-zone={zone}>
            {card && <FieldCard card={card} marks={marks} onTap={onTap} onHover={onHover} side={side} />}
            {offered && <button type="button" className="df-zone__pick" aria-label="Put the card here" onClick={() => marks.onZone(zone!)} />}
        </div>
    );
}

/** Deck, Extra Deck, Graveyard or banished cards: the top card (or a back) and how many. */
export function Pile({ label, count, top, back, onTap, onHover, small }: {
    label: string;
    count: number;
    top?: DuelCardView;
    back?: boolean;
    onTap?: () => void;
    onHover?: (code: number) => void;
    small?: boolean;
}) {
    return (
        <button
            type="button"
            className={`df-pile ${small ? "df-pile--small" : ""}`}
            data-label={label}
            onClick={onTap}
            disabled={!onTap || !count}
            onPointerEnter={(e) => e.pointerType === "mouse" && top?.code && onHover?.(top.code)}
            aria-label={`${label}: ${count}`}
        >
            {back && count > 0 && <img className="df-pile__back" src={CARD_BACK} alt="" />}
            {top && (
                <motion.span layoutId={top.uid} className="df-pile__top" data-uid={top.uid} transition={{ type: "spring", stiffness: 320, damping: 32 }}>
                    <img src={top.code ? cardImage(top.code) : CARD_BACK} alt="" />
                </motion.span>
            )}
            <span className="df-pile__label">{label}</span>
            {count > 0 && <span className="df-pile__count">{count}</span>}
        </button>
    );
}

/** Life points that count to their new value, with the damage floating off them. */
export function LifePoints({ value, side, name, floats, active }: { value: number; side: Side; name: string; floats: readonly Float[]; active: boolean }) {
    const [shown, setShown] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        const start = performance.now(), a = from.current;
        let raf = 0;
        const tick = (t: number) => {
            const k = Math.min(1, (t - start) / 700);
            setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)));
            if (k < 1) raf = requestAnimationFrame(tick);
            else from.current = value;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return (
        <div className={`df-lp df-lp--${side} ${active ? "is-turn" : ""}`}>
            <span className="df-lp__name">{name}</span>
            <span className="df-lp__value">
                <small>LP</small>
                <b className={shown !== value ? "is-ticking" : ""}>{shown}</b>
                {floats.filter((f) => f.side === side && !f.uid).map((f) => <span key={f.key} className={`df-float df-float--${f.tone}`}>{f.text}</span>)}
            </span>
        </div>
    );
}

/** The rival's hand: card backs, as many as they hold. */
export function RivalHand({ cards }: { cards: DuelCardView[] }) {
    return (
        <div className="df-rival-hand" aria-label={`Your rival holds ${cards.length} cards`}>
            {cards.map((c) => (
                <motion.img key={c.uid} layoutId={c.uid} src={CARD_BACK} alt="" className="df-rival-hand__card" />
            ))}
        </div>
    );
}

/** Your hand, fanned. */
export function Hand({ cards, marks, onTap, onHover }: { cards: DuelCardView[]; marks: CardMarks; onTap: (c: DuelCardView) => void; onHover?: (code: number) => void }) {
    const mid = (cards.length - 1) / 2;
    const tight = cards.length > 4;
    return (
        <div className="df-hand">
            {cards.map((c, i) => (
                <motion.button
                    key={c.uid}
                    layoutId={c.uid}
                    type="button"
                    data-uid={c.uid}
                    className={`df-hand__card ${marks.glow.has(c.uid) ? "is-glow" : ""} ${marks.picked.has(c.uid) ? "is-picked" : ""}`}
                    style={{ rotate: (i - mid) * (tight ? 3 : 4), y: Math.abs(i - mid) * 4, marginInline: tight ? "calc(var(--cw) * -0.32)" : "3px" }}
                    onClick={() => onTap(c)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && onHover?.(c.code)}
                    aria-label={`Card in hand ${c.code}`}
                >
                    <img src={c.code ? cardImage(c.code) : CARD_BACK} alt="" draggable={false} />
                </motion.button>
            ))}
        </div>
    );
}
