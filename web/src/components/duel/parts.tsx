"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import type { DuelCardView, Side } from "@ygo/shared";
import type { Float } from "./useDuel";

const IMG = process.env.NEXT_PUBLIC_IMAGE_HOST ?? "";
export const cardImage = (code: number) => `${IMG}/cards/${code}_md.jpg`;
export const CARD_BACK = `${IMG}/cards/back_high.jpg`;

export type Pose = "up" | "side";

export interface CardMarks {
    /** Cards the question is about (or that have actions): they glow. */
    glow: ReadonlySet<string>;
    /** Cards chosen so far in a pick. */
    picked: ReadonlySet<string>;
    destroying: readonly string[];
    landing: readonly { uid: string; heavy: boolean }[];
    flaring: readonly string[];
    /** The side whose life points were just hit. */
    hit: Side | null;
    floats: readonly Float[];
    /**
     * Zones a `place` question offers (by zoneKey), and what a tap on one does. Each says which of the
     * zone's frames lights up: `up` the upright card frame, `side` the sideways (Defense Position) one.
     */
    zones: ReadonlyMap<string, Pose>;
    chosenZones: ReadonlySet<string>;
    onZone: (key: string) => void;
    /** Where the card you're holding up could go: these zones show it, faintly, before you choose. */
    preview: ReadonlyMap<string, Pose>;
    /** The card you've picked up (its actions are on offer): it rises. */
    raised: string | null;
}

/**
 * How a card travels between places: it sets off slowly, then commits and arrives with a
 * decisive stop (the landing effect gives it its weight), instead of drifting on a soft spring.
 */
export const FLIGHT = { type: "tween", duration: 0.46, ease: [0.55, 0, 0.2, 1] } as const;

/** The pieces a destroyed card breaks into: where each flies, and how it turns. */
const SHARDS = Array.from({ length: 9 }, (_, i) => {
    const angle = (i / 9) * Math.PI * 2 + 0.4;
    const reach = 34 + (i % 3) * 14;
    return {
        "--dx": `${Math.cos(angle) * reach}px`, "--dy": `${Math.sin(angle) * reach + 18}px`, "--rot": `${(i % 2 ? 1 : -1) * (90 + i * 37)}deg`,
        "--clip": `polygon(50% 50%, ${50 + 70 * Math.cos(angle - 0.4)}% ${50 + 70 * Math.sin(angle - 0.4)}%, ${50 + 70 * Math.cos(angle + 0.35)}% ${50 + 70 * Math.sin(angle + 0.35)}%)`,
    } as CSSProperties;
});

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
    const landing = marks.landing.find((l) => l.uid === card.uid);
    const breaking = marks.destroying.includes(card.uid);
    // Turning over: a card that changes face flips (face-up: a Flip Summon, a Set card activated;
    // face-down: turned back over). One you Set from your hand was face-up there, so it spins over
    // on its way down.
    const [seenUp, setSeenUp] = useState(up);
    const [flip, setFlip] = useState<"up" | "down" | null>(null);
    if (seenUp !== up) {
        setSeenUp(up);
        setFlip(up ? "up" : "down");
    }
    const turning = flip ?? (landing && !up && side === "me" && card.code > 0 ? "set" : null);
    const cls = [
        "df-card", marks.glow.has(card.uid) ? "is-glow" : "", marks.raised === card.uid ? "is-raised" : "", marks.picked.has(card.uid) ? "is-picked" : "", breaking ? "is-breaking" : "",
        landing ? (landing.heavy ? "is-landing is-heavy" : "is-landing") : "", marks.flaring.includes(card.uid) ? "is-flaring" : "",
    ].join(" ");
    return (
        <motion.button
            layoutId={card.uid}
            type="button"
            data-uid={card.uid}
            className={cls}
            onClick={() => onTap(card)}
            onPointerEnter={(e) => e.pointerType === "mouse" && card.code > 0 && onHover?.(card.code)}
            aria-label={card.code ? `${up ? "" : "Set: "}card ${card.code}` : side === "opp" ? "Set card" : "Card"}
            transition={FLIGHT}
        >
            <span className="df-card__lunge">
                <span className={`df-card__turn ${card.defense ? "is-def" : ""}`}>
                    {turning ? (
                        <span className={`df-flip df-flip--${turning}`} onAnimationEnd={(e) => e.target === e.currentTarget && setFlip(null)}>
                            <img className="df-flip__front" src={card.code ? cardImage(card.code) : CARD_BACK} alt="" draggable={false} />
                            <img className="df-flip__back" src={CARD_BACK} alt="" draggable={false} />
                        </span>
                    ) : (
                        <Face key={up ? card.code : 0} card={card} up={up} />
                    )}
                    {!up && card.code > 0 && <i className="df-card__peek">Set</i>}
                </span>
                {stat && (
                    <span className={`df-stat ${card.defense ? "is-def" : ""} ${tone ? `is-${tone}` : ""}`} title={tone ? `${card.defense ? "DEF" : "ATK"} ${stat.base} → ${stat.value}` : undefined}>
                        {tone && <i aria-hidden>{tone === "up" ? "▲" : "▼"}</i>}
                        <b>{stat.value}</b>
                    </span>
                )}
                {/* What acts on it: the Equip Spell or continuous card's art, negation, counters. */}
                {up && (card.by?.length || card.negated || card.counters) ? (
                    <span className={`df-affect ${card.defense ? "is-def" : ""}`} aria-label={affectLabel(card)}>
                        {card.by?.slice(0, 2).map((b) => <img key={b.uid} src={cardImage(b.code)} alt="" draggable={false} />)}
                        {(card.by?.length ?? 0) > 2 && <b>+{card.by!.length - 2}</b>}
                        {card.negated && <i className="df-affect__neg">⊘</i>}
                        {card.counters ? <i className="df-affect__count">{card.counters}</i> : null}
                    </span>
                ) : null}
            </span>
            {breaking && (
                <span className={`df-shards ${card.defense ? "is-def" : ""}`} aria-hidden style={{ "--img": `url(${up ? cardImage(card.code) : CARD_BACK})` } as CSSProperties}>
                    {SHARDS.map((s, i) => <i key={i} style={s} />)}
                </span>
            )}
            {landing && <span className="df-dust" aria-hidden />}
            {landing && <span className={`df-holo ${card.defense ? "is-def" : ""}`} aria-hidden />}
            {marks.floats.filter((f) => f.uid === card.uid).map((f) => <span key={f.key} className={`df-float df-float--${f.tone}`}>{f.text}</span>)}
        </motion.button>
    );
}

const affectLabel = (card: DuelCardView) =>
    [card.by?.length ? `affected by ${card.by.length} card${card.by.length > 1 ? "s" : ""}` : "", card.negated ? "negated" : "", card.counters ? `${card.counters} counters` : ""].filter(Boolean).join(", ");

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
    const offered = zone === undefined ? undefined : marks.zones.get(zone);
    const preview = zone === undefined || offered ? undefined : marks.preview.get(zone);
    const chosen = zone !== undefined && marks.chosenZones.has(zone);
    const pose = offered ?? preview;
    const cls = ["df-zone", label ? "df-zone--labelled" : "", offered ? "is-offered" : "", preview ? "is-preview" : "", pose === "side" ? "is-side" : "", chosen ? "is-chosen" : "", className];
    return (
        <div className={cls.join(" ")} data-label={label} data-zone={zone}>
            {card && <FieldCard card={card} marks={marks} onTap={onTap} onHover={onHover} side={side} />}
            {offered && <button type="button" className="df-zone__pick" aria-label="Put the card here" onClick={() => marks.onZone(zone!)} />}
        </div>
    );
}

/** Deck, Extra Deck, Graveyard or banished cards: the top card (or a back) and how many. */
export function Pile({ label, count, top, back, onTap, onHover, small, pile }: {
    label: string;
    /** Which pile this is ("me:deck"), for cards dealt from it to fly out of. */
    pile?: string;
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
            data-pile={pile}
            onClick={onTap}
            disabled={!onTap || !count}
            onPointerEnter={(e) => e.pointerType === "mouse" && top?.code && onHover?.(top.code)}
            aria-label={`${label}: ${count}`}
        >
            {back && count > 0 && <img className="df-pile__back" src={CARD_BACK} alt="" />}
            {top && (
                <motion.span layoutId={top.uid} className="df-pile__top" data-uid={top.uid} transition={FLIGHT}>
                    <img src={top.code ? cardImage(top.code) : CARD_BACK} alt="" />
                </motion.span>
            )}
            <span className="df-pile__label">{label}</span>
            {count > 0 && <span className="df-pile__count">{count}</span>}
        </button>
    );
}

/** Life points that count to their new value, with the damage floating off them. */
export function LifePoints({ value, side, name, floats, active, hit }: { value: number; side: Side; name: string; floats: readonly Float[]; active: boolean; hit?: boolean }) {
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
        <div className={`df-lp df-lp--${side} ${active ? "is-turn" : ""} ${hit ? "is-hit" : ""}`}>
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
                <motion.img key={c.uid} layoutId={c.uid} data-uid={c.uid} src={CARD_BACK} alt="" className="df-rival-hand__card" transition={FLIGHT} />
            ))}
        </div>
    );
}

/** Your hand, fanned. */
export function Hand({ cards, marks, onTap, onHover }: { cards: DuelCardView[]; marks: CardMarks; onTap: (c: DuelCardView) => void; onHover?: (code: number) => void }) {
    const mid = (cards.length - 1) / 2;
    const tight = cards.length > 4;
    // Cards overlap only as much as the row needs to fit (at most about half a card): on a wide
    // enough screen a big hand still spreads out, and every card is easy to hit.
    const n = cards.length;
    const spacing = `calc(max(var(--hw) * -0.4, min(3px, (100cqw - ${n} * var(--hw) - 16px) / ${2 * n})))`;
    return (
        <div className="df-hand">
            {cards.map((c, i) => (
                <motion.button
                    key={c.uid}
                    layoutId={c.uid}
                    type="button"
                    data-uid={c.uid}
                    className={`df-hand__card ${marks.glow.has(c.uid) ? "is-glow" : ""} ${marks.picked.has(c.uid) ? "is-picked" : ""} ${marks.raised === c.uid ? "is-raised" : ""}`}
                    // Each card stacks over the one before it. (Explicitly: the middle card has no tilt, so no
                    // transform, and would otherwise sink under both its tilted neighbours.)
                    style={{ rotate: (i - mid) * (tight ? 3 : 4), y: Math.abs(i - mid) * 4, marginInline: spacing, zIndex: i + 1 }}
                    onClick={() => onTap(c)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && onHover?.(c.code)}
                    aria-label={`Card in hand ${c.code}`}
                    transition={FLIGHT}
                >
                    <img src={c.code ? cardImage(c.code) : CARD_BACK} alt="" draggable={false} />
                </motion.button>
            ))}
        </div>
    );
}

/**
 * A card's face on the field. A token has no card of its own in the catalog and some have no
 * picture: then it shows as a plain token with its name.
 */
function Face({ card, up }: { card: DuelCardView; up: boolean }) {
    const [missing, setMissing] = useState(false);
    if (up && card.token && missing) return <span className="df-token"><b>{card.token}</b><small>Token</small></span>;
    return <img src={up ? cardImage(card.code) : CARD_BACK} alt="" draggable={false} onError={up && card.token ? () => setMissing(true) : undefined} />;
}
