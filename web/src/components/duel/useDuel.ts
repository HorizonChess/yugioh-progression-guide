"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DuelAnswer, DuelEvent, DuelFrame, DuelServerMessage, DuelState, DuelView, Side } from "@ygo/shared";
import { connectDuel, type DuelConnection } from "@/lib/duel-client";

/*
 * A live duel on screen. The server sends frames (events, then the field after them); they're
 * played one at a time, so a chain or a battle reads as it happens, and the question waiting
 * at the end only appears once the board has caught up.
 */

export type Banner = { key: number; kind: "activate"; code: number; side: Side; link: number } | { key: number; kind: "turn"; side: Side; turn: number } | { key: number; kind: "end"; text: string };
export type Float = { key: number; side?: Side; uid?: string; text: string; tone: "up" | "down" };
export interface Effects {
    destroying: string[];
    banner: Banner | null;
    floats: Float[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let key = 0;

/** How long each kind of event holds the board, in ms. */
const HOLD: Partial<Record<DuelEvent["k"], number>> = {
    activate: 1050, turn: 850, destroyed: 480, damage: 650, pay: 500, recover: 500, summon: 420, move: 300, draw: 260, set: 260, reposition: 320, win: 400, resolved: 220, negated: 600,
};

export function useDuel(duelId: string | null, onEvent?: (e: DuelEvent, view: DuelView) => void) {
    const [state, setState] = useState<DuelState | null>(null);
    const [shown, setShown] = useState<DuelView | null>(null);
    const [playing, setPlaying] = useState(false);
    const [connected, setConnected] = useState(true);
    const [effects, setEffects] = useState<Effects>({ destroying: [], banner: null, floats: [] });
    const queue = useRef<DuelFrame[]>([]);
    const busy = useRef(false);
    const latest = useRef<DuelState | null>(null);
    const conn = useRef<DuelConnection | null>(null);
    const onEventRef = useRef(onEvent);
    useEffect(() => {
        onEventRef.current = onEvent;
    });

    const float = useCallback((f: Omit<Float, "key">) => {
        const k = ++key;
        setEffects((e) => ({ ...e, floats: [...e.floats, { ...f, key: k }] }));
        setTimeout(() => setEffects((e) => ({ ...e, floats: e.floats.filter((x) => x.key !== k) })), 1400);
    }, []);

    /** The attacker leaps at its target (or the rival's side) and back. */
    const lunge = useCallback(async (attacker?: string, target?: string, side?: Side) => {
        const el = attacker && document.querySelector<HTMLElement>(`[data-uid="${attacker}"] .df-card__lunge`);
        const goal = target ? document.querySelector<HTMLElement>(`[data-uid="${target}"]`) : document.querySelector<HTMLElement>(side === "me" ? ".df-lp--opp" : ".df-lp--me");
        if (!el || !goal) return;
        const a = el.getBoundingClientRect(), b = goal.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        await el.animate(
            [
                { transform: "translate(0,0) scale(1)" },
                { transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.12)`, offset: 0.3 },
                { transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(1.2)`, offset: 0.62 },
                { transform: "translate(0,0) scale(1)" },
            ],
            { duration: 680, easing: "cubic-bezier(.3,.7,.3,1)" },
        ).finished.catch(() => undefined);
    }, []);

    const play = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        setPlaying(true);
        while (queue.current.length) {
            const frame = queue.current.shift()!;
            // Far behind (a reconnect, a long bot turn): play quickly.
            const pace = queue.current.length > 25 ? 0.25 : 1;
            let hold = 0;
            for (const e of frame.events) {
                if (e.k === "attack") await lunge(e.attacker, e.target, e.side);
                if (e.k === "destroyed") {
                    setEffects((x) => ({ ...x, destroying: [...x.destroying, e.uid] }));
                    await sleep(480 * pace);
                }
            }
            setShown(frame.view);
            setEffects((x) => ({ ...x, destroying: x.destroying.filter((u) => !frame.events.some((e) => e.k === "destroyed" && e.uid === u)) }));
            for (const e of frame.events) {
                onEventRef.current?.(e, frame.view);
                if (e.k === "activate") setEffects((x) => ({ ...x, banner: { key: ++key, kind: "activate", code: e.code, side: e.side, link: e.link } }));
                if (e.k === "turn") setEffects((x) => ({ ...x, banner: { key: ++key, kind: "turn", side: e.side, turn: e.turn } }));
                if (e.k === "damage" || e.k === "pay") float({ side: e.side, text: `−${e.amount}`, tone: "down" });
                if (e.k === "recover") float({ side: e.side, text: `+${e.amount}`, tone: "up" });
                if (e.k !== "destroyed") hold = Math.max(hold, HOLD[e.k] ?? 120);
            }
            await sleep(hold * pace);
            setEffects((x) => (x.banner && x.banner.kind !== "end" ? { ...x, banner: null } : x));
        }
        busy.current = false;
        setPlaying(false);
        if (latest.current) setShown(latest.current.view);
    }, [float, lunge]);

    useEffect(() => {
        if (!duelId) return;
        const onMessage = (m: DuelServerMessage) => {
            latest.current = m.state;
            setState(m.state);
            queue.current.push(...m.frames);
            if (!queue.current.length && !busy.current) setShown(m.state.view);
            void play();
        };
        conn.current = connectDuel(duelId, onMessage, setConnected);
        return () => {
            conn.current?.close();
            conn.current = null;
        };
    }, [duelId, play]);

    /** Answers the question on screen (once: the prompt hides until the server replies). */
    const answer = useCallback((a: DuelAnswer) => {
        const s = latest.current;
        if (!s?.prompt) return;
        conn.current?.answer(s.seq, a);
        const asked = { ...s, prompt: null };
        latest.current = asked;
        setState(asked);
    }, []);

    const concede = useCallback(() => conn.current?.concede(), []);

    return {
        state,
        view: shown,
        prompt: playing ? null : (state?.prompt ?? null),
        playing,
        connected,
        effects,
        answer,
        concede,
    };
}
