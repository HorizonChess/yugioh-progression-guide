"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDismiss, useSwipeClose } from "@/lib/dismiss";
import { Card } from "@/lib/api";
import { DeckZone, isExtraDeckCard } from "@/lib/deck-utils";
import { CardPlate } from "@/components/card/CardPlate";
import { stageOf, type Printing } from "./stage";
import CartoucheButton from "@/components/ui/CartoucheButton";
import { CARD_KINDS, CardFilterFields, useCardFilters } from "./useCardFilters";

const ZONE_LABEL: Record<DeckZone, string> = { main: "Main Deck", extra: "Extra Deck", side: "Side Deck" };
const LIMIT: Record<DeckZone, number> = { main: 60, extra: 15, side: 15 };
const KIND_LABEL: Record<string, string> = { All: "All", Monster: "Monsters", Spell: "Spells", Trap: "Traps", Extra: "Extra" };
/** Drawer heights: a peek, half the screen, nearly all of it. */
const DRAWER = ["low", "mid", "full"] as const;

const art = (c: Card) => c.card_images[0]?.image_url_small ?? c.card_images[0]?.image_url;
const homeOf = (c: Card): DeckZone => (isExtraDeckCard(c) ? "extra" : "main");

/**
 * The deck builder on a phone: the deck up top as rows of small cards (Main,
 * Extra and Side fold away), your cards in a drawer you pull up from below.
 * Tap + on a card to add it to its deck; tap any card for its sheet, where its
 * copies in each deck go up and down. The rules are the page's (`refuse`).
 */
export default function DeckPhone({
    deckName, onDeckNameChange, decks, stats, collectionCards, ownedCounts, printings, bannedIds, copies, refuse, onAdd, onRemove,
    onSave, onLoad, onClear, onSort, onImport, onExport,
}: {
    deckName: string;
    onDeckNameChange: (name: string) => void;
    decks: Record<DeckZone, Card[]>;
    stats: { monsters: number; spells: number; traps: number; total: number };
    /** Your cards, with how many copies are still out of every deck. */
    collectionCards: { card: Card; count: number }[];
    ownedCounts: Map<number, number>;
    printings: Map<number, Printing>;
    bannedIds: Set<number>;
    copies: (id: number) => number;
    refuse: (card: Card, zone: DeckZone) => string | null;
    onAdd: (card: Card, zone?: DeckZone) => string | null;
    onRemove: (card: Card, zone: DeckZone) => void;
    onSave: () => void;
    onLoad: () => void;
    onClear: () => void;
    onSort: () => void;
    onImport: () => void;
    onExport: () => void;
}) {
    const cards = useMemo(() => collectionCards.map((c) => c.card), [collectionCards]);
    const f = useCardFilters(cards);
    const [open, setOpen] = useState<Card | null>(null);
    const [drawer, setDrawer] = useState(1);
    const [folds, setFolds] = useState<Record<DeckZone, boolean>>({ main: true, extra: true, side: true });
    const [menu, setMenu] = useState(false);
    const menuEl = useRef<HTMLDivElement>(null);
    useDismiss(menuEl, menu, () => setMenu(false));
    const cardSheet = useRef<HTMLDivElement>(null);
    const filterSheet = useRef<HTMLDivElement>(null);
    const [filters, setFilters] = useState(false);
    useSwipeClose(cardSheet, () => setOpen(null), { enabled: !!open });
    useSwipeClose(filterSheet, () => setFilters(false), { enabled: filters });
    const [note, setNote] = useState<{ text: string; key: number } | null>(null);
    /** The card just added, so it lands with a flash. */
    const [fresh, setFresh] = useState<{ id: number; zone: DeckZone; key: number } | null>(null);

    useEffect(() => {
        if (!note) return;
        const t = setTimeout(() => setNote(null), 2400);
        return () => clearTimeout(t);
    }, [note]);

    // Each note and each landing gets a fresh key, so its animation plays again.
    const seq = useRef(0);
    const add = (card: Card, zone?: DeckZone) => {
        const to = zone ?? homeOf(card);
        const why = onAdd(card, to);
        seq.current += 1;
        if (why) setNote({ text: why, key: seq.current });
        else setFresh({ id: card.id, zone: to, key: seq.current });
    };

    // The drawer: tap its handle to step through the heights, or drag it. While dragging it follows
    // the finger; on release it settles on the nearest height (a quick flick goes on to the next).
    const drawerEl = useRef<HTMLElement>(null);
    const drag = useRef<{ y: number; h: number; t: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
    const levels = (): [number, number, number] => {
        const H = drawerEl.current?.parentElement?.clientHeight ?? 0;
        return [120, H * 0.46, H * 0.86];
    };
    const handle = {
        onPointerDown: (e: React.PointerEvent) => {
            const el = drawerEl.current;
            if (!el) return;
            drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent) => {
            const d = drag.current, el = drawerEl.current;
            if (!d || !el) return;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.abs(dy) < 6) return;
            d.moved = true;
            const [lo, , hi] = levels();
            el.style.transition = "none";
            el.style.height = `${Math.max(lo * 0.8, Math.min(hi, d.h - dy))}px`;
            // the finger's speed (px/ms, up is positive), smoothed over the last moves
            const dt = Math.max(1, e.timeStamp - d.lastT);
            d.v = d.v * 0.4 + ((d.lastY - e.clientY) / dt) * 0.6;
            d.lastY = e.clientY; d.lastT = e.timeStamp;
        },
        onPointerUp: (e: React.PointerEvent) => {
            const d = drag.current, el = drawerEl.current;
            drag.current = null;
            if (!d || !el) return;
            if (!d.moved) {
                setDrawer((h) => (h === 2 ? 0 : h + 1));
                return;
            }
            const now = el.getBoundingClientRect().height;
            // the speed of the last move (px/ms, up is positive) carries the drawer on a little
            // a finger held still before release carries no speed
            const v = e.timeStamp - d.lastT > 120 ? 0 : d.v;
            const aim = now + v * 180;
            const ls = levels();
            let best = 0;
            ls.forEach((l, k) => { if (Math.abs(l - aim) < Math.abs(ls[best]! - aim)) best = k; });
            el.style.transition = "";
            el.style.height = "";
            setDrawer(best);
        },
        onPointerCancel: () => {
            drag.current = null;
            const el = drawerEl.current;
            if (el) { el.style.transition = ""; el.style.height = ""; }
        },
    };

    const left = (id: number) => collectionCards.find((c) => c.card.id === id)?.count ?? 0;
    const short = stats.total < 40;

    const mini = (zone: DeckZone) => {
        const list = decks[zone];
        // The Main Deck shows its 40 places; the others only what's in them.
        const pad = zone === "main" ? Math.max(0, 40 - list.length) : 0;
        return (
            <div className="dp-mini">
                {list.map((c, i) => {
                    const isFresh = fresh && fresh.zone === zone && fresh.id === c.id && i === list.map((x) => x.id).lastIndexOf(c.id);
                    return (
                        <button key={`${zone}-${i}-${isFresh ? fresh.key : ""}`} type="button" className={`dp-thumb ${isFresh ? "dp-thumb--fresh" : ""}`} onClick={() => setOpen(c)} aria-label={c.name}>
                            <img src={art(c)} alt="" loading="lazy" />
                        </button>
                    );
                })}
                {Array.from({ length: pad }, (_, i) => <span key={`pad-${i}`} className="dp-slot" />)}
            </div>
        );
    };

    const stepper = (card: Card, zone: DeckZone) => {
        const n = decks[zone].filter((c) => c.id === card.id).length;
        return (
            <span className="dp-step">
                <button type="button" onClick={() => onRemove(card, zone)} disabled={!n} aria-label={`One less in the ${ZONE_LABEL[zone]}`}>−</button>
                <output>{n}</output>
                <button type="button" onClick={() => add(card, zone)} disabled={!!refuse(card, zone)} aria-label={`One more in the ${ZONE_LABEL[zone]}`}>+</button>
            </span>
        );
    };

    return (
        <div className="dp">
            <div className="dp-head">
                <input value={deckName} onChange={(e) => onDeckNameChange(e.target.value)} aria-label="Deck name" placeholder="Deck Name" />
                <div className="dp-menu" ref={menuEl}>
                    <button type="button" className="db-btn" aria-haspopup="true" aria-expanded={menu} aria-label="More" onClick={() => setMenu((v) => !v)}>⋯</button>
                    {menu && (
                        <div className="dp-menu__list" role="menu" onClick={() => setMenu(false)}>
                            <button role="menuitem" onClick={onLoad}>Load a deck</button>
                            <button role="menuitem" onClick={onSort}>Sort the deck</button>
                            <button role="menuitem" onClick={onImport}>Import YDK</button>
                            <button role="menuitem" onClick={onExport}>Export YDK</button>
                            <button role="menuitem" className="dp-danger" onClick={onClear}>Clear the deck</button>
                        </div>
                    )}
                </div>
                <CartoucheButton onClick={onSave} className="dp-save">Save</CartoucheButton>
            </div>
            <div className="dp-counts">
                <span className={`dp-count ${short ? "dp-count--short" : "dp-count--ok"}`}>Main <b>{stats.total}</b>{short ? " / 40" : " / 60"}</span>
                <span className="dp-count">Extra <b>{decks.extra.length}</b></span>
                <span className="dp-count">Side <b>{decks.side.length}</b></span>
                <span className="dp-count db-gem db-gem--mon" title="Monsters"><i /><b>{stats.monsters}</b></span>
                <span className="dp-count db-gem db-gem--spell" title="Spells"><i /><b>{stats.spells}</b></span>
                <span className="dp-count db-gem db-gem--trap" title="Traps"><i /><b>{stats.traps}</b></span>
            </div>

            <div className={`dp-deck dp-deck--${DRAWER[drawer]}`}>
                {(["main", "extra", "side"] as DeckZone[]).map((zone) => (
                    <details key={zone} className="dp-fold" open={folds[zone]} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setFolds((s) => (s[zone] === o ? s : { ...s, [zone]: o })); }}>
                        <summary>{ZONE_LABEL[zone]} <small>{decks[zone].length}{zone === "main" ? " / 40–60" : " / 15"}</small></summary>
                        {decks[zone].length || zone === "main" ? mini(zone) : <p className="dp-empty">{zone === "side" ? "Open a card and add it to the Side Deck." : "Fusions you own go here: tap + on one."}</p>}
                    </details>
                ))}
                <p className="dp-empty">Tap a card in your deck for its details, to move or remove it.</p>
            </div>

            <section ref={drawerEl} className={`dp-drawer dp-drawer--${DRAWER[drawer]}`} aria-label="Your cards">
                <button type="button" className="dp-handle" {...handle} aria-label="Your cards: pull up or down">Your cards · {f.filtered.length}</button>
                <div className="dp-find">
                    <label>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                        <input value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder="Search your cards" aria-label="Search your cards" onFocus={() => setDrawer(2)} />
                    </label>
                    <button type="button" className="db-btn" onClick={() => setFilters(true)}>Filters{f.extraActive ? <span className="dp-n">{f.extraActive}</span> : null}</button>
                </div>
                <div className="dp-chips">
                    {CARD_KINDS.map((k) => (
                        <button key={k} type="button" className="dp-chip" aria-pressed={f.cardType === k} onClick={() => f.setCardType(k)}>{KIND_LABEL[k]}</button>
                    ))}
                </div>
                <div className="dp-grid custom-scrollbar">
                    {f.filtered.map((card) => {
                        const inDeck = copies(card.id), banned = bannedIds.has(card.id);
                        const can = !refuse(card, homeOf(card));
                        return (
                            <div key={card.id} className={`dp-tile ${!can ? "dp-tile--off" : ""}`}>
                                <button type="button" className="dp-tile__art" onClick={() => setOpen(card)} aria-label={card.name}>
                                    <img src={art(card)} alt="" loading="lazy" />
                                    {banned && <span className="dp-banned">Banned</span>}
                                    {inDeck ? <span className="dp-badge dp-badge--in">{inDeck} in</span> : <span className="dp-badge">×{left(card.id)}</span>}
                                </button>
                                {can && <button type="button" className="dp-plus" onClick={() => add(card)} aria-label={`Add ${card.name}`}>+</button>}
                                <span className="dp-tile__name">{card.name}</span>
                            </div>
                        );
                    })}
                    {!f.filtered.length && <p className="dp-empty">No cards match.</p>}
                </div>
            </section>

            {/* A card's sheet: its details, and its copies in each deck */}
            {open && (
                <>
                    <div className="dp-scrim" onClick={() => setOpen(null)} />
                    <div className="dp-sheet" role="dialog" aria-label={open.name} ref={cardSheet}>
                        <div className="dp-sheet__top">
                            <img className="dp-sheet__art" src={open.card_images[0]?.image_url} alt="" />
                            <CardPlate card={stageOf(open, printings.get(open.id), ownedCounts.get(open.id) ?? 0)} className="dp-sheet__plate" />
                        </div>
                        <div className="dp-zones">
                            {([homeOf(open), "side"] as DeckZone[]).map((z) => (
                                <div key={z} className="dp-zone">
                                    <span><b>{ZONE_LABEL[z]}</b><small>{decks[z].length} / {LIMIT[z]}</small></span>
                                    {stepper(open, z)}
                                </div>
                            ))}
                        </div>
                        <p className="dp-sheet__note">
                            {bannedIds.has(open.id) ? "Banned: it can't go in a deck." : `${copies(open.id)} of yours in decks · max ${Math.min(3, ownedCounts.get(open.id) ?? 0)}`}
                        </p>
                    </div>
                </>
            )}

            {/* Every filter the desktop search has */}
            {filters && (
                <>
                    <div className="dp-scrim" onClick={() => setFilters(false)} />
                    <div className="dp-sheet" role="dialog" aria-label="Filters" ref={filterSheet}>
                        <CardFilterFields f={f} withName={false} />
                        <button type="button" className="db-btn db-btn--gold dp-sheet__done" onClick={() => setFilters(false)}>Show {f.filtered.length} cards</button>
                    </div>
                </>
            )}

            {note && <div key={note.key} className="dp-toast" role="status">{note.text}</div>}
        </div>
    );
}
