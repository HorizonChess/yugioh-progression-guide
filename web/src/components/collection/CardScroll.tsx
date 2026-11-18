"use client";

import { useProgression } from "@/context/ProgressionContext";
import { MarkBadge } from "@/components/card/LookLater";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BinderChapter, BinderSlot } from "@/components/collection/Binder";
import "@/components/collection/binder.css";
import "@/components/packs/stage/pack-stage.css";

/** Hovering a card tips it toward the pointer, a light catching its face. */
const tilt = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    e.currentTarget.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    e.currentTarget.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    e.currentTarget.style.setProperty("--gx", `${x * 100}%`);
    e.currentTarget.style.setProperty("--gy", `${y * 100}%`);
};
const untilt = (e: React.PointerEvent<HTMLElement>) => {
    for (const k of ["--rx", "--ry", "--gx", "--gy"]) e.currentTarget.style.removeProperty(k);
};

/** "Super Rare" → "SR", for captions too narrow for the full name (phones). */
const shortRarity = (r: string) => (r === "Secret Rare" ? "ScR" : r.split(/\s+/).map((w) => w[0]).join("").toUpperCase());

/** The grid's top padding (the CSS's), and how many rows beyond the view stay drawn each side. */
const PAD = 6;
const OVERSCAN = 3;
/** A row's height until the first one is measured. */
const GUESS_ROW = 250;
/** The gap between rows (the CSS's). */
const ROW_GAP = 26;

/**
 * The collection as one long scrolling wall of cards laid on velvet (the default
 * view; the binder is the other): spare copies fan out behind a card, rares glow
 * in their rarity's colour. Only owned cards are passed in: the whole collection, set after set
 * with no break between them. Only the rows in view (and a few either side) are drawn; the rest are
 * empty space of the same height, so a collection of thousands scrolls as lightly as a handful.
 * The chapter chips stay pinned at the top: the one you're scrolling through lights up, and a tap
 * on one jumps to it.
 */
export default function CardScroll({ slots, chapters, activeChapter, onChapter, onSpot, onOpen, bind, empty, showKey = null }: {
    slots: BinderSlot[];
    chapters: BinderChapter[];
    activeChapter: string | null;
    onChapter: (key: string) => void;
    /** Scrolled on to another chapter's cards. */
    onSpot?: (key: string) => void;
    onOpen: (s: BinderSlot) => void;
    bind: (s: BinderSlot) => object;
    empty?: string;
    /** Keep this card in view (the close-up stepping through cards). */
    showKey?: string | null;
}) {
    const { marks } = useProgression();
    const scroller = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    // A card with no picture takes no place on the wall.
    const items = useMemo(() => slots.filter((s) => s.card.card_images[0]?.image_url_small), [slots]);
    const wall = items.some((s) => s.chapter);

    // The grid's shape, measured: how many cards a row holds and how tall a row is (gap included).
    const [cols, setCols] = useState(4);
    const [pitch, setPitch] = useState(GUESS_ROW);
    // A far jump aimed by the estimate, corrected once its card is drawn.
    const aim = useRef<{ key: string; tries: number } | null>(null);
    const measured = useRef(false);
    // Which rows are drawn.
    const [rows, setRows] = useState({ from: 0, to: 8 });
    const totalRows = Math.ceil(items.length / cols);

    /** Where the grid's first row starts, in the scroller's own scrolled space. */
    const gridTop = () => {
        const box = scroller.current, grid = gridRef.current;
        return box && grid ? grid.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + PAD : 0;
    };
    const chipsHeight = () => scroller.current?.querySelector(".cscroll__chips")?.getBoundingClientRect().height ?? 0;

    // Measure the grid and work out which rows the view covers; again on every scroll and resize.
    useLayoutEffect(() => {
        const box = scroller.current, grid = gridRef.current;
        if (!box || !grid) return;
        let raf = 0;
        const update = () => {
            raf = 0;
            const tracks = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
            const cards = grid.querySelectorAll<HTMLElement>(".cvault");
            // A row's height: the first drawn row to the last, spread over the rows between (positions are whole pixels, and a row's error would add up over a thousand rows).
            const apart = Math.floor((cards.length - 1) / tracks);
            const measure = apart >= 5 ? (cards[apart * tracks]!.offsetTop - cards[0]!.offsetTop) / apart : 0;
            if (tracks !== cols) setCols(tracks);
            // (Only a real change: the rounding differs a little with the rows drawn, and mustn't set it swinging.)
            if (measure > 20 && (!measured.current || Math.abs(measure - pitch) > 0.4)) {
                measured.current = true;
                setPitch(measure);
            }
            const top = box.scrollTop - gridTop();
            const first = Math.max(0, Math.floor(top / pitch) - OVERSCAN);
            const last = Math.ceil((top + box.clientHeight) / pitch) + OVERSCAN;
            setRows((r) => (r.from === first && r.to === last ? r : { from: first, to: last }));
            // The jump's card is drawn: put it exactly under the chips.
            const want = aim.current;
            const card = want && box.querySelector<HTMLElement>(`[data-key="${CSS.escape(want.key)}"]`);
            if (want && card) {
                const off = card.getBoundingClientRect().top - box.getBoundingClientRect().top - chipsHeight() - 4;
                if (Math.abs(off) > 2 && want.tries++ < 4) box.scrollBy({ top: off, behavior: "instant" });
                else aim.current = null;
            }
        };
        const queue = () => (raf ||= requestAnimationFrame(update));
        box.addEventListener("scroll", queue, { passive: true });
        const ro = new ResizeObserver(queue);
        ro.observe(box);
        update();
        return () => {
            box.removeEventListener("scroll", queue);
            ro.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [cols, pitch, items, rows]);

    // A chip tapped on the wall: scroll to that chapter's first card.
    const pick = (key: string) => {
        if (!wall) return onChapter(key);
        const at = items.findIndex((s) => s.chapter === key);
        const box = scroller.current;
        if (at < 0 || !box) return onChapter(key);
        const first = items[at]!;
        const by = gridTop() + Math.floor(at / cols) * pitch - chipsHeight() - 4 - box.scrollTop;
        // A glide when it's near; a leap across a long way (a glide through thousands of cards drags).
        const near = Math.abs(by) < box.clientHeight * 3;
        aim.current = near ? null : { key: first.key, tries: 0 };
        box.scrollTo({ top: box.scrollTop + by, behavior: near ? "smooth" : "instant" });
        onSpot?.(key);
    };

    // Which chapter's cards are at the top of the view, under the chips.
    useEffect(() => {
        const box = scroller.current;
        if (!box || !wall || !onSpot) return;
        let raf = 0, last = "";
        const spy = () => {
            raf = 0;
            // The first card whose foot is below the chips: cards lie in reading order.
            const row = Math.max(0, Math.floor((box.scrollTop + chipsHeight() - gridTop()) / pitch));
            const k = items[Math.min(row * cols, items.length - 1)]?.chapter;
            if (k && k !== last) onSpot((last = k));
        };
        const onScroll = () => (raf ||= requestAnimationFrame(spy));
        box.addEventListener("scroll", onScroll, { passive: true });
        spy();
        return () => {
            box.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(raf);
        };
    }, [wall, onSpot, items, cols, pitch]);

    // Keep the lit chip in sight in the chip row.
    useEffect(() => {
        if (!activeChapter) return;
        scroller.current?.querySelector<HTMLElement>(`.cscroll__chip[data-chip="${CSS.escape(activeChapter)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeChapter]);

    // A new list (a search, or the collection changing) starts at the top.
    useEffect(() => {
        scroller.current?.scrollTo({ top: 0 });
    }, [slots]);

    // The close-up stepped to a card: keep it in view, drawn or not.
    useEffect(() => {
        const box = scroller.current;
        const at = showKey ? items.findIndex((s) => s.key === showKey) : -1;
        if (!box || at < 0) return;
        const top = gridTop() + Math.floor(at / cols) * pitch, foot = top + pitch - ROW_GAP;
        const chips = chipsHeight();
        if (top < box.scrollTop + chips) box.scrollTo({ top: top - chips - 4 });
        else if (foot > box.scrollTop + box.clientHeight) box.scrollTo({ top: foot - box.clientHeight + 4 });
        // Only when the close-up moves: scrolling about meanwhile mustn't pull it back.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showKey]);

    const from = Math.min(rows.from, Math.max(0, totalRows - 1)) * cols;
    const to = Math.min(items.length, rows.to * cols);
    const above = Math.floor(from / cols), below = Math.max(0, totalRows - Math.ceil(to / cols));

    return (
        <div className="cscroll" ref={scroller}>
            <div className="cscroll__chips" role="tablist" aria-label="Chapters">
                {chapters.map((c) => (
                    <button key={c.key} role="tab" aria-selected={c.key === activeChapter} className={`cscroll__chip ${c.key === activeChapter ? "cscroll__chip--on" : ""}`} data-chip={c.key} onClick={() => pick(c.key)} title={c.label}>
                        <b>{c.key}</b><small>{c.total === null ? c.owned : `${c.owned}/${c.total}`}</small>
                    </button>
                ))}
            </div>
            {!slots.length && empty && <p className="cscroll__empty">{empty}</p>}
            {/* The rows out of view are space, not cards: the padding stands in for them. */}
            <div className="cscroll__grid" ref={gridRef} style={{ paddingTop: PAD + above * pitch, paddingBottom: below * pitch }}>
                {items.slice(from, to).map((s, n) => {
                    const art = s.card.card_images[0]!.image_url_small;
                    return (
                        <figure key={s.key} data-key={s.key} data-chapter={s.chapter} className="cvault" data-tier={s.tier} style={{ "--i": n % cols } as React.CSSProperties}>
                            <button type="button" className="cvault__card" onClick={() => onOpen(s)} aria-label={s.count > 1 ? `${s.card.name}, ${s.count} copies` : s.card.name}
                                onPointerMove={tilt} onPointerLeave={untilt} {...bind(s)}>
                                {/* the spare copies: the edges of up to two more cards under it, the deepest drawn first */}
                                {[2, 1].filter((k) => k < Math.min(s.count, 3)).map((k) => (
                                    <span key={k} className="cvault__stack" style={{ "--k": k } as React.CSSProperties} aria-hidden="true" />
                                ))}
                                <img src={art} alt="" loading="lazy" decoding="async" />
                                {s.tier !== "Common" && <span className="cvault__foil" aria-hidden="true" />}
                                <span className="cvault__glare" aria-hidden="true" />
                                {s.count > 1 && <span className="cvault__count">×{s.count}</span>}
                                {marks.has(s.card.id) && <MarkBadge />}
                            </button>
                            <figcaption>{s.code && <b>{s.code}</b>}<i /><span className="cvault__rarity">{s.rarity}</span><span className="cvault__rarity--short">{shortRarity(s.rarity)}</span></figcaption>
                        </figure>
                    );
                })}
            </div>
        </div>
    );
}
