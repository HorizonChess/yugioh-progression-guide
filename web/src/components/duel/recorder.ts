"use client";

import { useEffect, useRef } from "react";
import type { DuelCardView, DuelEvent, DuelView } from "@ygo/shared";

/*
 * The duel recorder: a watch on the board for cards that misbehave, for bug reports.
 *
 * Every frame it measures each card on the board and compares it with where the duel says it is.
 * It writes down an incident when a card:
 *   - moves on screen while its place in the duel hasn't changed ("moved"),
 *   - can't be seen: gone from the page, see-through or squashed to nothing ("missing", "hidden"),
 *   - is drawn twice at once (two elements with one uid: the board's flights mix them up).
 * And when the arena itself is scrolled ("scrolled"): it covers the screen and never should be,
 * and the board's flights take a scroll they weren't told of for every card moving at once.
 * Each incident keeps what led up to it: the duel's events and frames, taps, the card held up,
 * the panels' size, the last second of the card's positions.
 *
 * Off unless switched on: in development, or with ?recorder=1 (?recorder=0 turns it off again).
 * When on, the duel menu offers to copy the log; `window.__duelRecorder` has it too.
 */

const FLAG = "ygo-duel-recorder";
const STORE = "ygo-duel-recorder-log";
/** How far back an incident's story goes. */
const STORY_MS = 6000;
/** A card off its settled spot by more than this many pixels is moving. */
const MOVED_PX = 6;
/** Frames a card must be off (or unseen) before it counts: a frame's hiccup isn't an incident. */
const FRAMES = 2;
/** Frames a card must stay still to count as settled where it is. */
const SETTLE = 6;
/**
 * And how long after it got a new place: a flight sets off slowly (its first frames hardly move),
 * so a card isn't settled before its flight (0.46 s) and its landing are surely over.
 */
const SETTLE_MS = 900;

type Note = { t: number; kind: string; data?: unknown };
type Sample = [t: number, dx: number, dy: number, opacity: number, w: number, h: number];
export interface Incident {
    at: string;
    t: number;
    kind: "moved" | "missing" | "hidden" | "duplicate" | "scrolled";
    uid: string;
    code: number;
    side: "me" | "opp";
    place: string;
    /** For a move: furthest off its spot (px), and for how long (ms). */
    off?: { max: number; ms: number; dx: number; dy: number };
    turn: number;
    phase: string;
    screen: { w: number; h: number; phone: boolean };
    /** The card's positions around it, relative to its settled spot. */
    samples: Sample[];
    story: Note[];
}

export function recorderOn(): boolean {
    if (typeof window === "undefined") return false;
    const q = new URLSearchParams(window.location.search).get("recorder");
    if (q === "1") localStorage.setItem(FLAG, "on");
    if (q === "0") localStorage.removeItem(FLAG);
    return process.env.NODE_ENV === "development" || localStorage.getItem(FLAG) === "on";
}

const notes: Note[] = [];
let incidents: Incident[] = [];
let t0 = 0;
const now = () => Math.round(performance.now() - t0);

function remember(kind: string, data?: unknown) {
    const t = now();
    notes.push({ t, kind, ...(data === undefined ? {} : { data }) });
    while (notes.length && notes[0]!.t < t - STORY_MS * 2) notes.shift();
}

function load() {
    try {
        incidents = JSON.parse(localStorage.getItem(STORE) ?? "[]") as Incident[];
    } catch {
        incidents = [];
    }
}
function save() {
    // The newest 25, so the browser's storage isn't filled.
    incidents = incidents.slice(-25);
    try {
        localStorage.setItem(STORE, JSON.stringify(incidents));
    } catch {
        /* storage full: the log stays in memory */
    }
}

/** What the recorder says about a duel event (short, for the story). */
export function noteEvent(e: DuelEvent) {
    if (!t0) return;
    const { k, ...rest } = e;
    remember(`event:${k}`, rest);
}
/** Anything else worth knowing when a card misbehaves (a tap, a question, a card held up). */
export function noteRecorder(kind: string, data?: unknown) {
    if (t0) remember(kind, data);
}

export const recorderLog = () => ({ incidents, story: notes.slice(-80) });
export function recorderText() {
    const { incidents: list } = recorderLog();
    const head = `Duel recorder: ${list.length} incident${list.length === 1 ? "" : "s"} (${navigator.userAgent})`;
    return `${head}\n${JSON.stringify(recorderLog(), null, 1)}`;
}
export function clearRecorder() {
    incidents = [];
    save();
}

/** Where each card is, as the duel tells it: "me:hand:2/5", "opp:m:3", "me:gy" (only a pile's top card is drawn). */
function placesOf(view: DuelView) {
    const out = new Map<string, { place: string; code: number; side: "me" | "opp" }>();
    const put = (c: DuelCardView | null | undefined, side: "me" | "opp", place: string) => c && out.set(c.uid, { place: `${side}:${place}`, code: c.code, side });
    for (const side of ["me", "opp"] as const) {
        const s = view[side];
        s.hand.forEach((c, i) => put(c, side, `hand:${i}/${s.hand.length}`));
        s.monsters.forEach((c, i) => put(c, side, `m:${i}:${c?.defense ? "def" : "atk"}`));
        s.spells.forEach((c, i) => put(c, side, `s:${i}`));
        s.pendulum.forEach((c, i) => put(c, side, `p:${i}`));
        put(s.field, side, "field");
        put(s.grave[s.grave.length - 1], side, "gy");
        put(s.banished[s.banished.length - 1], side, "banished");
    }
    view.extraMonsters.forEach((z, i) => z && put(z.card, z.side, `emz:${i}`));
    return out;
}

/** What a card on screen is measured against: its zone, its pile, or the hand it's fanned in. */
const HOLDER = ".df-zone, .df-pile, .df-hand, .df-rival-hand";

type Track = { place: string; since: number; settled: { x: number; y: number } | null; still: number; last: { x: number; y: number } | null; off: number; unseen: number; open: Incident | null; startedAt: number; samples: Sample[]; dupAt: number };

/**
 * Watches the board while a duel is on screen. `view` is the field as drawn; `quiet` lists cards
 * that are meant to move where they are (the one held up, the one being destroyed).
 */
export function useDuelRecorder(on: boolean, view: DuelView | null, quiet: readonly string[]) {
    const viewRef = useRef(view);
    const quietRef = useRef(quiet);
    useEffect(() => {
        viewRef.current = view;
        quietRef.current = quiet;
    });
    // Each new field: noted (what changed for your cards), so a move can be told from a misstep.
    const lastPlaces = useRef<Map<string, string>>(new Map());
    useEffect(() => {
        if (!on || !view) return;
        const places = placesOf(view);
        const changed: string[] = [];
        for (const [uid, p] of places) if (lastPlaces.current.get(uid) !== p.place) changed.push(`${uid} ${lastPlaces.current.get(uid) ?? "-"}→${p.place}`);
        for (const [uid, place] of lastPlaces.current) if (!places.has(uid)) changed.push(`${uid} ${place}→gone`);
        lastPlaces.current = new Map([...places].map(([u, p]) => [u, p.place]));
        if (changed.length) remember("field", { turn: view.turn, phase: view.phase, changed: changed.slice(0, 30) });
    }, [on, view]);

    useEffect(() => {
        if (!on) return;
        t0 = performance.now();
        notes.length = 0;
        load();
        const w = window as unknown as { __duelRecorder?: unknown };
        w.__duelRecorder = { log: recorderLog, text: recorderText, clear: clearRecorder };
        remember("start", { w: innerWidth, h: innerHeight, ua: navigator.userAgent });

        const tracks = new Map<string, Track>();
        let frame = 0;
        let lastLayout = "";
        let lastScroll = "0,0";
        const onPointer = (e: PointerEvent) => {
            const el = (e.target as Element | null)?.closest("[data-uid], button, [data-zone]");
            remember("tap", { uid: el?.getAttribute("data-uid") ?? undefined, zone: el?.getAttribute("data-zone") ?? undefined, what: el?.textContent?.slice(0, 40) || el?.className?.toString().slice(0, 40), type: e.pointerType });
        };
        const onVisible = () => remember("visibility", document.visibilityState);
        const onResize = () => remember("resize", { w: innerWidth, h: innerHeight });
        document.addEventListener("pointerdown", onPointer, true);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("resize", onResize);

        const report = (tr: Track, kind: Incident["kind"], uid: string, info: { place: string; code: number; side: "me" | "opp" }, view: DuelView) => {
            const inc: Incident = {
                at: new Date().toISOString(), t: now(), kind, uid, code: info.code, side: info.side, place: info.place,
                turn: view.turn, phase: view.phase, screen: { w: innerWidth, h: innerHeight, phone: !!document.querySelector(".df--phone") },
                samples: [...tr.samples], story: notes.filter((n) => n.t >= now() - STORY_MS),
            };
            incidents.push(inc);
            save();
            console.warn(`[duel recorder] ${kind}: ${info.side === "me" ? "your" : "rival's"} card ${uid} (${info.code}) at ${info.place}`, inc);
            return inc;
        };

        const tick = () => {
            raf = requestAnimationFrame(tick);
            const view = viewRef.current;
            const root = document.querySelector(".df");
            if (!view || !root || document.visibilityState !== "visible") return;
            frame++;
            const t = now();
            // The board's own frame: when it moves or resizes, every card's flight follows (noted, not an incident).
            const r = root.getBoundingClientRect(), c = root.querySelector(".df-center, .df-mid")?.getBoundingClientRect();
            const layout = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}|${c ? `${Math.round(c.left)},${Math.round(c.width)}` : ""}`;
            if (layout !== lastLayout) {
                if (lastLayout) remember("layout", layout);
                lastLayout = layout;
            }

            const places = placesOf(view);
            const arena = root.closest(".df-arena");
            const scroll = arena ? `${arena.scrollLeft},${arena.scrollTop}` : "0,0";
            if (scroll !== lastScroll) {
                remember("arena-scroll", scroll);
                if (lastScroll === "0,0") {
                    const focused = document.activeElement;
                    remember("focus", focused ? `${focused.tagName.toLowerCase()}.${focused.className.toString().slice(0, 40)} ${focused.textContent?.slice(0, 30) ?? ""}` : null);
                    const first = [...places][0];
                    if (first) report({ samples: [] } as unknown as Track, "scrolled", first[0], { ...first[1], place: `arena scrolled to ${scroll}` }, view);
                }
                lastScroll = scroll;
            }

            const byUid = new Map<string, Element[]>();
            root.querySelectorAll("[data-uid]").forEach((el) => {
                const uid = el.getAttribute("data-uid")!;
                (byUid.get(uid) ?? byUid.set(uid, []).get(uid)!).push(el);
            });
            for (const [uid, info] of places) {
                let tr = tracks.get(uid);
                if (!tr || tr.place !== info.place) {
                    // A new place: the card is meant to travel there; it's watched again once it settles.
                    // (A move still open ends here: how long it was off, until the card got its new place.)
                    if (tr?.open?.off) tr.open.off.ms = t - tr.startedAt;
                    tr = { place: info.place, since: t, settled: null, still: 0, last: null, off: 0, unseen: 0, open: null, startedAt: 0, samples: tr?.samples ?? [], dupAt: tr?.dupAt ?? 0 };
                    tracks.set(uid, tr);
                }
                const els = byUid.get(uid) ?? [];
                if (els.length > 1 && t - tr.dupAt > 2000) {
                    tr.dupAt = t;
                    report(tr, "duplicate", uid, info, view);
                }
                const el = els[0] as HTMLElement | undefined;
                if (!el) {
                    // (Gone from the page while the duel still has it there.)
                    if (++tr.unseen === FRAMES * 3) report(tr, "missing", uid, info, view);
                    continue;
                }
                const box = el.getBoundingClientRect();
                const quiet = quietRef.current.includes(uid) || el.matches(":hover");
                const holder = el.parentElement?.closest(HOLDER)?.getBoundingClientRect();
                let opacity = 1;
                for (let a: Element | null = el; a && a !== root; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
                const seen = box.width > 3 && box.height > 3 && opacity > 0.25 && getComputedStyle(el).visibility !== "hidden";
                if (!seen && !quiet) {
                    if (++tr.unseen === FRAMES * 3) report(tr, "hidden", uid, info, view);
                } else tr.unseen = 0;

                const at = { x: box.left + box.width / 2 - (holder ? holder.left + holder.width / 2 : 0), y: box.top + box.height / 2 - (holder ? holder.top + holder.height / 2 : 0) };
                const base = tr.settled ?? at;
                tr.samples.push([t, Math.round(at.x - base.x), Math.round(at.y - base.y), Math.round(opacity * 100) / 100, Math.round(box.width), Math.round(box.height)]);
                if (tr.samples.length > 90) tr.samples.shift();
                // Meant to move where it is (held up, hovered, breaking): it settles again afterwards.
                if (quiet) {
                    tr.settled = null;
                    tr.still = 0;
                    tr.last = at;
                    continue;
                }
                if (!tr.settled) {
                    tr.still = tr.last && Math.hypot(at.x - tr.last.x, at.y - tr.last.y) < 0.75 ? tr.still + 1 : 0;
                    tr.last = at;
                    if (tr.still >= SETTLE && t - tr.since >= SETTLE_MS) tr.settled = at;
                    continue;
                }
                const dx = at.x - tr.settled.x, dy = at.y - tr.settled.y, d = Math.hypot(dx, dy);
                if (d > MOVED_PX) {
                    tr.off++;
                    if (tr.off === FRAMES) {
                        tr.startedAt = t;
                        tr.open = report(tr, "moved", uid, info, view);
                        tr.open.off = { max: Math.round(d), ms: 0, dx: Math.round(dx), dy: Math.round(dy) };
                    } else if (tr.open?.off && d > tr.open.off.max) tr.open.off = { ...tr.open.off, max: Math.round(d), dx: Math.round(dx), dy: Math.round(dy) };
                } else {
                    if (tr.open?.off) {
                        // Back on its spot: how long it was off, and its positions until now.
                        tr.open.off.ms = t - tr.startedAt;
                        tr.open.samples = [...tr.samples];
                        save();
                    }
                    tr.open = null;
                    tr.off = 0;
                }
            }
            for (const uid of tracks.keys()) if (!places.has(uid)) tracks.delete(uid);
            // (Stuck off its spot: the sample trail is filed after a second.)
            if (frame % 60 === 0) save();
        };
        let raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("pointerdown", onPointer, true);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("resize", onResize);
            remember("stop");
            save();
        };
    }, [on]);
}
