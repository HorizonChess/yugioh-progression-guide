import { gsap } from "gsap";

/**
 * The timeline hands its pack to the pack screen in one unbroken move. On the tap,
 * a copy of the pack art lifts off the timeline (on <body>, so it outlives the
 * page change) and glides toward the middle of the screen while the pack screen
 * loads. When the pack screen mounts it hands over its own pack as the target, and
 * the same glide bends onto it (no stop and restart); the real pack then takes over.
 */
type Box = { left: number; top: number; width: number; height: number };
type Flight = {
    index: number;
    el: HTMLElement;
    from: Box;
    /** Where the copy heads before the pack screen exists (then, where its pack last was). */
    guess: Box;
    p: { t: number };
    tween?: gsap.core.Animation;
    timer: ReturnType<typeof setTimeout>;
    target?: HTMLElement;
    /** Glide progress when the target arrived: the path bends from the guess to it over the rest. */
    joinedAt: number;
    onLand?: () => void;
};
let flight: Flight | null = null;

const DURATION = 0.8;
const mix = (a: Box, b: Box, k: number): Box => ({
    left: a.left + (b.left - a.left) * k, top: a.top + (b.top - a.top) * k,
    width: a.width + (b.width - a.width) * k, height: a.height + (b.height - a.height) * k,
});
const boxOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
};
const smooth = (k: number) => k * k * (3 - 2 * k);

const clear = () => {
    if (!flight) return;
    flight.tween?.kill();
    clearTimeout(flight.timer);
    flight.el.remove();
    flight = null;
};

function place(f: Flight) {
    let dest = f.guess;
    if (f.target) {
        const k = f.joinedAt >= 1 ? 1 : Math.max(0, Math.min(1, (f.p.t - f.joinedAt) / (1 - f.joinedAt)));
        dest = mix(f.guess, boxOf(f.target), smooth(k));
    }
    const at = mix(f.from, dest, gsap.parseEase("power2.inOut")(f.p.t));
    Object.assign(f.el.style, { left: at.left + "px", top: at.top + "px", width: at.width + "px", height: at.height + "px" });
}

/** Whether a pack is on its way to the pack screen (which then shouldn't slide in under it). */
export const packInFlight = () => flight !== null;

/** Lifts set `index`'s pack art off the timeline and starts it toward centre stage. */
export function launchFlight(index: number) {
    clear();
    const art = document.querySelector<HTMLElement>(`#set-${index} .timeline-node__art, #set-${index} .road-stop__art`);
    const img = art?.querySelector("img");
    if (!art || !img?.currentSrc) return;
    const from = boxOf(art);
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
        position: "fixed", left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px",
        zIndex: "400", pointerEvents: "none", filter: "drop-shadow(0 26px 30px rgba(0,0,0,.7))",
    });
    const copy = document.createElement("img");
    copy.src = img.currentSrc;
    Object.assign(copy.style, { width: "100%", height: "100%", objectFit: "contain", display: "block" });
    el.appendChild(copy);
    document.body.appendChild(el);
    // Head for roughly where the pack screen will show it; the real target bends the path onto itself.
    const h = Math.min(innerHeight * 0.5, 460), w = (h * from.width) / from.height;
    const guess = { left: innerWidth / 2 - w / 2, top: innerHeight * 0.47 - h / 2, width: w, height: h };
    const f: Flight = { index, el, from, guess, p: { t: 0 }, joinedAt: 0, timer: setTimeout(clear, 10000) };
    f.tween = gsap.to(f.p, {
        t: 1, duration: DURATION, ease: "none",
        onUpdate: () => place(f),
        onComplete: () => f.onLand?.(),
    });
    flight = f;
}

/**
 * Lands the flying pack on `target` (tracking it as the page settles) and reveals
 * the target. Returns a cleanup that ends the landing at once, or null when set
 * `index` has no pack in flight.
 */
export function landFlight(index: number, target: HTMLElement): (() => void) | null {
    if (!flight || flight.index !== index) {
        clear();
        return null;
    }
    const f = flight;
    clearTimeout(f.timer);
    target.style.visibility = "hidden";
    f.target = target;
    // Show the real pack under the copy, then lift the copy off a couple of frames
    // later, so the swap never shows an empty frame.
    const swap = () => {
        if (f.target !== target) return;
        target.style.visibility = "";
        requestAnimationFrame(() => requestAnimationFrame(() => f.el.remove()));
        if (flight === f) flight = null;
    };
    const reveal = () => {
        const img = target.querySelector("img");
        if (img) void img.decode().catch(() => undefined).then(swap);
        else swap();
    };
    f.onLand = reveal;
    if (f.p.t >= 1) {
        // The glide already ended at the guess (a slow load): a short, gentle settle onto the pack.
        f.from = boxOf(f.el);
        f.guess = f.from;
        f.joinedAt = 1;
        f.p.t = 0;
        f.tween = gsap.to(f.p, { t: 1, duration: 0.3, ease: "none", onUpdate: () => place(f), onComplete: reveal });
    } else {
        f.joinedAt = f.p.t;
    }
    f.timer = setTimeout(reveal, 2500);
    // Unmounted mid-landing: put the pack back in flight toward where this target
    // was, so a remount (React's dev mode mounts twice) lands it again; otherwise it
    // drops soon after.
    return () => {
        clearTimeout(f.timer);
        target.style.visibility = "";
        if (f.target === target) {
            f.guess = boxOf(target);
            f.target = undefined;
            f.onLand = undefined;
        }
        if (!f.el.isConnected) return;
        flight = f;
        f.timer = setTimeout(clear, 1000);
    };
}
