"use client";

import { duelPrefs } from "./duel-prefs";

/*
 * The duel's sound effects, made on the spot with the Web Audio API: tones and filtered noise,
 * so there are no sound files to load (or license). Browsers only start audio after the player
 * has touched the page; until then these are silent.
 */

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
    if (typeof window === "undefined" || !duelPrefs().sound) return null;
    if (!ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
        out = ctx.createGain();
        out.gain.value = 0.5;
        // A gentle limiter, so stacked sounds (a big battle) never clip.
        const limit = ctx.createDynamicsCompressor();
        limit.threshold.value = -10;
        limit.ratio.value = 6;
        out.connect(limit).connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx.state === "running" ? ctx : null;
}

/** Wakes the audio on the first touch (browsers keep it asleep until then). */
export function unlockSound() {
    if (typeof window === "undefined") return;
    const wake = () => {
        audio();
        window.removeEventListener("pointerdown", wake);
        window.removeEventListener("keydown", wake);
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
}

interface ToneOpts { type?: OscillatorType; gain?: number; to?: number; delay?: number; attack?: number }
function tone(freq: number, dur: number, { type = "sine", gain = 0.2, to, delay = 0, attack = 0.005 }: ToneOpts = {}) {
    const a = audio();
    if (!a || !out) return;
    const t = a.currentTime + delay;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
}

interface NoiseOpts { filter?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; delay?: number; attack?: number }
function noise(dur: number, { filter = "bandpass", freq = 1000, to, q = 1, gain = 0.3, delay = 0, attack = 0.005 }: NoiseOpts = {}) {
    const a = audio();
    if (!a || !out) return;
    if (!noiseBuffer) {
        noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + delay;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noiseBuffer;
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
}

export const sfx = {
    /** A card slid off the deck. */
    draw: () => noise(0.14, { freq: 2200, to: 5200, q: 0.8, gain: 0.16, attack: 0.03 }),
    /** A card laid face-down. */
    set: () => {
        noise(0.07, { filter: "lowpass", freq: 1400, gain: 0.3 });
        tone(170, 0.08, { type: "triangle", gain: 0.25, to: 120 });
    },
    /** A monster hits the field: a thud, with a ring of light. */
    summon: () => {
        tone(95, 0.4, { gain: 0.75, to: 42 });
        noise(0.25, { filter: "lowpass", freq: 700, to: 150, gain: 0.35 });
        tone(880, 0.35, { type: "triangle", gain: 0.05, delay: 0.04 });
        tone(1320, 0.3, { type: "triangle", gain: 0.035, delay: 0.07 });
    },
    /** A card or effect is activated: a rising chime. */
    activate: () => {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.42, { type: "triangle", gain: 0.09, delay: i * 0.055 }));
        noise(0.5, { filter: "highpass", freq: 5000, gain: 0.05, attack: 0.1 });
    },
    /** The attacker gathers itself. */
    windup: () => noise(0.22, { freq: 300, to: 900, q: 1.4, gain: 0.18, attack: 0.15 }),
    /** The attacker lunges. */
    whoosh: () => noise(0.18, { freq: 600, to: 3200, q: 1.2, gain: 0.4, attack: 0.04 }),
    /** The blow lands. `heavy` for a direct attack. */
    impact: (heavy = false) => {
        tone(heavy ? 70 : 100, heavy ? 0.7 : 0.45, { gain: 1, to: 30 });
        noise(heavy ? 0.5 : 0.3, { filter: "lowpass", freq: 2200, to: 120, gain: heavy ? 0.9 : 0.65 });
        tone(190, 0.06, { type: "square", gain: 0.12, to: 90 });
    },
    /** A card shatters. */
    shatter: () => {
        noise(0.4, { filter: "highpass", freq: 2600, gain: 0.4 });
        for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 2400, 0.14, { type: "triangle", gain: 0.035, delay: 0.02 + i * 0.035 });
        tone(140, 0.25, { gain: 0.35, to: 60 });
    },
    /** Life points lost. */
    damage: () => tone(320, 0.32, { type: "sawtooth", gain: 0.09, to: 110 }),
    /** Life points gained. */
    heal: () => [660, 880, 1175].forEach((f, i) => tone(f, 0.3, { gain: 0.08, delay: i * 0.07 })),
    /** Life points paid as a cost. */
    pay: () => {
        tone(1250, 0.07, { type: "triangle", gain: 0.08 });
        tone(1650, 0.12, { type: "triangle", gain: 0.08, delay: 0.06 });
    },
    /** A new turn: a low gong (warmer for yours). */
    turn: (mine: boolean) => {
        const base = mine ? 220 : 165;
        tone(base, 1.1, { gain: 0.18, attack: 0.01 });
        tone(base * 1.5, 0.9, { gain: 0.07, delay: 0.01 });
        tone(base * 2.76, 0.6, { gain: 0.03 });
    },
    phase: () => tone(1050, 0.04, { type: "triangle", gain: 0.05 }),
    /** A choice made. */
    click: () => tone(720, 0.05, { type: "triangle", gain: 0.06, to: 860 }),
    /** A question for you. */
    ask: () => tone(990, 0.12, { gain: 0.05 }),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 1.2 : 0.3, { type: "triangle", gain: 0.12, delay: i * 0.12 })),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i === 3 ? 1.1 : 0.32, { type: "triangle", gain: 0.1, delay: i * 0.2 })),
};
