"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { loneMust, type DuelAnswer, type DuelEvent, type DuelFrame, type DuelServerMessage, type DuelState, type DuelView, type Side } from "@ygo/shared";
import { connectDuel, getDuel, type DuelConnection } from "@/lib/duel-client";
import { duelPrefs } from "./duel-prefs";
import { CARD_BACK } from "./parts";
import { sfx, unlockSound } from "./sfx";

/*
 * A live duel on screen. The server sends frames (events, then the field after them); they're
 * played one at a time, so a chain or a battle reads as it happens, and the question waiting
 * at the end only appears once the board has caught up.
 *
 * An answered question stays on screen (inert) until the server replies, so nothing blinks
 * between one question and the next. Chain windows nobody needs (the server marks them quiet)
 * are passed straight away unless the player asked to be stopped at every one.
 */

export type Banner =
    | { key: number; kind: "activate"; code: number; side: Side; link: number }
    | { key: number; kind: "turn"; side: Side; turn: number }
    | { key: number; kind: "end"; text: string }
    | { key: number; kind: "coin"; side: Side; results: ("heads" | "tails")[]; call?: { side: Side; heads: boolean } }
    | { key: number; kind: "dice"; side: Side; results: number[] }
    | { key: number; kind: "declare"; side: Side; what: string; text: string; code?: number }
    | { key: number; kind: "reveal"; side: Side; by: Side | null; from: string; codes: number[]; count: number };
export type Float = { key: number; side?: Side; uid?: string; text: string; tone: "up" | "down" };
export interface Effects {
    destroying: string[];
    /** Cards just put on the field: they drop into place. `heavy`: summoned monsters. */
    landing: { uid: string; heavy: boolean }[];
    /** Cards on their way from the deck: hidden where they'll land until they get there. */
    dealing: string[];
    /** A card whose effect was just activated: it flares. */
    flaring: string[];
    banner: Banner | null;
    floats: Float[];
    /** The side whose life points were just hit. */
    hit: Side | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let key = 0;

/** How long each kind of event holds the board, in ms. */
const HOLD: Partial<Record<DuelEvent["k"], number>> = {
    activate: 1050, turn: 900, coin: 2400, dice: 2000, reveal: 2200, random: 700, declare: 1600, destroyed: 120, damage: 700, pay: 500, recover: 500, lp: 900, "hand-shuffle": 540, summon: 520, move: 300, draw: 260, set: 300, reposition: 340, win: 500, resolved: 220, negated: 600,
};
const FIELD = new Set(["monster", "spell", "field", "pendulum", "extra-monster"]);

/** Plays a keyframe animation on an element and waits for it. */
const anim = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => el.animate(frames, { fill: "none", ...opts }).finished.catch(() => undefined);

/** A burst of light and sparks where a blow lands (page coordinates), on the arena. */
function burst(x: number, y: number, heavy: boolean) {
    const arena = document.querySelector<HTMLElement>(".df-arena");
    if (!arena) return;
    const box = arena.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = `df-impact ${heavy ? "df-impact--heavy" : ""}`;
    el.style.left = `${x - box.left}px`;
    el.style.top = `${y - box.top}px`;
    for (let i = 0; i < 10; i++) {
        const spark = document.createElement("i");
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
        const reach = (heavy ? 70 : 46) + Math.random() * 30;
        spark.style.setProperty("--sx", `${Math.cos(angle) * reach}px`);
        spark.style.setProperty("--sy", `${Math.sin(angle) * reach}px`);
        el.appendChild(spark);
    }
    arena.appendChild(el);
    setTimeout(() => el.remove(), 700);
}

const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * A card dealt off a deck: a card back leaves the deck and flies to where the card now is (a hand,
 * the Graveyard, the field), and the card appears there. `reveal`: it turns face-up as it arrives.
 */
async function deal(uid: string, side: Side, reveal: boolean, sound: boolean, landed?: () => void) {
    const target = document.querySelector<HTMLElement>(`[data-uid="${uid}"]`);
    const deck = document.querySelector<HTMLElement>(`[data-pile="${side}:deck"]`);
    const arena = document.querySelector<HTMLElement>(".df-arena");
    if (!target || !deck || !arena) return;
    const t = target.getBoundingClientRect(), d = deck.getBoundingClientRect(), a = arena.getBoundingClientRect();
    const ghost = document.createElement("img");
    ghost.src = CARD_BACK;
    ghost.className = "df-ghost";
    Object.assign(ghost.style, { left: `${d.left - a.left}px`, top: `${d.top - a.top}px`, width: `${d.width}px`, height: `${d.height}px` });
    arena.appendChild(ghost);
    target.style.opacity = "0";
    if (sound) sfx.draw();
    const dx = t.left + t.width / 2 - (d.left + d.width / 2), dy = t.top + t.height / 2 - (d.top + d.height / 2);
    const sx = t.width / d.width, sy = t.height / d.height;
    // Up off the deck, across, and down where it belongs; turning edge-on at the end if it's revealed.
    // The rival's deck sits right by their hand, at the screen's edge: their card swings down into
    // view first, held up a moment like a drawn card, so you see it happen.
    const rival = side === "opp";
    const lift = rival ? Math.max(70, Math.abs(dy) + 60) : -30;
    const big = rival ? 1.3 : 1.12;
    await anim(ghost, [
        { transform: "translate(0,0) scale(1)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))" },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 + lift}px) scale(${(1 + sx) / 2 * big}, ${(1 + sy) / 2 * big}) rotate(${rival ? 6 : -6}deg)`, filter: "drop-shadow(0 16px 12px rgba(0,0,0,.6))", offset: rival ? 0.45 : 0.5 },
        ...(rival ? [{ transform: `translate(${dx * 0.6}px, ${dy * 0.6 + lift * 0.85}px) scale(${(1 + sx) / 2 * big}, ${(1 + sy) / 2 * big}) rotate(3deg)`, filter: "drop-shadow(0 16px 12px rgba(0,0,0,.6))", offset: 0.62 }] : []),
        { transform: `translate(${dx}px, ${dy}px) scale(${reveal ? 0.02 : 1} , 1) scale(${sx}, ${sy})`, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))" },
    ], { duration: rival ? 720 : 460, easing: "cubic-bezier(.45,.05,.35,1)", fill: "forwards" });
    ghost.remove();
    target.style.opacity = "";
    landed?.();
    // The face comes round: the card opens out from edge-on.
    const face = reveal ? target.querySelector<HTMLElement>("img") : null;
    if (face) await anim(face, [{ transform: "scaleX(0.02)" }, { transform: "scaleX(1)" }], { duration: 150, easing: "ease-out" });
}

/** A deck is shuffled: it riffles. */
function riffle(side: Side) {
    const deck = document.querySelector<HTMLElement>(`[data-pile="${side}:deck"] .df-pile__back`);
    if (!deck) return;
    void anim(deck, [
        { transform: "none" },
        { transform: "translate(-7px, -2px) rotate(-7deg)" },
        { transform: "translate(6px, -3px) rotate(6deg)" },
        { transform: "translate(-5px, -1px) rotate(-4deg)" },
        { transform: "translate(4px, -2px) rotate(3deg)" },
        { transform: "translate(0, -4px)" },
        { transform: "none" },
    ], { duration: 640, easing: "ease-in-out" });
}

/** A hand is shuffled: its cards close up into a stack, and fan out again. */
function shuffleHand(side: Side) {
    const cards = [...document.querySelectorAll<HTMLElement>(side === "me" ? ".df-hand .df-hand__card" : ".df-rival-hand .df-rival-hand__card")];
    if (cards.length < 2) return;
    const boxes = cards.map((c) => c.getBoundingClientRect());
    const middle = (boxes[0]!.left + boxes[boxes.length - 1]!.right) / 2;
    cards.forEach((el, i) => {
        const dx = middle - (boxes[i]!.left + boxes[i]!.width / 2);
        // Added to whatever holds the card where it is (its place in the fan), so it returns there.
        void anim(el, [{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)`, offset: 0.4 }, { transform: `translateX(${dx}px)`, offset: 0.6 }, { transform: "translateX(0)" }], { duration: 520, easing: "ease-in-out", composite: "add" });
    });
}

/** The whole table jolts. */
function quake(strength: number) {
    const board = document.querySelector<HTMLElement>(".df-arena > .df");
    if (!board) return;
    const s = strength;
    void anim(board, [
        { transform: "translate(0,0)" },
        { transform: `translate(${-s}px, ${s * 0.6}px)` },
        { transform: `translate(${s * 0.8}px, ${-s * 0.5}px)` },
        { transform: `translate(${-s * 0.5}px, ${-s * 0.3}px)` },
        { transform: `translate(${s * 0.3}px, ${s * 0.2}px)` },
        { transform: "translate(0,0)" },
    ], { duration: 320, easing: "ease-out" });
}

export function useDuel(duelId: string | null, onEvent?: (e: DuelEvent, view: DuelView) => void) {
    const [state, setState] = useState<DuelState | null>(null);
    const [shown, setShown] = useState<DuelView | null>(null);
    const [playing, setPlaying] = useState(false);
    /** The question was answered; waiting for the server (it stays on screen, inert). */
    const [answered, setAnswered] = useState(false);
    /** What kind of question was answered last (a card's pop-over only stays up for its own answer). */
    const [answeredKind, setAnsweredKind] = useState<string | null>(null);
    const [connected, setConnected] = useState(true);
    const [effects, setEffects] = useState<Effects>({ destroying: [], landing: [], flaring: [], banner: null, floats: [], hit: null, dealing: [] });
    const queue = useRef<DuelFrame[]>([]);
    /** The field last put on screen: what's new in a frame is measured against it. */
    const shownRef = useRef<DuelView | null>(null);
    const busy = useRef(false);
    const latest = useRef<DuelState | null>(null);
    const conn = useRef<DuelConnection | null>(null);
    const onEventRef = useRef(onEvent);
    useEffect(() => {
        onEventRef.current = onEvent;
    });
    useEffect(() => unlockSound(), []);

    const float = useCallback((f: Omit<Float, "key">) => {
        const k = ++key;
        setEffects((e) => ({ ...e, floats: [...e.floats, { ...f, key: k }] }));
        setTimeout(() => setEffects((e) => ({ ...e, floats: e.floats.filter((x) => x.key !== k) })), 1500);
    }, []);

    /**
     * The attack: the attacker rises and draws back, holds, strikes its target (or the rival's
     * life points), and the blow lands with a jolt, a flash and sparks before it returns.
     */
    const attack = useCallback(async (attacker: string | undefined, target: string | undefined, side: Side, pace: number) => {
        const el = attacker && document.querySelector<HTMLElement>(`[data-uid="${attacker}"] .df-card__lunge`);
        const goalBox = target ? document.querySelector<HTMLElement>(`[data-uid="${target}"]`) : document.querySelector<HTMLElement>(side === "me" ? ".df-lp--opp" : ".df-lp--me");
        if (!el || !goalBox) return;
        const host = el.closest<HTMLElement>(".df-card");
        const a = el.getBoundingClientRect(), b = goalBox.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        // Stop short of the target's centre: the attacker meets it, it doesn't pass through.
        const reach = Math.max(0, dist - Math.min(b.width, b.height) * 0.45);
        const tilt = Math.max(-14, Math.min(14, ux * 14));
        if (host) host.style.zIndex = "30";
        if (pace < 1) {
            await anim(el, [{ transform: "none" }, { transform: `translate(${ux * reach}px, ${uy * reach}px)` }, { transform: "none" }], { duration: 260 });
            if (host) host.style.zIndex = "";
            return;
        }
        sfx.windup();
        // Gather: up, back, and leaning in.
        await anim(el, [
            { transform: "none", filter: "none" },
            { transform: `translate(${-ux * 14}px, ${-uy * 14}px) scale(1.22) rotate(${-tilt * 0.4}deg)`, filter: "drop-shadow(0 14px 14px rgba(0,0,0,.8)) brightness(1.15)" },
        ], { duration: 260, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
        await sleep(110);
        sfx.whoosh();
        // Strike: fast and accelerating.
        await anim(el, [
            { transform: `translate(${-ux * 14}px, ${-uy * 14}px) scale(1.22) rotate(${-tilt * 0.4}deg)`, filter: "drop-shadow(0 14px 14px rgba(0,0,0,.8)) brightness(1.15)" },
            { transform: `translate(${ux * reach}px, ${uy * reach}px) scale(1.12) rotate(${tilt * 0.3}deg)`, filter: "drop-shadow(0 4px 6px rgba(0,0,0,.8)) brightness(1.35)" },
        ], { duration: 150, easing: "cubic-bezier(.7,0,1,.6)", fill: "forwards" });
        // Impact.
        const direct = !target;
        sfx.impact(direct);
        quake(direct ? 11 : 7);
        burst(a.left + a.width / 2 + ux * reach, a.top + a.height / 2 + uy * reach, direct);
        const victim = target && document.querySelector<HTMLElement>(`[data-uid="${target}"] .df-card__lunge`);
        if (victim) {
            void anim(victim, [
                { transform: "none", filter: "brightness(2.2)" },
                { transform: `translate(${ux * 12}px, ${uy * 12}px) rotate(${tilt * 0.5}deg)`, filter: "brightness(1.4)", offset: 0.25 },
                { transform: "none", filter: "none" },
            ], { duration: 380, easing: "cubic-bezier(.2,.8,.3,1)" });
        }
        // Recoil from the blow, then home.
        await anim(el, [
            { transform: `translate(${ux * reach}px, ${uy * reach}px) scale(1.12) rotate(${tilt * 0.3}deg)`, filter: "brightness(1.35)" },
            { transform: `translate(${ux * (reach - 18)}px, ${uy * (reach - 18)}px) scale(1.1)`, filter: "brightness(1.1)", offset: 0.25 },
            { transform: "none", filter: "none" },
        ], { duration: 380, easing: "cubic-bezier(.25,.9,.35,1)" });
        el.getAnimations().forEach((x) => x.cancel());
        if (host) host.style.zIndex = "";
    }, []);

    const play = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        setPlaying(true);
        while (queue.current.length) {
            let frame = queue.current.shift()!;
            // The opening hands: both duelists draw their five at the same time, each from their own
            // deck, so the two opening draws play as one.
            const next = queue.current[0];
            if (!shownRef.current && frame.events.every((e) => e.k === "draw") && next?.events.every((e) => e.k === "draw")) {
                queue.current.shift();
                frame = { events: [...frame.events, ...next.events], view: next.view };
            }
            // Far behind (a reconnect, a long bot turn): play quickly, and quietly.
            // (A rival's whole turn is a few dozen frames: that's watched at full speed.)
            const pace = queue.current.length > 90 ? 0.25 : 1;
            const loud = pace === 1;
            let hold = 0;
            for (const e of frame.events) {
                if (e.k === "attack") await attack(e.attacker, e.target, e.side, pace);
                if (e.k === "destroyed") {
                    setEffects((x) => ({ ...x, destroying: [...x.destroying, e.uid] }));
                    if (loud) sfx.shatter();
                    await sleep(760 * pace);
                }
            }
            const before = shownRef.current;
            // Cards that left a deck (drawn, searched, milled, summoned straight from it) fly out of it.
            const dealt: { uid: string; side: Side; reveal: boolean }[] = [];
            for (const s of ["me", "opp"] as const) {
                const had = new Set(before ? before[s].hand.map((c) => c.uid) : []);
                const deckBefore = before ? before[s].deck : frame.view[s].deck + frame.view[s].hand.length;
                if (deckBefore > frame.view[s].deck) for (const c of frame.view[s].hand) if (!had.has(c.uid)) dealt.push({ uid: c.uid, side: s, reveal: s === "me" });
            }
            for (const e of frame.events) if (e.k === "move" && e.from === "deck" && e.to !== "hand") dealt.push({ uid: e.uid, side: e.side, reveal: e.to === "grave" || e.to === "banished" });
            // They're hidden from the moment the hand shows: it starts without them, and each appears as it lands.
            const dealing = dealt.length && pace === 1 ? dealt.map((c) => c.uid) : [];
            setEffects((x) => ({ ...x, dealing }));
            setShown(frame.view);
            shownRef.current = frame.view;
            // The very first look at a duel: both decks are shuffled before the hands are dealt.
            if (!before && loud) {
                await nextPaint();
                riffle("me");
                riffle("opp");
                sfx.shuffle();
                await sleep(650);
            }
            if (dealt.length && pace === 1) {
                await nextPaint();
                // Each side's cards come off its own deck one after another; both sides at once.
                const nth = { me: 0, opp: 0 };
                await Promise.all(dealt.map((c) =>
                    sleep(nth[c.side]++ * 150)
                        .then(() => deal(c.uid, c.side, c.reveal, loud && c.side === "me", () => flushSync(() => setEffects((x) => ({ ...x, dealing: x.dealing.filter((u) => u !== c.uid) }))))),
                ));
            }
            for (const e of frame.events) if (e.k === "shuffle" && loud) {
                riffle(e.side);
                sfx.shuffle();
            }
            for (const e of frame.events) if (e.k === "hand-shuffle" && pace === 1) {
                await nextPaint();
                shuffleHand(e.side);
                if (loud) sfx.shuffle();
            }
            const summoned = frame.events.some((e) => e.k === "summon");
            const landing = frame.events.flatMap((e) => (e.k === "move" && FIELD.has(e.to) && !FIELD.has(e.from) ? [{ uid: e.uid, heavy: summoned && e.to !== "spell" }] : []));
            // A card activated flares; so do cards picked at random.
            const flaring = frame.events.flatMap((e) => (e.k === "activate" && e.uid ? [e.uid] : e.k === "random" ? e.uids : []));
            setEffects((x) => ({
                ...x,
                destroying: x.destroying.filter((u) => !frame.events.some((e) => e.k === "destroyed" && e.uid === u)),
                landing: landing.length ? landing : x.landing,
                flaring: flaring.length ? flaring : x.flaring,
            }));
            if (landing.length) setTimeout(() => setEffects((x) => ({ ...x, landing: x.landing.filter((l) => !landing.includes(l)) })), 700);
            if (flaring.length) setTimeout(() => setEffects((x) => ({ ...x, flaring: x.flaring.filter((u) => !flaring.includes(u)) })), 1100);
            if (summoned && loud) setTimeout(() => quake(3), 330);
            for (const e of frame.events) {
                onEventRef.current?.(e, frame.view);
                if (loud) {
                    if (e.k === "summon") setTimeout(e.how === "flip" ? sfx.flip : sfx.summon, e.how === "flip" ? 0 : 200);
                    if (e.k === "set") setTimeout(sfx.set, 200);
                    if (e.k === "activate") {
                        sfx.activate();
                        if (e.link > 1) setTimeout(() => sfx.chainLink(e.link), 120);
                    }
                    if (e.k === "phase") sfx.phase();
                    // Life points tick as their counter runs (it runs 0.7 s).
                    if (e.k === "damage") {
                        sfx.damage();
                        sfx.lpCount(700, true);
                    }
                    if (e.k === "recover") {
                        sfx.heal();
                        sfx.lpCount(700, false);
                    }
                    if (e.k === "pay") {
                        sfx.pay();
                        sfx.lpCount(700, true);
                    }
                    if (e.k === "turn") sfx.turn(e.side === "me");
                    if (e.k === "win") (e.side === "me" ? sfx.win : e.side === "opp" ? sfx.lose : sfx.phase)();
                }
                if (e.k === "activate") setEffects((x) => ({ ...x, banner: { key: ++key, kind: "activate", code: e.code, side: e.side, link: e.link } }));
                if (e.k === "turn") setEffects((x) => ({ ...x, banner: { key: ++key, kind: "turn", side: e.side, turn: e.turn } }));
                // A coin spins up and lands; a die tumbles. The result shows once it settles.
                if (e.k === "coin") {
                    setEffects((x) => ({ ...x, banner: { key: ++key, kind: "coin", side: e.side, results: e.results, ...(e.call ? { call: e.call } : {}) } }));
                    if (loud) sfx.coin();
                }
                if (e.k === "dice") {
                    setEffects((x) => ({ ...x, banner: { key: ++key, kind: "dice", side: e.side, results: e.results } }));
                    if (loud) sfx.dice();
                }
                if (e.k === "damage" || e.k === "pay") {
                    float({ side: e.side, text: `−${e.amount}`, tone: "down" });
                    if (e.k === "damage") {
                        setEffects((x) => ({ ...x, hit: e.side }));
                        setTimeout(() => setEffects((x) => ({ ...x, hit: null })), 600);
                    }
                }
                if (e.k === "declare") setEffects((x) => ({ ...x, banner: { key: ++key, kind: "declare", side: e.side, what: e.what, text: e.text, code: e.code } }));
                if (e.k === "reveal") setEffects((x) => ({ ...x, banner: { key: ++key, kind: "reveal", side: e.side, by: e.by, from: e.from, codes: e.codes, count: e.count } }));
                if (e.k === "recover") float({ side: e.side, text: `+${e.amount}`, tone: "up" });
                // Life Points set outright (Reversal Quiz swaps them): the new total rises from the counter.
                if (e.k === "lp") {
                    float({ side: e.side, text: `${e.lp} LP`, tone: e.lp >= e.was ? "up" : "down" });
                    if (loud) sfx.lpCount(700, e.lp < e.was);
                }
                // A negated attack: the words rise from the attacker (or its side, if it's gone).
                if (e.k === "attack-negated") float({ ...(e.attacker ? { uid: e.attacker } : { side: e.side }), text: "Attack negated", tone: "down" });
                hold = Math.max(hold, HOLD[e.k] ?? 120);
            }
            // Each play of the rival's gets a beat of its own, so you can follow what it did.
            if (frame.events.some((e) => "side" in e && e.side === "opp" && (e.k === "summon" || e.k === "set" || e.k === "activate" || e.k === "attack"))) hold += 450;
            await sleep(hold * pace);
            setEffects((x) => (x.banner && x.banner.kind !== "end" ? { ...x, banner: null } : x));
        }
        busy.current = false;
        setPlaying(false);
        if (latest.current) {
            setShown(latest.current.view);
            shownRef.current = latest.current.view;
        }
    }, [float, attack]);

    const recv = useRef<((m: DuelServerMessage) => void) | null>(null);
    const watchdog = useRef<ReturnType<typeof setTimeout>>(undefined);
    /** Where this page is in the duel's frames (the server's cursor): a reconnect is shown what it missed. */
    const cursor = useRef<string | null>(null);
    useEffect(() => {
        if (!duelId) return;
        const onMessage = (m: DuelServerMessage) => {
            clearTimeout(watchdog.current);
            // A state fetched without one (the watchdog's) jumps past frames: where the page is isn't known.
            cursor.current = m.cursor ?? null;
            let next = m.state;
            const p = next.prompt;
            // A chain window that doesn't need you: pass it without asking.
            if (p?.kind === "chain" && p.quiet && p.pass !== null && duelPrefs().chain === "auto") {
                conn.current?.answer(next.seq, { kind: "choice", id: p.pass });
                next = { ...next, prompt: null };
            }
            // One effect that must happen now (an upkeep), listed with cards you could use first: it
            // just happens. Those cards are offered again right after, like any other moment.
            const lone = p?.kind === "chain" && p.forced && duelPrefs().chain === "auto" ? loneMust(p) : null;
            if (lone !== null) {
                conn.current?.answer(next.seq, { kind: "choice", id: lone });
                next = { ...next, prompt: null };
            }
            latest.current = next;
            setState(next);
            setAnswered(false);
            queue.current.push(...m.frames);
            if (!queue.current.length && !busy.current) {
                setShown(next.view);
                shownRef.current = next.view;
            }
            void play();
        };
        conn.current = connectDuel(duelId, onMessage, setConnected, () => cursor.current);
        recv.current = onMessage;
        return () => {
            clearTimeout(watchdog.current);
            recv.current = null;
            conn.current?.close();
            conn.current = null;
        };
    }, [duelId, play]);

    /** Answers the question on screen, once: it stays up (inert) until the server replies. */
    const answer = useCallback((a: DuelAnswer) => {
        const s = latest.current;
        if (!s?.prompt) return;
        sfx.click();
        conn.current?.answer(s.seq, a);
        latest.current = { ...s, prompt: null };
        setAnsweredKind(s.prompt.kind);
        setAnswered(true);
        // If no reply comes (a step that failed on the server), fetch the duel as it stands
        // rather than leave the answered question up, inert, for good.
        clearTimeout(watchdog.current);
        watchdog.current = setTimeout(() => {
            if (!duelId) return;
            getDuel(duelId).then(({ state }) => {
                if (state && latest.current?.seq === s.seq && !latest.current.prompt) recv.current?.({ type: "state", frames: [], state });
            }).catch(() => {});
        }, 8000);
    }, [duelId]);

    const concede = useCallback(() => conn.current?.concede(), []);
    const callOff = useCallback((agree: boolean) => conn.current?.callOff(agree), []);

    /** Takes back the move being set up: like an answer, the question stays (inert) until the reply. */
    const back = useCallback(() => {
        const s = latest.current;
        if (!s?.prompt) return;
        sfx.putDown();
        conn.current?.back(s.seq);
        latest.current = { ...s, prompt: null };
        setAnsweredKind("back");
        setAnswered(true);
    }, []);

    return {
        state,
        view: shown,
        prompt: playing ? null : (state?.prompt ?? null),
        /** A question for you is waiting for the animations to finish. */
        pending: playing && !!state?.prompt && state.prompt.kind !== "actions",
        answered,
        answeredKind: answered ? answeredKind : null,
        playing,
        connected,
        effects,
        answer,
        concede,
        callOff,
        back,
    };
}
