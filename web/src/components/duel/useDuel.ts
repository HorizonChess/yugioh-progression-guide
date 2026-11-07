"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DuelAnswer, DuelEvent, DuelFrame, DuelServerMessage, DuelState, DuelView, Side } from "@ygo/shared";
import { connectDuel, type DuelConnection } from "@/lib/duel-client";
import { duelPrefs } from "./duel-prefs";
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

export type Banner = { key: number; kind: "activate"; code: number; side: Side; link: number } | { key: number; kind: "turn"; side: Side; turn: number } | { key: number; kind: "end"; text: string };
export type Float = { key: number; side?: Side; uid?: string; text: string; tone: "up" | "down" };
export interface Effects {
    destroying: string[];
    /** Cards just put on the field: they drop into place. `heavy`: summoned monsters. */
    landing: { uid: string; heavy: boolean }[];
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
    activate: 1050, turn: 900, destroyed: 120, damage: 700, pay: 500, recover: 500, summon: 520, move: 300, draw: 260, set: 300, reposition: 340, win: 500, resolved: 220, negated: 600,
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
    const [connected, setConnected] = useState(true);
    const [effects, setEffects] = useState<Effects>({ destroying: [], landing: [], flaring: [], banner: null, floats: [], hit: null });
    const queue = useRef<DuelFrame[]>([]);
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
            const frame = queue.current.shift()!;
            // Far behind (a reconnect, a long bot turn): play quickly, and quietly.
            const pace = queue.current.length > 25 ? 0.25 : 1;
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
            setShown(frame.view);
            const summoned = frame.events.some((e) => e.k === "summon");
            const landing = frame.events.flatMap((e) => (e.k === "move" && FIELD.has(e.to) && !FIELD.has(e.from) ? [{ uid: e.uid, heavy: summoned && e.to !== "spell" }] : []));
            const flaring = frame.events.flatMap((e) => (e.k === "activate" && e.uid ? [e.uid] : []));
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
                    if (e.k === "draw") sfx.draw();
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
                if (e.k === "damage" || e.k === "pay") {
                    float({ side: e.side, text: `−${e.amount}`, tone: "down" });
                    if (e.k === "damage") {
                        setEffects((x) => ({ ...x, hit: e.side }));
                        setTimeout(() => setEffects((x) => ({ ...x, hit: null })), 600);
                    }
                }
                if (e.k === "recover") float({ side: e.side, text: `+${e.amount}`, tone: "up" });
                hold = Math.max(hold, HOLD[e.k] ?? 120);
            }
            await sleep(hold * pace);
            setEffects((x) => (x.banner && x.banner.kind !== "end" ? { ...x, banner: null } : x));
        }
        busy.current = false;
        setPlaying(false);
        if (latest.current) setShown(latest.current.view);
    }, [float, attack]);

    useEffect(() => {
        if (!duelId) return;
        const onMessage = (m: DuelServerMessage) => {
            let next = m.state;
            const p = next.prompt;
            // A chain window that doesn't need you: pass it without asking.
            if (p?.kind === "chain" && p.quiet && p.pass !== null && duelPrefs().chain === "auto") {
                conn.current?.answer(next.seq, { kind: "choice", id: p.pass });
                next = { ...next, prompt: null };
            }
            latest.current = next;
            setState(next);
            setAnswered(false);
            queue.current.push(...m.frames);
            if (!queue.current.length && !busy.current) setShown(next.view);
            void play();
        };
        conn.current = connectDuel(duelId, onMessage, setConnected);
        return () => {
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
        setAnswered(true);
    }, []);

    const concede = useCallback(() => conn.current?.concede(), []);

    return {
        state,
        view: shown,
        prompt: playing ? null : (state?.prompt ?? null),
        answered,
        playing,
        connected,
        effects,
        answer,
        concede,
    };
}
