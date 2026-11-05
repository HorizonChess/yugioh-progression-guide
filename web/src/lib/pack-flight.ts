import { gsap } from "gsap";

/**
 * The timeline hands its pack to the pack screen in one unbroken move. On the tap,
 * a copy of the pack art lifts off the timeline (on <body>, so it outlives the
 * page change) and glides toward the middle of the screen while the pack screen
 * loads; the pack screen then lands it on its own pack, which takes over.
 */
type Flight = { index: number; el: HTMLElement; started: number; tween?: gsap.core.Animation; timer: ReturnType<typeof setTimeout> };
let flight: Flight | null = null;

const clear = () => {
    if (!flight) return;
    flight.tween?.kill();
    clearTimeout(flight.timer);
    flight.el.remove();
    flight = null;
};

/** Lifts set `index`'s pack art off the timeline and starts it toward centre stage. */
export function launchFlight(index: number) {
    clear();
    const art = document.querySelector<HTMLElement>(`#set-${index} .timeline-node__art, #set-${index} .road-stop__art`);
    const img = art?.querySelector("img");
    if (!art || !img?.currentSrc) return;
    const r = art.getBoundingClientRect();
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, {
        position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px",
        zIndex: "400", pointerEvents: "none", filter: "drop-shadow(0 26px 30px rgba(0,0,0,.7))",
    });
    const copy = document.createElement("img");
    copy.src = img.currentSrc;
    Object.assign(copy.style, { width: "100%", height: "100%", objectFit: "contain", display: "block" });
    el.appendChild(copy);
    document.body.appendChild(el);
    // Head for roughly where the pack screen will show it; landFlight corrects the last stretch.
    const h = Math.min(innerHeight * 0.5, 460), w = (h * r.width) / r.height;
    const tween = gsap.to(el, { left: innerWidth / 2 - w / 2, top: innerHeight * 0.47 - h / 2, width: w, height: h, duration: 0.7, ease: "power2.inOut" });
    flight = { index, el, started: performance.now(), tween, timer: setTimeout(clear, 10000) };
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
    f.tween?.kill();
    clearTimeout(f.timer);
    target.style.visibility = "hidden";
    const from = f.el.getBoundingClientRect(), p = { t: 0 };
    // Show the real pack under the copy, then lift the copy off a couple of frames
    // later, so the swap never shows an empty frame.
    const swap = () => {
        target.style.visibility = "";
        requestAnimationFrame(() => requestAnimationFrame(() => f.el.remove()));
        if (flight === f) flight = null;
    };
    const reveal = () => {
        const img = target.querySelector("img");
        if (img) void img.decode().catch(() => undefined).then(swap);
        else swap();
    };
    f.tween = gsap.to(p, {
        t: 1, duration: 0.55, ease: "power2.inOut",
        onUpdate: () => {
            const to = target.getBoundingClientRect(), t = p.t;
            Object.assign(f.el.style, {
                left: from.left + (to.left - from.left) * t + "px", top: from.top + (to.top - from.top) * t + "px",
                width: from.width + (to.width - from.width) * t + "px", height: from.height + (to.height - from.height) * t + "px",
            });
        },
        onComplete: reveal,
    });
    f.timer = setTimeout(reveal, 2000);
    // Unmounted mid-landing: put the pack back in flight, so a remount (React's
    // dev mode mounts twice) lands it again; otherwise it drops soon after.
    return () => {
        f.tween?.kill();
        clearTimeout(f.timer);
        target.style.visibility = "";
        if (!f.el.isConnected) return;
        flight = f;
        f.timer = setTimeout(clear, 1000);
    };
}
