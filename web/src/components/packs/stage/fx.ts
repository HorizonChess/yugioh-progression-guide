/** Sound and particles for the pack stage. Every sound is synthesised: there are no audio files. */

export type Tier = "Common" | "Rare" | "Super" | "Ultra" | "Secret";

const SOUND_KEY = "ygo-pack-sound";

export function soundOn(): boolean {
    try {
        return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
        return true;
    }
}

export function setSoundOn(on: boolean) {
    try {
        localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
        /* private mode: the choice just isn't remembered */
    }
}

const KEYS_KEY = "ygo-guide-keys";

/** Yugi's typewriter keys, on their own switch under Sound in the menu's Options. */
export function keysOn(): boolean {
    try {
        return localStorage.getItem(KEYS_KEY) !== "off";
    } catch {
        return true;
    }
}

export function setKeysOn(on: boolean) {
    try {
        localStorage.setItem(KEYS_KEY, on ? "on" : "off");
    } catch {
        /* private mode: the choice just isn't remembered */
    }
}

let ctx: AudioContext | undefined, master: GainNode, noise: AudioBuffer;

function init() {
    if (ctx) {
        if (ctx.state === "suspended") void ctx.resume();
        return true;
    }
    try {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return true;
    } catch {
        return false;
    }
}

function nz(c: AudioContext, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number) {
    const s = c.createBufferSource();
    s.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
}

function tone(c: AudioContext, t: number, freq: number, dur: number, type: OscillatorType, vol: number) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
}

const play = (fn: (c: AudioContext, t: number) => void) => {
    if (soundOn() && init() && ctx) fn(ctx, ctx.currentTime);
};
const CHORDS: Partial<Record<Tier, number[]>> = { Rare: [880, 1318], Super: [659, 988, 1318], Ultra: [523, 659, 784, 1047, 1568], Secret: [587, 740, 880, 1175, 1480, 1760] };

export const Sfx = {
    unlock: () => soundOn() && init(),
    /** One typewriter key: a sharp click of the type bar, then the softer thock of the key bottoming out. Each press varies a little. */
    key: () => keysOn() && play((c, t) => {
        const v = 0.85 + Math.random() * 0.3;
        nz(c, t, 0.012, "highpass", 4200 * v, 6000 * v, 0.8, 0.32);
        nz(c, t + 0.006, 0.045, "bandpass", 1500 * v, 700 * v, 2.2, 0.38);
        tone(c, t + 0.004, 170 * v, 0.03, "triangle", 0.05);
    }),
    crinkle: () => play((c, t) => nz(c, t, 0.05 + Math.random() * 0.04, "highpass", 3000 + Math.random() * 3000, 5200, 1, 0.22)),
    tear: () => play((c, t) => {
        for (let i = 0; i < 7; i++) nz(c, t + i * 0.034, 0.06, "bandpass", 2500 + Math.random() * 4000, 1800, 1.5, 0.5);
        nz(c, t, 0.25, "lowpass", 900, 200, 1, 0.35);
    }),
    flip: () => play((c, t) => nz(c, t, 0.16, "bandpass", 700, 3200, 2, 0.45)),
    deal: () => play((c, t) => {
        nz(c, t, 0.07, "bandpass", 3200, 1500, 1.2, 0.4);
        nz(c, t + 0.06, 0.05, "lowpass", 420, 120, 1, 0.3);
    }),
    thump: () => play((c, t) => {
        tone(c, t, 90, 0.35, "sine", 0.6);
        nz(c, t, 0.12, "lowpass", 500, 80, 1, 0.4);
    }),
    whoosh: () => play((c, t) => nz(c, t, 0.38, "bandpass", 300, 2400, 1.2, 0.3)),
    rise: (d = 0.8) => play((c, t) => {
        const o = tone(c, t, 180, d, "sawtooth", 0.07);
        o.frequency.exponentialRampToValueAtTime(760, t + d);
        nz(c, t, d, "bandpass", 400, 3200, 4, 0.14);
    }),
    reveal: (r: Tier) => play((c, t) => {
        (CHORDS[r] ?? []).forEach((f, i) => {
            tone(c, t + i * 0.07, f, 1.3, "triangle", 0.17);
            tone(c, t + i * 0.07, f * 2, 0.6, "sine", 0.05);
        });
        if (r === "Ultra" || r === "Secret") {
            tone(c, t, 65, 0.9, "sine", 0.5);
            nz(c, t, 0.6, "lowpass", 800, 100, 1, 0.3);
        }
        if (r === "Secret") for (let i = 0; i < 12; i++) tone(c, t + 0.3 + i * 0.055, 2000 + Math.random() * 2600, 0.25, "sine", 0.045);
    }),
};

export const buzz = (p: number | number[]) => {
    try {
        navigator.vibrate?.(p);
    } catch {
        /* no vibration here */
    }
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; decay: number; size: number; c: string; spark: boolean };
const PAL: Record<string, string[]> = {
    Rare: ["#ffffff", "#dfe6ff", "#b9c6ff"],
    Super: ["#ffffff", "#9be3ff", "#4fc3ff"],
    Ultra: ["#ffffff", "#fff2b0", "#ffcc33", "#ffa41b"],
    Secret: ["#ffffff", "#ff6ad5", "#ffe066", "#5cf2ff", "#a78bfa"],
};

/** Sparks on a full-window canvas, in window coordinates. */
export function createParticles() {
    const cv = document.createElement("canvas");
    cv.className = "ps-fx";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    const g = cv.getContext("2d")!;
    let ps: Particle[] = [], raf = 0;
    const size = () => {
        const d = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = innerWidth * d;
        cv.height = innerHeight * d;
        g.setTransform(d, 0, 0, d, 0, 0);
    };
    size();
    addEventListener("resize", size);
    const tick = () => {
        g.clearRect(0, 0, innerWidth, innerHeight);
        g.globalCompositeOperation = "lighter";
        ps = ps.filter((p) => p.life > 0);
        for (const p of ps) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.985;
            p.vy = p.vy * 0.985 + 0.06;
            p.life -= p.decay;
            g.globalAlpha = Math.max(0, p.life);
            g.fillStyle = p.c;
            if (p.spark) {
                g.save();
                g.translate(p.x, p.y);
                g.rotate(p.life * 6);
                g.fillRect(-p.size * 1.7, -p.size * 0.22, p.size * 3.4, p.size * 0.44);
                g.fillRect(-p.size * 0.22, -p.size * 1.7, p.size * 0.44, p.size * 3.4);
                g.restore();
            } else {
                g.beginPath();
                g.arc(p.x, p.y, p.size, 0, 7);
                g.fill();
            }
        }
        g.globalAlpha = 1;
        raf = ps.length ? requestAnimationFrame(tick) : 0;
    };
    const run = () => {
        if (!raf) raf = requestAnimationFrame(tick);
    };
    return {
        burst(x: number, y: number, r: string, n: number, up = false) {
            const pal = PAL[r] ?? PAL.Rare!;
            for (let i = 0; i < n; i++) {
                const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.4 : Math.random() * Math.PI * 2;
                const s = (up ? 3 : 2) + Math.random() * (up ? 6 : 7);
                ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.008 + Math.random() * 0.018, size: 1.5 + Math.random() * 3.2, c: pal[i % pal.length]!, spark: Math.random() < 0.35 });
            }
            run();
        },
        trail(x: number, y: number) {
            const pal = PAL.Ultra!;
            ps.push({ x, y, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8 - 0.4, life: 0.8, decay: 0.03 + Math.random() * 0.02, size: 1 + Math.random() * 2, c: pal[1 + Math.floor(Math.random() * 3)]!, spark: Math.random() < 0.2 });
            run();
        },
        destroy() {
            cancelAnimationFrame(raf);
            removeEventListener("resize", size);
            cv.remove();
        },
    };
}
