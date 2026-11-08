"use client";

import { useProgression } from "@/context/ProgressionContext";
import { MarkBadge } from "@/components/card/LookLater";
import { useEffect, useRef, useState } from "react";
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

/** Cards added to the grid each time the reader nears its end. */
const BATCH = 48;

/**
 * The collection as one long scrolling wall of cards laid on velvet (the default
 * view; the binder is the other): spare copies fan out behind a card, rares glow
 * in their rarity's colour. Only owned cards are passed in: the whole collection, set after set
 * with no break between them, and the grid grows in batches as you scroll. The chapter chips stay
 * pinned at the top: the one you're scrolling through lights up, and a tap on one jumps to it.
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
    const sentinel = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(BATCH);

    // A new list (a search, or the collection changing) starts at the top, one batch in.
    const [lastList, setLastList] = useState(slots);
    if (lastList !== slots) {
        setLastList(slots);
        setShown(BATCH);
    }
    // The close-up stepped past what's drawn, or a chip asked for a chapter further on: draw up to there.
    const [jump, setJump] = useState<string | null>(null);
    const jumpAt = jump ? slots.findIndex((s) => s.chapter === jump) : -1;
    const want = Math.max(showKey ? slots.findIndex((s) => s.key === showKey) : -1, jumpAt);
    if (want >= shown) setShown(Math.ceil((want + 1) / BATCH) * BATCH);
    const wall = slots.some((s) => s.chapter);

    // A chip tapped on the wall: scroll to that chapter's first card.
    const pick = (key: string) => {
        if (!wall) return onChapter(key);
        if (slots.some((s) => s.chapter === key)) setJump(key);
        else onChapter(key);
    };
    useEffect(() => {
        if (!jump) return;
        const first = slots.find((s) => s.chapter === jump);
        const el = first && scroller.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(first.key)}"]`);
        if (!el || !scroller.current) return;
        const box = scroller.current;
        const chips = box.querySelector(".cscroll__chips")?.getBoundingClientRect().height ?? 0;
        const by = el.getBoundingClientRect().top - box.getBoundingClientRect().top - chips - 4;
        // A glide when it's near; a leap across a long way (a glide through thousands of cards drags).
        box.scrollTo({ top: box.scrollTop + by, behavior: Math.abs(by) < box.clientHeight * 3 ? "smooth" : "instant" });
        onSpot?.(jump);
        setJump(null);
    }, [jump, shown, slots, onSpot]);

    // Which chapter's cards are at the top of the view, under the chips.
    useEffect(() => {
        const box = scroller.current;
        if (!box || !wall || !onSpot) return;
        let raf = 0, last = "";
        const spy = () => {
            raf = 0;
            // The first card whose foot is below the chips (cards lie in reading order, so a short walk).
            const line = (box.querySelector(".cscroll__chips") ?? box).getBoundingClientRect().bottom;
            for (const f of box.querySelectorAll<HTMLElement>(".cvault[data-chapter]")) {
                if (f.getBoundingClientRect().bottom <= line) continue;
                const k = f.dataset.chapter!;
                if (k !== last) onSpot((last = k));
                return;
            }
        };
        const onScroll = () => (raf ||= requestAnimationFrame(spy));
        box.addEventListener("scroll", onScroll, { passive: true });
        spy();
        return () => {
            box.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(raf);
        };
    }, [wall, onSpot, slots]);

    // Keep the lit chip in sight in the chip row.
    useEffect(() => {
        if (!activeChapter) return;
        scroller.current?.querySelector<HTMLElement>(`.cscroll__chip[data-chip="${CSS.escape(activeChapter)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeChapter]);

    useEffect(() => {
        scroller.current?.scrollTo({ top: 0 });
    }, [slots]);
    useEffect(() => {
        if (!showKey) return;
        scroller.current?.querySelector(`[data-key="${CSS.escape(showKey)}"]`)?.scrollIntoView({ block: "nearest" });
    }, [showKey, shown]);

    // Near the end of what's drawn, draw the next batch.
    const more = shown < slots.length;
    useEffect(() => {
        const el = sentinel.current;
        if (!el || !more || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) setShown((n) => n + BATCH);
        }, { root: scroller.current, rootMargin: "0px 0px 700px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [more, shown]);

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
            <div className="cscroll__grid">
                {slots.slice(0, shown).map((s, i) => {
                    const art = s.card.card_images[0]?.image_url_small;
                    if (!art) return null;
                    return (
                        <figure key={s.key} data-key={s.key} data-chapter={s.chapter} className="cvault" data-tier={s.tier} style={{ "--i": i % BATCH } as React.CSSProperties}>
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
            {more && <div ref={sentinel} className="cscroll__more" aria-hidden="true">Loading more cards…</div>}
        </div>
    );
}
