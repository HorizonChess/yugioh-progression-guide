"use client";

import { edgeSwipe } from "@/lib/swipe-nav";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Card } from "@/lib/api";
import type { Tier } from "@/components/packs/stage/fx";
import "@/components/collection/binder.css";
import "@/components/packs/stage/pack-stage.css";

/** One pocket: a card you own (with how many), or the printed outline of one you don't. */
export type BinderSlot = { key: string; card: Card; count: number; rarity: string; code: string; tier: Tier };
export type BinderChapter = { key: string; label: string; owned: number; total: number | null };

const TAB_COLOURS = ["#c9a04a", "#8fa3b8", "#b7604a", "#6f9a5a", "#9a6fc4", "#c98a4a", "#4f8fb0", "#b04f7a"];

const EYE = (
    <svg viewBox="0 0 120 106" aria-hidden="true">
        <defs>
            <linearGradient id="binder-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff0b8" /><stop offset=".5" stopColor="#e0b54f" /><stop offset="1" stopColor="#8a6420" />
            </linearGradient>
        </defs>
        <path d="M60 4 L116 100 H4 Z" fill="none" stroke="url(#binder-gold)" strokeWidth="6" strokeLinejoin="round" />
        <path d="M24 66 Q60 36 96 66 Q60 92 24 66 Z" fill="none" stroke="url(#binder-gold)" strokeWidth="4" />
        <circle cx="60" cy="65" r="11" fill="url(#binder-gold)" /><circle cx="60" cy="65" r="4.5" fill="#3c160c" />
        <path d="M58 78 Q56 88 46 93" fill="none" stroke="url(#binder-gold)" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M72 77 L80 92" fill="none" stroke="url(#binder-gold)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
);

function Page({ slots, title, chapter, number, onOpen, bind }: {
    slots: (BinderSlot | null)[]; title: string; chapter: string; number: number;
    onOpen: (s: BinderSlot) => void; bind: (s: BinderSlot) => object;
}) {
    return (
        <div className="binder-page">
            <div className="binder-page__title">{title}</div>
            {Array.from({ length: 9 }, (_, i) => {
                const s = slots[i];
                if (!s) return <div key={i} className="binder-pocket" />;
                const art = s.card.card_images[0]?.image_url_small;
                return (
                    <button key={s.key} type="button" className="binder-pocket" data-tier={s.tier} onClick={() => onOpen(s)} aria-label={s.card.name} {...(s.count ? bind(s) : {})}>
                        {s.count && art ? (
                            <>
                                <img src={art} alt="" decoding="sync" />
                                {s.tier !== "Common" && <span className="binder-foil" />}
                                {s.count > 1 && <span className="binder-count">×{s.count}</span>}
                            </>
                        ) : (
                            <span className="binder-ghost"><b>{s.code}</b><span>{s.card.name}</span></span>
                        )}
                    </button>
                );
            })}
            <div className="binder-page__foot"><span>{chapter}</span><span>{number}</span></div>
        </div>
    );
}

/**
 * A ring binder of 3×3 sleeve pages: a two-page spread on wide screens, one page
 * on phones. Its leather cover swings open on arrival; index tabs pick a chapter
 * (a set); pages turn with the arrows, a swipe or the arrow keys. `slots` is the
 * chapter's (or the search's) cards in order; owned ones open on tap.
 */
export default function Binder({ owner, title, chapterCode, slots, chapters, activeChapter, onChapter, onOpen, bind, empty, isPhone, showKey = null }: {
    owner: string;
    title: string;
    chapterCode: string;
    slots: BinderSlot[];
    chapters: BinderChapter[];
    activeChapter: string | null;
    onChapter: (key: string) => void;
    onOpen: (s: BinderSlot) => void;
    bind: (s: BinderSlot) => object;
    empty?: string;
    isPhone: boolean;
    /** Keep the page with this card open (the close-up stepping through cards). */
    showKey?: string | null;
}) {
    const [spread, setSpread] = useState(0);
    const [open, setOpen] = useState(false);
    const [turning, setTurning] = useState<{ dir: 1 | -1; from: number } | null>(null);
    const book = useRef<HTMLDivElement>(null);
    const per = isPhone ? 9 : 18;
    const pages = Math.max(1, Math.ceil(slots.length / per));
    const at = Math.min(spread, pages - 1);
    const page = (n: number) => slots.slice(n * 9, n * 9 + 9);

    // A new chapter or search starts on its first page.
    const [lastList, setLastList] = useState(slots);
    if (lastList !== slots) {
        setLastList(slots);
        setSpread(0);
    }
    // The close-up stepped to a card on another page: open the binder there, so closing lands on it.
    const [lastShow, setLastShow] = useState(showKey);
    if (lastShow !== showKey) {
        setLastShow(showKey);
        const i = showKey ? slots.findIndex((s) => s.key === showKey) : -1;
        if (i >= 0 && Math.floor(i / per) !== at) setSpread(Math.floor(i / per));
    }
    useEffect(() => {
        const t = setTimeout(() => setOpen(true), 450);
        return () => clearTimeout(t);
    }, []);

    // The pages either side are fetched and decoded ahead, so a turn never lands on a page still loading.
    useEffect(() => {
        const near = slots.slice(Math.max(0, (at - 1) * per), (at + 2) * per);
        for (const s of near) {
            const url = s.count ? s.card.card_images[0]?.image_url_small : undefined;
            if (url) { const img = new Image(); img.src = url; void img.decode().catch(() => {}); }
        }
    }, [slots, at, per]);

    const turn = (dir: 1 | -1) => {
        const next = at + dir;
        if (turning || next < 0 || next >= pages) return;
        setTurning({ dir, from: at });
        setSpread(next);
    };
    const latestTurn = useRef(turn);
    useLayoutEffect(() => {
        latestTurn.current = turn;
    });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as Element).closest("input, select, textarea, [role=dialog]") || document.querySelector(".closeup")) return;
            if (e.key === "ArrowRight") latestTurn.current(1);
            if (e.key === "ArrowLeft") latestTurn.current(-1);
        };
        addEventListener("keydown", onKey);
        return () => removeEventListener("keydown", onKey);
    }, []);

    // The turning sheet: it swings over the rings, shaded, then the spread settles.
    const leaf = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = leaf.current;
        if (!turning || !el) return;
        const shade = el.querySelector(".binder-leaf__shade");
        let a: Animation;
        if (isPhone) {
            // One page at a time: the sheet turns right over the rings, its sleeve
            // back showing as it goes (next), or comes back over them onto the page
            // (back). It never fades: a fade flattens the 3D and the page would
            // show through mirrored.
            const over = [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-90deg) translateZ(24px)" }, { transform: "rotateY(-180deg)" }];
            const next = turning.dir > 0;
            a = el.animate(next ? over : [...over].reverse(), { duration: 640, easing: "cubic-bezier(.45,.05,.3,1)", fill: "both" });
            shade?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: 640 });
        } else {
            const angle = turning.dir > 0 ? -180 : 180;
            a = el.animate([{ transform: "rotateY(0deg)" }, { transform: `rotateY(${angle / 2}deg) translateZ(30px)` }, { transform: `rotateY(${angle}deg)` }], { duration: 700, easing: "cubic-bezier(.45,.05,.3,1)", fill: "both" });
            shade?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: 700 });
        }
        a.onfinish = () => setTurning(null);
        return () => a.cancel();
    }, [turning, isPhone]);

    const swipe = useRef<number | null>(null);
    const props = { title, chapter: chapterCode, onOpen, bind };
    // Pages as numbered in the binder (two per spread on wide screens).
    const left = at * 2, right = isPhone ? at : at * 2 + 1;
    // While turning: the sheet carries the page it lifts off on its front, the page it lands as on its back.
    // Phones turn one page: forward, the old page lifts off the new one; back, the new page comes down over the old.
    const t = turning;
    const leafFront = t && (isPhone ? (t.dir > 0 ? t.from : at) : t.dir > 0 ? t.from * 2 + 1 : t.from * 2);
    const leafBack = t && (isPhone ? null : t.dir > 0 ? at * 2 : at * 2 + 1);
    // Under the sheet, the side it is leaving shows the new page at once; the side it lands on keeps the old one.
    const shownLeft = t && !isPhone && t.dir > 0 ? t.from * 2 : left;
    const shownRight = t && t.dir < 0 ? (isPhone ? t.from : t.from * 2 + 1) : right;

    const pager = (
        <div className={`binder-pager ${isPhone ? "binder-pager--tabs" : ""}`}>
            <button className="ps-btn" onClick={() => turn(-1)} disabled={at === 0} aria-label="Previous page">‹</button>
            <span>{isPhone ? `${at + 1} / ${pages}` : `Page ${at + 1} of ${pages}`}</span>
            <button className="ps-btn" onClick={() => turn(1)} disabled={at >= pages - 1} aria-label="Next page">›</button>
        </div>
    );

    return (
        <div className="binder-stage" data-own-swipe={edgeSwipe(at, pages)} onPointerDown={(e) => (swipe.current = e.clientX)} onPointerUp={(e) => {
            if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 50) turn(e.clientX < swipe.current ? 1 : -1);
            swipe.current = null;
        }}>
            <div ref={book} className={`binder ${open ? "binder--open" : ""}`}>
                <div className="binder-shell" /><div className="binder-spine" />
                <div className="binder-tabs" role="tablist" aria-label="Chapters">
                    {chapters.map((c, i) => (
                        <button key={c.key} role="tab" aria-selected={c.key === activeChapter} className={`binder-tab ${c.key === activeChapter ? "binder-tab--on" : ""}`}
                            style={{ "--tabc": TAB_COLOURS[i % TAB_COLOURS.length] } as React.CSSProperties} onClick={() => onChapter(c.key)} title={c.label}>
                            <b>{c.key}</b><small>{c.total === null ? c.owned : `${c.owned}/${c.total}`}</small>
                        </button>
                    ))}
                </div>
                {!isPhone && <div className="binder-sheets binder-sheets--l"><Page {...props} slots={page(shownLeft)} number={shownLeft + 1} /></div>}
                <div className="binder-sheets binder-sheets--r"><Page {...props} slots={page(shownRight)} number={shownRight + 1} /></div>
                {t && leafFront !== null && (
                    <div ref={leaf} className={`binder-leaf ${isPhone || t.dir > 0 ? "binder-leaf--r" : "binder-leaf--l"}`}>
                        <Page {...props} slots={page(leafFront)} number={leafFront + 1} />
                        {leafBack !== null ? (
                            <div className="binder-leaf__back"><Page {...props} slots={page(leafBack)} number={leafBack + 1} /></div>
                        ) : (
                            // Phones: the back of the sleeve sheet, its pockets empty from this side.
                            <div className="binder-leaf__back binder-leaf__back--sleeve"><Page {...props} title="" chapter="" slots={[]} number={0} /></div>
                        )}
                        <div className="binder-leaf__shade" />
                    </div>
                )}
                <div className="binder-rings" aria-hidden="true"><i /><i /><i /></div>
                <div className="binder-cover" aria-hidden="true">
                    <div className="binder-cover__front">{EYE}<h2>Duelist&apos;s Binder</h2><p>{owner}</p></div>
                    <div className="binder-cover__back" />
                </div>
                {!slots.length && empty && <p className="binder-empty">{empty}</p>}
                {/* phones: the pager rides beside the chapter tabs, leaving the page the room */}
                {isPhone && pager}
            </div>
            {!isPhone && pager}
        </div>
    );
}
