"use client";

import { duelPrefs } from "./duel-prefs";

/*
 * The duel's sound, made on the spot with the Web Audio API (no sound files to load or license).
 * The palette is the duel disk's: holographic projection (resonant filter sweeps over detuned
 * saws, digital glitches, glassy FM shimmer) in a small reverberant room, with physical weight
 * underneath (card slides, thuds) so it doesn't turn into generic beeps. Browsers only start
 * audio after the player has touched the page; until then these are silent.
 */

let ctx: AudioContext | null = null;
/** Dry output, and a send into the room's reverb. */
let dry: GainNode | null = null;
let wet: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
    if (typeof window === "undefined" || !duelPrefs().sound) return null;
    if (!ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
        const master = ctx.createGain();
        master.gain.value = 0.5;
        const limit = ctx.createDynamicsCompressor();
        limit.threshold.value = -12;
        limit.ratio.value = 5;
        master.connect(limit).connect(ctx.destination);
        dry = ctx.createGain();
        dry.connect(master);
        // The room: a short stereo tail, made from decaying noise.
        const room = ctx.createConvolver();
        const len = Math.floor(ctx.sampleRate * 1.6);
        const ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
        }
        room.buffer = ir;
        wet = ctx.createGain();
        wet.gain.value = 0.3;
        wet.connect(room).connect(master);
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

// ---- building blocks ------------------------------------------------------------------------

/** An envelope into the mix: `room` is how much goes to the reverb. */
function amp(a: AudioContext, t: number, peak: number, attack: number, dur: number, room = 0.2) {
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dry!);
    if (room > 0) {
        const send = a.createGain();
        send.gain.value = room;
        g.connect(send).connect(wet!);
    }
    return g;
}

interface Osc { type?: OscillatorType; to?: number; detune?: number; gain?: number; attack?: number; room?: number; delay?: number; filter?: { type: BiquadFilterType; from: number; to?: number; q?: number } }
function osc(freq: number, dur: number, o: Osc = {}) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (o.delay ?? 0);
    const v = a.createOscillator();
    v.type = o.type ?? "sine";
    v.frequency.setValueAtTime(freq, t);
    if (o.to) v.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.detune) v.detune.value = o.detune;
    let node: AudioNode = v;
    if (o.filter) {
        const f = a.createBiquadFilter();
        f.type = o.filter.type;
        f.Q.value = o.filter.q ?? 1;
        f.frequency.setValueAtTime(o.filter.from, t);
        if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + dur);
        node = v.connect(f);
    }
    node.connect(amp(a, t, o.gain ?? 0.15, o.attack ?? 0.005, dur, o.room));
    v.start(t);
    v.stop(t + dur + 0.05);
}

interface Noise { filter?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; delay?: number; attack?: number; room?: number }
function noise(dur: number, o: Noise = {}) {
    const a = audio();
    if (!a) return;
    if (!noiseBuffer) {
        noiseBuffer = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + (o.delay ?? 0);
    const src = a.createBufferSource(), f = a.createBiquadFilter();
    src.buffer = noiseBuffer;
    f.type = o.filter ?? "bandpass";
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    src.connect(f).connect(amp(a, t, o.gain ?? 0.2, o.attack ?? 0.004, dur, o.room ?? 0.1));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
}

/** A glassy FM tone: a carrier shaken by a modulator; inharmonic ratios ring like metal. */
function bell(freq: number, dur: number, { ratio = 1.4, index = 2.5, gain = 0.08, delay = 0, room = 0.45 } = {}) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + delay;
    const car = a.createOscillator(), mod = a.createOscillator(), depth = a.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    depth.gain.setValueAtTime(freq * index, t);
    depth.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur);
    mod.connect(depth).connect(car.frequency);
    car.connect(amp(a, t, gain, 0.003, dur, room));
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
}

/** The duel disk's projector: detuned saws through a resonant filter that sweeps open (or shut). */
function projector(from: number, to: number, dur: number, { gain = 0.07, delay = 0, q = 9 } = {}) {
    for (const detune of [-9, 0, 8]) osc(110, dur, { type: "sawtooth", detune, gain, attack: 0.04, delay, room: 0.35, filter: { type: "lowpass", from, to, q } });
}

/** Digital crackle: tiny square bursts at random pitches. */
function glitch(count: number, span: number, { delay = 0, gain = 0.025 } = {}) {
    for (let i = 0; i < count; i++) {
        osc(1800 + Math.random() * 3800, 0.018, { type: "square", gain, delay: delay + (i / count) * span + Math.random() * 0.02, room: 0.15 });
    }
}

/** A card's own sound: the snap of card stock. */
const snap = (delay = 0, gain = 0.22) => noise(0.03, { filter: "highpass", freq: 3200, gain, delay, room: 0.05 });

// ---- the sounds ---------------------------------------------------------------------------

export const sfx = {
    /** A card slides off the deck and snaps into the hand. */
    draw: () => {
        noise(0.16, { freq: 1800, to: 4200, q: 0.7, gain: 0.12, attack: 0.05 });
        snap(0.14, 0.12);
    },
    /** A deck riffled and squared: a run of card ticks, then a tap. */
    shuffle: () => {
        for (let i = 0; i < 22; i++) noise(0.012, { filter: "bandpass", freq: 2600 + Math.random() * 1600, q: 2, gain: 0.07 + Math.random() * 0.05, delay: i * 0.021 + Math.random() * 0.006, room: 0.05 });
        noise(0.05, { filter: "lowpass", freq: 900, gain: 0.25, delay: 0.5, room: 0.05 });
        snap(0.52, 0.12);
    },
    /** You pick a card up: a small rising holographic tick. */
    pickUp: () => {
        bell(1320, 0.12, { ratio: 2.01, index: 0.8, gain: 0.05, room: 0.2 });
        bell(1980, 0.1, { ratio: 2.01, index: 0.6, gain: 0.035, delay: 0.045, room: 0.2 });
    },
    putDown: () => {
        bell(1650, 0.1, { ratio: 2.01, index: 0.6, gain: 0.04, room: 0.15 });
        bell(1100, 0.12, { ratio: 2.01, index: 0.8, gain: 0.035, delay: 0.04, room: 0.15 });
    },
    /** A monster is projected onto the field: the sweep opens, it crackles into being, lands, and shimmers. */
    summon: () => {
        projector(180, 3200, 0.5);
        noise(0.45, { filter: "highpass", freq: 2500, to: 7000, gain: 0.05, attack: 0.3, room: 0.3 });
        glitch(7, 0.28, { delay: 0.05 });
        osc(80, 0.42, { to: 38, gain: 0.55, delay: 0.3, room: 0.05 });
        snap(0.3, 0.18);
        [1318.5, 1975.5, 2637].forEach((f, i) => bell(f, 0.9, { ratio: 1.0, index: 0.4, gain: 0.03, delay: 0.32 + i * 0.03 }));
    },
    /** A monster turns up from face-down (Flip Summon): the card flips, then the projection catches. */
    flip: () => {
        noise(0.09, { freq: 900, to: 2600, q: 1.2, gain: 0.14 });
        snap(0.08, 0.18);
        projector(400, 2600, 0.32, { delay: 0.08, gain: 0.05 });
        bell(1568, 0.6, { ratio: 1.0, index: 0.3, gain: 0.03, delay: 0.25 });
    },
    /** A card goes down face-down: the projection closes over it, darker. */
    set: () => {
        projector(2400, 260, 0.3, { gain: 0.05, q: 6 });
        snap(0.02, 0.2);
        osc(150, 0.16, { type: "triangle", to: 95, gain: 0.22, delay: 0.18, room: 0.05 });
    },
    /** A card or effect activates: the card flips up and its power rings out. */
    activate: () => {
        noise(0.12, { freq: 700, to: 3200, q: 1, gain: 0.12 });
        snap(0.1, 0.15);
        bell(880, 1.1, { ratio: 1.41, index: 3, gain: 0.07, delay: 0.1 });
        bell(1318.5, 0.9, { ratio: 1.41, index: 2, gain: 0.04, delay: 0.16 });
        noise(0.7, { filter: "highpass", freq: 6000, gain: 0.03, attack: 0.25, delay: 0.1, room: 0.5 });
    },
    /** Another link joins the chain: metal links clinking. */
    chainLink: (link: number) => {
        for (let i = 0; i < Math.min(3, link); i++) bell(2100 + i * 230, 0.35, { ratio: 2.76, index: 1.6, gain: 0.05, delay: i * 0.07, room: 0.3 });
    },
    /** The attacker gathers power: a rising, trembling charge. */
    windup: () => {
        const a = audio();
        if (!a) return;
        const t = a.currentTime;
        const v = a.createOscillator(), lfo = a.createOscillator(), wob = a.createGain(), f = a.createBiquadFilter();
        v.type = "sawtooth";
        v.frequency.setValueAtTime(70, t);
        v.frequency.exponentialRampToValueAtTime(210, t + 0.36);
        f.type = "lowpass";
        f.Q.value = 8;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2200, t + 0.36);
        lfo.frequency.value = 14;
        wob.gain.value = 0.5;
        const g = amp(a, t, 0.09, 0.2, 0.4, 0.2);
        const trem = a.createGain();
        trem.gain.value = 0.6;
        lfo.connect(wob).connect(trem.gain);
        v.connect(f).connect(trem).connect(g);
        v.start(t);
        lfo.start(t);
        v.stop(t + 0.45);
        lfo.stop(t + 0.45);
    },
    /** The lunge. */
    whoosh: () => noise(0.17, { freq: 500, to: 3600, q: 1.4, gain: 0.32, attack: 0.05, room: 0.15 }),
    /** The blow lands. `heavy`: a direct attack. */
    impact: (heavy = false) => {
        osc(heavy ? 62 : 85, heavy ? 0.8 : 0.5, { to: 28, gain: 0.9, room: 0.25 });
        osc(heavy ? 124 : 170, 0.12, { type: "square", to: 60, gain: 0.12, room: 0.1 });
        noise(heavy ? 0.6 : 0.35, { filter: "lowpass", freq: 3000, to: 150, gain: heavy ? 0.6 : 0.45, room: 0.4 });
        glitch(heavy ? 6 : 3, 0.12, { delay: 0.02, gain: 0.03 });
    },
    /** A card shatters: glass, and the hologram breaking up. */
    shatter: () => {
        noise(0.35, { filter: "highpass", freq: 3000, gain: 0.28, room: 0.3 });
        for (let i = 0; i < 8; i++) bell(2400 + Math.random() * 2600, 0.25, { ratio: 2.76 + Math.random(), index: 1.2, gain: 0.025, delay: 0.015 + i * 0.03, room: 0.35 });
        projector(2600, 200, 0.4, { gain: 0.035, delay: 0.05, q: 4 });
    },
    /** Life points count down (or up): the counter's quick ticking, for as long as it runs. */
    lpCount: (ms = 700, down = true) => {
        const ticks = Math.floor(ms / 42);
        for (let i = 0; i < ticks; i++) osc(down ? 1500 - i * 18 : 1100 + i * 18, 0.014, { type: "square", gain: 0.03, delay: i * 0.042, room: 0.05 });
    },
    /** Life points lost: a falling zap. */
    damage: () => {
        osc(900, 0.28, { type: "sawtooth", to: 140, gain: 0.07, filter: { type: "lowpass", from: 4000, to: 500, q: 6 }, room: 0.25 });
    },
    /** Life points gained: a rising sparkle. */
    heal: () => [988, 1318.5, 1760, 2349].forEach((f, i) => bell(f, 0.5, { ratio: 1.0, index: 0.5, gain: 0.04, delay: i * 0.06 })),
    /** Life points paid as a cost: a coin-like double ping. */
    pay: () => {
        bell(1975.5, 0.25, { ratio: 3.5, index: 0.8, gain: 0.05 });
        bell(2637, 0.35, { ratio: 3.5, index: 0.8, gain: 0.05, delay: 0.07 });
    },
    /** A new turn: a deep gong (brighter for yours). */
    turn: (mine: boolean) => {
        bell(mine ? 110 : 98, 2.2, { ratio: 1.4, index: 3.5, gain: 0.16, room: 0.6 });
        bell(mine ? 220 : 147, 1.6, { ratio: 2.76, index: 1, gain: 0.04, room: 0.6 });
    },
    /** A phase changes: a short digital chirp. */
    phase: () => {
        osc(1200, 0.05, { to: 1900, gain: 0.04, room: 0.1 });
        osc(1600, 0.05, { to: 2400, gain: 0.03, delay: 0.06, room: 0.1 });
    },
    /** A choice made: a tactile tick. */
    click: () => noise(0.02, { filter: "bandpass", freq: 3200, q: 3, gain: 0.12, room: 0 }),
    /** A question for you: two soft holographic notes. */
    ask: () => {
        bell(1318.5, 0.4, { ratio: 1.0, index: 0.6, gain: 0.04 });
        bell(1760, 0.5, { ratio: 1.0, index: 0.6, gain: 0.04, delay: 0.09 });
    },
    win: () => {
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => bell(f, i === 3 ? 2 : 0.5, { ratio: 1.0, index: 1.2, gain: 0.08, delay: i * 0.14, room: 0.5 }));
        projector(200, 4000, 1.2, { gain: 0.04, delay: 0.42 });
    },
    lose: () => {
        [392, 349.2, 311.1, 261.6].forEach((f, i) => bell(f, i === 3 ? 1.8 : 0.5, { ratio: 1.41, index: 1.5, gain: 0.07, delay: i * 0.24, room: 0.5 }));
        projector(1800, 120, 1.4, { gain: 0.04, delay: 0.5, q: 5 });
    },
};
