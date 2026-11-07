"use client";

import type { ReactNode } from "react";
import { zoneKey, type DuelCardView, type DuelView, type Side, type Zone as ZoneName } from "@ygo/shared";
import { Hand, LifePoints, Pile, RivalHand, Zone, type CardMarks } from "./parts";

export interface BoardProps {
    view: DuelView;
    marks: CardMarks;
    onCard: (card: DuelCardView, side: Side, zone: ZoneName) => void;
    onPile: (side: Side, zone: "grave" | "banished") => void;
    onHover?: (code: number) => void;
    /** Phases, turn, menu. */
    phaseBar: ReactNode;
    /** Banners, the question panel, the result: drawn over the board. */
    overlay: ReactNode;
    /** Desktop only: the card being looked at, and the duel log. */
    detail?: ReactNode;
    log?: ReactNode;
}

const top = (cards: DuelCardView[]) => cards[cards.length - 1];
/** A row's zone shown at position `i`: the rival's rows are mirrored, so their sequence runs backwards. */
const seqAt = (side: Side, i: number) => (side === "opp" ? 4 - i : i);

/** The rows of a side, as the viewer sees them: the rival's are mirrored, as across a table. */
function rows(view: DuelView, side: Side) {
    const s = view[side];
    const mirror = side === "opp";
    return {
        monsters: mirror ? [...s.monsters].reverse() : s.monsters,
        spells: mirror ? [...s.spells].reverse() : s.spells,
    };
}

/** The Extra Monster Zones (New Master Rule only), between the two fields. */
function ExtraMonsterZones({ view, marks, onCard, onHover }: Pick<BoardProps, "view" | "marks" | "onCard" | "onHover">) {
    if (view.mode !== "MR4") return null;
    return (
        <div className="df-emz">
            {view.extraMonsters.map((z, i) => (
                <Zone key={i} card={z?.card ?? null} className="df-zone--monster" zone={zoneKey(z?.side ?? "me", "extra-monster", i)} marks={marks} side={z?.side ?? "me"} onHover={onHover} onTap={(c) => onCard(c, z?.side ?? "me", "monster")} />
            ))}
        </div>
    );
}

/**
 * Phones, portrait, in the manner of Master Duel's mobile field: five large square zones
 * across, the Field Spell, piles and life points in each duelist's bar.
 */
export function PhoneBoard({ view, marks, onCard, onPile, phaseBar, overlay }: BoardProps) {
    const bar = (side: Side) => {
        const s = view[side];
        return (
            <div className={`df-bar df-bar--${side}`}>
                <LifePoints value={s.lp} side={side} name={s.name} floats={marks.floats} active={view.turnPlayer === side} hit={marks.hit === side} />
                <div className="df-bar__zones">
                    <Zone card={s.field} label="Field" className="df-zone--mini" zone={zoneKey(side, "field", 0)} marks={marks} side={side} onTap={(c) => onCard(c, side, "field")} />
                    {view.mode === "MR3" && s.pendulum.map((p, i) => <Zone key={i} card={p} label="P" className="df-zone--mini" zone={zoneKey(side, "pendulum", i)} marks={marks} side={side} onTap={(c) => onCard(c, side, "pendulum")} />)}
                    <Pile small label="GY" count={s.grave.length} top={top(s.grave)} onTap={() => onPile(side, "grave")} />
                    {s.banished.length > 0 && <Pile small label="Banished" count={s.banished.length} top={top(s.banished)} onTap={() => onPile(side, "banished")} />}
                    <Pile small label="Extra" count={s.extra} back />
                    <Pile small label="Deck" count={s.deck} back />
                </div>
            </div>
        );
    };
    const mat = (side: Side) => {
        const r = rows(view, side);
        const monsters = r.monsters.map((c, i) => <Zone key={`m${i}`} card={c} className="df-zone--monster" zone={zoneKey(side, "monster", seqAt(side, i))} marks={marks} side={side} onTap={(x) => onCard(x, side, "monster")} />);
        const spells = r.spells.map((c, i) => <Zone key={`s${i}`} card={c} className="df-zone--spell" zone={zoneKey(side, "spell", seqAt(side, i))} marks={marks} side={side} onTap={(x) => onCard(x, side, "spell")} />);
        return <div className={`df-mat df-mat--${side}`}>{side === "opp" ? <>{spells}{monsters}</> : <>{monsters}{spells}</>}</div>;
    };
    return (
        <div className="df df--phone">
            <RivalHand cards={view.opp.hand} />
            {bar("opp")}
            {mat("opp")}
            <div className="df-mid">
                {phaseBar}
                <ExtraMonsterZones view={view} marks={marks} onCard={onCard} />
            </div>
            {mat("me")}
            {bar("me")}
            <Hand cards={view.me.hand} marks={marks} onTap={(c) => onCard(c, "me", "hand")} />
            {overlay}
        </div>
    );
}

/**
 * Wide screens: the whole field in the middle, as on a playmat (Field Zone and Graveyard beside
 * the Monster Zones, Extra Deck and Deck beside the Spell & Trap Zones), the card you point at
 * on the left, life points and the duel log on the right.
 */
export function DesktopBoard({ view, marks, onCard, onPile, onHover, phaseBar, overlay, detail, log }: BoardProps) {
    const mat = (side: Side) => {
        const s = view[side];
        const r = rows(view, side);
        const zone = (c: DuelCardView | null, i: number, row: "m" | "s") => (
            <Zone key={`${row}${i}`} card={c} className={row === "s" ? "df-zone--spell" : "df-zone--monster"} zone={zoneKey(side, row === "s" ? "spell" : "monster", seqAt(side, i))} marks={marks} side={side} onHover={onHover} onTap={(x) => onCard(x, side, row === "m" ? "monster" : "spell")} />
        );
        const field = <Zone key="field" card={s.field} label="Field" className="df-zone--side" zone={zoneKey(side, "field", 0)} marks={marks} side={side} onHover={onHover} onTap={(c) => onCard(c, side, "field")} />;
        const gy = <Pile key="gy" label="GY" count={s.grave.length} top={top(s.grave)} onTap={() => onPile(side, "grave")} onHover={onHover} />;
        const deck = <Pile key="deck" label="Deck" count={s.deck} back />;
        const extra = <Pile key="extra" label="Extra" count={s.extra} back />;
        const monsterRow = side === "opp" ? [gy, ...r.monsters.map((c, i) => zone(c, i, "m")), field] : [field, ...r.monsters.map((c, i) => zone(c, i, "m")), gy];
        const spellRow = side === "opp" ? [deck, ...r.spells.map((c, i) => zone(c, i, "s")), extra] : [extra, ...r.spells.map((c, i) => zone(c, i, "s")), deck];
        return <div className={`df-mat df-mat--${side}`}>{side === "opp" ? <>{spellRow}{monsterRow}</> : <>{monsterRow}{spellRow}</>}</div>;
    };
    const side = (s: Side) => (
        <div className={`df-side-block df-side-block--${s}`}>
            <LifePoints value={view[s].lp} side={s} name={view[s].name} floats={marks.floats} active={view.turnPlayer === s} hit={marks.hit === s} />
            <div className="df-side-block__piles">
                {view.mode === "MR3" && view[s].pendulum.map((p, i) => <Zone key={i} card={p} label={i ? "Right P" : "Left P"} className="df-zone--mini" zone={zoneKey(s, "pendulum", i)} marks={marks} side={s} onHover={onHover} onTap={(c) => onCard(c, s, "pendulum")} />)}
                <Pile small label="Banished" count={view[s].banished.length} top={top(view[s].banished)} onTap={() => onPile(s, "banished")} onHover={onHover} />
                <span className="df-side-block__hand">{view[s].hand.length} in hand</span>
            </div>
        </div>
    );
    return (
        <div className="df df--desk">
            <aside className="df-panel df-panel--left">{detail}</aside>
            <main className="df-center">
                <RivalHand cards={view.opp.hand} />
                {mat("opp")}
                <div className="df-mid">
                    {phaseBar}
                    <ExtraMonsterZones view={view} marks={marks} onCard={onCard} onHover={onHover} />
                </div>
                {mat("me")}
                <Hand cards={view.me.hand} marks={marks} onTap={(c) => onCard(c, "me", "hand")} onHover={onHover} />
            </main>
            <aside className="df-panel df-panel--right">
                {side("opp")}
                <div className="df-log">{log}</div>
                {side("me")}
            </aside>
            {overlay}
        </div>
    );
}
