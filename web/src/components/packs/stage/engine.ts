import { gsap } from "gsap";
import { buzz, createParticles, Sfx, type Tier } from "./fx";
import { plate, TIER_LABEL, type StageCard } from "./plate";

/**
 * The pack-opening stage, driven by hand (GSAP) rather than by React, since it is
 * one long choreography. Phones tear the pack and swirl its cards onto a ring you
 * turn with a swipe; wider screens drop the pack on a duel mat and deal the cards
 * into slots. Rares glow face down and get rays, a flash and a banner when they
 * turn. Face-up cards show their details as a plate styled like the card: beside
 * the card on hover (mouse), or in a close-up on tap.
 *
 * The stage reports each newly face-up card through `onFlip`, so the page can save
 * it and resume a reload; cards already in `flipped` start face up.
 */
export type StageOptions = {
    cards: StageCard[];
    packArt: string;
    packName: string;
    cardBack: string;
    /** Cards of this pack already face up (a resumed opening skips the tear). */
    flipped: number[];
    phone: boolean;
    onFlip: (index: number) => void;
    /** The cards are out and can be flipped. */
    onReady: () => void;
    onAllFlipped: () => void;
    /** Marks to look at later: the close-up gets a toggle for its card. */
    marks?: { has: (cardId: number) => boolean; set: (cardId: number, on: boolean) => void };
};

export type PackStage = { flipAll: () => void; spin: (dir: 1 | -1) => void; destroy: () => void };

const ASPECT = 813 / 1185; // card width / height
const PACK_ASPECT = 400 / 733;

const GLYPHS = (() => {
    const ankh = "M0,-9 a4,5 0 1,1 .01,0 M0,-4 L0,9 M-5,0 L5,0";
    const eye = "M-7,0 Q0,-6 7,0 Q0,6 -7,0 Z M-2,0 a2,2 0 1,0 4,0 a2,2 0 1,0 -4,0";
    let g = "";
    for (let i = 0; i < 16; i++) g += `<path transform="rotate(${i * 22.5}) translate(0,-78)" d="${i % 2 ? ankh : eye}"/>`;
    return `<svg viewBox="-100 -100 200 200" fill="none" stroke="#ffe08a" stroke-width="2" stroke-linecap="round">` +
        `<circle r="92" stroke-opacity=".6"/><circle r="64" stroke-dasharray="3 6" stroke-opacity=".7"/>${g}</svg>`;
})();

export function createPackStage(stage: HTMLElement, o: StageOptions): PackStage {
    let alive = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
        const t = setTimeout(() => {
            timers.delete(t);
            if (alive) fn();
        }, ms);
        timers.add(t);
    };
    const anims: gsap.core.Animation[] = [];
    const to = (t: gsap.TweenTarget, v: gsap.TweenVars) => (anims.push(gsap.to(t, v)), anims[anims.length - 1]!);
    const fromTo = (t: gsap.TweenTarget, a: gsap.TweenVars, b: gsap.TweenVars) => anims.push(gsap.fromTo(t, a, b));
    const outside: HTMLElement[] = []; // overlays on <body>
    const toBody = <E extends HTMLElement>(el: E) => (document.body.appendChild(el), outside.push(el), el);
    const fx = createParticles();
    // Every listener the stage adds goes when it does (dev mode mounts it twice).
    const ac = new AbortController();
    const signal = ac.signal;

    const W = stage.clientWidth, H = stage.clientHeight, n = o.cards.length;
    const flipped = new Set<number>();
    let announcedAll = false;
    for (const c of o.cards) new Image().src = c.image; // warm the faces before they turn

    stage.innerHTML = "";
    const hint = document.createElement("p");
    hint.className = "ps-hint";
    const setHint = (t: string) => {
        hint.textContent = t;
    };
    const centerOf = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    };

    // ---- cards ---------------------------------------------------------------
    type CardEl = HTMLDivElement & { idx: number };
    function cardEl(s: StageCard, cw: number, idx: number) {
        const el = document.createElement("div") as CardEl;
        el.idx = idx;
        el.className = "ps-card" + (s.owned === 0 ? " ps-card--new" : "");
        el.dataset.tier = s.tier;
        Object.assign(el.style, { width: cw + "px", height: cw / ASPECT + "px", fontSize: Math.max(7, cw * 0.062) + "px" });
        el.innerHTML = `<div class="ps-tilt"><div class="ps-inner"><div class="ps-face ps-back"><img alt="" src="${o.cardBack}"></div>` +
            `<div class="ps-face ps-front"><img alt=""><div class="ps-holo"></div><div class="ps-glare"></div></div></div></div>`;
        const front = el.querySelector<HTMLImageElement>(".ps-front img")!;
        front.src = s.image;
        front.alt = s.card.name;
        return el;
    }
    const isUp = (el: CardEl) => el.classList.contains("ps-card--flipped");
    /** Turns a card face up and tells the page, once. */
    function turn(el: CardEl) {
        el.classList.add("ps-card--flipped");
        if (flipped.has(el.idx)) return;
        flipped.add(el.idx);
        o.onFlip(el.idx);
        if (flipped.size === n && !announcedAll) {
            announcedAll = true;
            o.onAllFlipped();
        }
    }

    /**
     * Revealed cards tip toward the pointer (or finger) like a card held in the hand:
     * a few degrees about the card's own centre, eased, with the glare following.
     */
    function enableTilt(el: HTMLElement) {
        el.addEventListener("pointermove", (e) => {
            const b = el.getBoundingClientRect();
            const dx = Math.max(-0.5, Math.min(0.5, (e.clientX - b.left) / b.width - 0.5));
            const dy = Math.max(-0.5, Math.min(0.5, (e.clientY - b.top) / b.height - 0.5));
            el.style.setProperty("--rx", `${(-dy * 12).toFixed(2)}deg`);
            el.style.setProperty("--ry", `${(dx * 14).toFixed(2)}deg`);
            el.style.setProperty("--mx", (dx + 0.5) * 100 + "%");
            el.style.setProperty("--my", (dy + 0.5) * 100 + "%");
        });
        el.addEventListener("pointerleave", () => untilt(el));
    }
    const untilt = (el: HTMLElement) => {
        el.style.removeProperty("--rx");
        el.style.removeProperty("--ry");
    };

    // ---- details: the hover plate (mouse) and the tap close-up ---------------
    let peekEl: HTMLElement | null = null, peekTimer: ReturnType<typeof setTimeout> | undefined;
    function hidePeek() {
        clearTimeout(peekTimer);
        peekEl?.remove();
        peekEl = null;
        stage.querySelectorAll(".ps-card--lift").forEach((e) => e.classList.remove("ps-card--lift"));
    }
    let inspecting = false;
    function addPeek(el: CardEl) {
        el.addEventListener("pointerenter", (e) => {
            if (e.pointerType !== "mouse" || !isUp(el) || inspecting || stage.querySelector(".ps-dim--on")) return;
            hidePeek();
            el.classList.add("ps-card--lift");
            peekTimer = setTimeout(() => {
                if (!alive) return;
                const b = el.getBoundingClientRect(), w = 330;
                peekEl = toBody(plate(o.cards[el.idx]!, "ps-peek"));
                const onLeft = b.left + b.width / 2 > innerWidth / 2;
                peekEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, onLeft ? b.left - w - 16 : b.right + 16)) + "px";
                peekEl.style.top = Math.max(8, Math.min(innerHeight - peekEl.offsetHeight - 8, b.top)) + "px";
                anims.push(gsap.from(peekEl, { opacity: 0, x: onLeft ? 10 : -10, duration: 0.18 }));
            }, 200);
        });
        el.addEventListener("pointerleave", hidePeek);
    }

    /** A face-up card flies up into a close-up, its details beside it (wide) or in a sheet below (phone). */
    /** "Look later": a bookmark toggle, inside the details so a tap on it doesn't close them. */
    function markToggle(cardId: number, marks: NonNullable<StageOptions["marks"]>) {
        const b = document.createElement("button");
        b.type = "button";
        const show = (on: boolean) => {
            b.className = `mark-toggle ${on ? "mark-toggle--on" : ""}`;
            b.setAttribute("aria-pressed", String(on));
            b.innerHTML = `<span class="mark-toggle__icon" aria-hidden="true"></span>${on ? "Marked to look at later" : "Look at later"}`;
        };
        show(marks.has(cardId));
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            const on = !marks.has(cardId);
            marks.set(cardId, on);
            show(on);
        });
        return b;
    }

    function inspect(from: CardEl) {
        hidePeek();
        inspecting = true;
        const s = o.cards[from.idx]!, VW = innerWidth, VH = innerHeight, wide = VW >= 700;
        const ov = toBody(document.createElement("div"));
        ov.className = "ps-inspect";
        ov.setAttribute("role", "dialog");
        ov.setAttribute("aria-label", s.card.name);
        ov.innerHTML = `<span class="ps-close-hint">Tap anywhere to close</span>`;
        const panel = plate(s, wide ? "" : "ps-sheet");
        if (o.marks) panel.append(markToggle(s.card.id, o.marks));
        ov.append(panel);
        const above = wide ? VH : VH - panel.offsetHeight;
        const ch = wide ? Math.min(VH * 0.72, 560) : Math.min(above - 64, (VW * 0.72) / ASPECT), cw = ch * ASPECT;
        const el = cardEl(s, cw, from.idx);
        el.classList.add("ps-card--flipped");
        if (s.tier !== "Common") el.classList.add("ps-card--revealed");
        enableTilt(el);
        ov.prepend(el);
        const panelW = Math.min(400, VW - cw - 120);
        const tx = wide ? VW / 2 - (cw + 32 + panelW) / 2 : VW / 2 - cw / 2;
        const ty = wide ? (VH - ch) / 2 : 40 + (above - 40 - ch) / 2;
        if (wide) Object.assign(panel.style, { width: panelW + "px", left: tx + cw + 32 + "px", top: (VH - Math.min(ch, 460)) / 2 + "px" });
        const b = from.getBoundingClientRect();
        to(ov, { opacity: 1, duration: 0.25 });
        fromTo(el, { x: b.left + b.width / 2 - cw / 2, y: b.top + b.height / 2 - ch / 2, scale: b.width / cw },
            { x: tx, y: ty, scale: 1, duration: 0.45, ease: "power3.out" });
        anims.push(gsap.from(panel, wide ? { opacity: 0, x: -20, duration: 0.35, delay: 0.2 } : { yPercent: 100, duration: 0.4, delay: 0.1, ease: "power3.out" }));
        Sfx.whoosh();
        const close = () => {
            const nb = from.getBoundingClientRect();
            to(el, { x: nb.left + nb.width / 2 - cw / 2, y: nb.top + nb.height / 2 - ch / 2, scale: nb.width / cw, duration: 0.35, ease: "power3.in" });
            to(ov, { opacity: 0, duration: 0.35, onComplete: () => ov.remove() });
            removeEventListener("keydown", onKey);
            inspecting = false;
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
        addEventListener("keydown", onKey, { signal });
        // A tap opens this on finger-up; the browser's click for that same tap then
        // lands on the new overlay, so clicks in the first moment don't close it.
        const opened = performance.now();
        ov.addEventListener("click", (e) => {
            if (performance.now() - opened < 400) return;
            if (!(e.target as Element).closest(".ps-plate")) close();
        });
    }

    // ---- the rare reveal -------------------------------------------------------
    function rays(x: number, y: number, r: Tier, glyphs: boolean) {
        const el = toBody(document.createElement("div"));
        el.className = "ps-rays ps-rays--" + r;
        Object.assign(el.style, { left: x + "px", top: y + "px" });
        if (glyphs) el.innerHTML = GLYPHS;
        fromTo(el, { scale: 0.2, opacity: 0, rotation: 0 }, { scale: 1, opacity: 1, rotation: 40, duration: 1.2, ease: "power2.out" });
        to(el, { opacity: 0, rotation: 90, duration: 1.1, delay: 1.5, ease: "power1.in", onComplete: () => el.remove() });
    }
    function flash(r: Tier) {
        const el = toBody(document.createElement("div"));
        el.className = "ps-flash";
        el.style.background = `radial-gradient(circle, rgba(255,255,255,.95), ${r === "Secret" ? "rgba(255,106,213,.45)" : "rgba(255,204,51,.45)"} 40%, transparent 75%)`;
        anims.push(gsap.timeline({ onComplete: () => el.remove() }).to(el, { opacity: 0.75, duration: 0.08 }).to(el, { opacity: 0, duration: 0.7, ease: "power2.out" }));
    }
    function banner(r: Tier, top?: number) {
        const el = toBody(document.createElement("div"));
        el.className = "ps-banner ps-banner--" + r;
        el.textContent = TIER_LABEL[r];
        if (top != null) el.style.top = top + "px";
        gsap.set(el, { xPercent: -50 });
        anims.push(gsap.timeline({ onComplete: () => el.remove() })
            .fromTo(el, { scale: 0.5, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: "back.out(2.2)" })
            .to(el, { opacity: 0, y: -24, duration: 0.5, ease: "power1.in" }, "+=1.3"));
    }
    function revealFx(el: CardEl, r: Tier, glyphs: boolean, bannerTop?: number) {
        const { x, y } = centerOf(el);
        fx.burst(x, y, r, { Common: 0, Rare: 26, Super: 55, Ultra: 95, Secret: 160 }[r]);
        Sfx.reveal(r);
        buzz(r === "Secret" ? [30, 40, 30, 40, 90] : r === "Ultra" ? [40, 30, 80] : 25);
        if (r !== "Rare") rays(x, y, r, glyphs);
        if (r === "Ultra" || r === "Secret") flash(r);
        banner(r, bannerTop);
        el.classList.add("ps-card--revealed");
        enableTilt(el);
    }

    // ---- the pack --------------------------------------------------------------
    function packEl() {
        const pk = document.createElement("div");
        pk.className = "ps-pack";
        pk.setAttribute("role", "button");
        pk.setAttribute("aria-label", `Open the ${o.packName} pack`);
        pk.innerHTML = `<div class="ps-pack-body"><img alt=""></div><div class="ps-pack-strip"><img alt=""></div>`;
        pk.querySelectorAll("img").forEach((img) => (img.src = o.packArt));
        return pk;
    }
    function ripStrip(strip: HTMLElement, dir: number) {
        Sfx.tear();
        buzz(40);
        const b = strip.getBoundingClientRect();
        fx.burst(b.left + b.width * (dir > 0 ? 0.9 : 0.1), b.top + b.height * 0.6, "Rare", 16);
        to(strip, { x: dir * W * 0.6, y: -H * 0.3, rotation: -dir * 75, opacity: 0, duration: 0.75, ease: "power2.out" });
    }

    /** A pack you tear by swiping across its top strip (a tap tears it too). */
    function tearable(heightShare: number, onRip: (r: { pk: HTMLElement; packW: number; top: number }) => void) {
        const packH = Math.min(H * heightShare, (W * 0.62) / PACK_ASPECT), packW = packH * PACK_ASPECT;
        const pk = packEl(), strip = pk.querySelector<HTMLElement>(".ps-pack-strip")!;
        pk.insertAdjacentHTML("beforeend", `<div class="ps-tear-line"><span></span></div>`);
        const top = (H - packH) / 2 - 20;
        Object.assign(pk.style, { width: packW + "px", height: packH + "px", left: (W - packW) / 2 + "px", top: top + "px" });
        stage.appendChild(pk);
        anims.push(gsap.from(pk, { y: 60, opacity: 0, duration: 0.6, ease: "back.out(1.6)" }));
        const idle = to(pk, { rotation: 1.4, yoyo: true, repeat: -1, duration: 1.7, ease: "sine.inOut" });
        setHint("Swipe across the top to tear it open");

        let s: { x: number; y: number } | null = null, last = 0, torn = false;
        const rip = (dir: number) => {
            torn = true;
            idle.kill();
            setHint("");
            pk.querySelector(".ps-tear-line")?.remove();
            ripStrip(strip, dir);
            onRip({ pk, packW, top });
        };
        pk.addEventListener("pointerdown", (e) => {
            if (torn) return;
            Sfx.unlock();
            pk.setPointerCapture(e.pointerId);
            s = { x: e.clientX, y: e.clientY };
            last = 0;
        });
        pk.addEventListener("pointermove", (e) => {
            if (!s || torn) return;
            const dx = e.clientX - s.x, prog = Math.min(1, Math.abs(dx) / (packW * 0.75)), dir = dx < 0 ? -1 : 1;
            gsap.set(strip, { transformOrigin: dir > 0 ? "100% 100%" : "0% 100%", y: -prog * 12, rotation: -dir * prog * 14 });
            if (prog - last > 0.07) {
                Sfx.crinkle();
                buzz(8);
                last = prog;
            }
            if (prog > 0.62) rip(dir);
        });
        pk.addEventListener("pointerup", (e) => {
            if (!s || torn) return;
            if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) rip(1);
            else to(strip, { y: 0, rotation: 0, duration: 0.3, ease: "back.out(2)" });
            s = null;
        });
        pk.addEventListener("keydown", (e) => {
            if (!torn && (e.key === "Enter" || e.key === " ")) rip(1);
        });
        pk.tabIndex = 0;
    }

    // ---- phones: tear, then the cards swirl onto a ring -------------------------
    function ringStage(): Omit<PackStage, "destroy"> {
        const step = (Math.PI * 2) / n;
        const cw = Math.min(W * 0.5, H * 0.4 * ASPECT, 230), ch = cw / ASPECT;
        const R = Math.min(W * 0.48, 400), ringY = H * 0.44;
        stage.insertAdjacentHTML("beforeend", `<div class="ps-backdrop ps-tear-bg"></div><div class="ps-halo"></div>`);
        const halo = stage.querySelector<HTMLElement>(".ps-halo")!;
        Object.assign(halo.style, { width: R * 2.6 + "px", height: R * 0.9 + "px", left: W / 2 - R * 1.3 + "px", top: ringY + ch * 0.3 + "px" });
        stage.appendChild(hint);
        const bannerTop = () => stage.getBoundingClientRect().top + ringY + ch / 2 + 18;

        const state = { t: 0 };
        let ready = false, busy = true;
        const pos = (i: number, t: number, r = R) => {
            const a = i * step - t, depth = (Math.cos(a) + 1) / 2;
            return { x: W / 2 + Math.sin(a) * r - cw / 2, y: ringY - (1 - depth) * H * 0.07 - ch / 2, scale: 0.48 + 0.52 * depth, depth };
        };
        const els = o.cards.map((s, i) => {
            const el = cardEl(s, cw, i);
            if (o.flipped.includes(i)) turn(el);
            else if (s.tier !== "Common") el.classList.add("ps-card--glowing");
            if (isUp(el) && s.tier !== "Common") el.classList.add("ps-card--revealed");
            el.style.visibility = "hidden";
            stage.appendChild(el);
            addPeek(el);
            return el;
        });
        const render = () => els.forEach((el, i) => {
            const p = pos(i, state.t);
            gsap.set(el, { x: p.x, y: p.y, scale: p.scale, opacity: 0.35 + 0.65 * p.depth });
            el.style.zIndex = String(Math.round(p.depth * 100));
        });
        const front = () => ((Math.round(state.t / step) % n) + n) % n;
        const onFront = () => {
            if (!ready) return;
            const el = els[front()]!;
            setHint(!isUp(el) ? "Tap a card to reveal it" : flipped.size === n ? "All revealed · tap a card for details" : "Tap it for details · swipe to turn");
        };
        // The running spin, so a finger can catch the ring mid-turn.
        let spinning: gsap.core.Animation | null = null;
        const spinTo = (t: number, then?: () => void, duration = 0.5, ease = "power3.out") => {
            spinning?.kill();
            if (Math.abs(t - state.t) > step * 0.3) Sfx.whoosh();
            spinning = to(state, { t, duration, ease, onUpdate: render, onComplete: () => ((spinning = null), onFront(), then?.()) });
        };
        const goReady = () => {
            ready = true;
            busy = false;
            els.forEach((el) => (el.style.visibility = "visible"));
            render();
            o.onReady();
            onFront();
        };

        if (o.flipped.length) {
            to(halo, { opacity: 1, duration: 0.6 });
            goReady();
        } else {
            tearable(0.56, ({ pk, packW, top }) => {
                const packH = packW / PACK_ASPECT, sb = stage.getBoundingClientRect();
                const mouthY = top + packH * 0.13; // where the strip tore off
                // In the pack the cards are a stack about as wide as the pack, fanned a touch.
                const s0 = Math.min(1, (packW * 0.8) / cw), sh = ch * s0;
                const fan = (i: number) => (i - (n - 1) / 2) * 2.4;
                const inside = top + packH * 0.62, out = mouthY - sh * 0.04;
                // Light spills out of the torn mouth.
                fx.burst(W / 2 + sb.left, mouthY + sb.top, "Ultra", 40, true);
                Sfx.rise(0.9);
                // 1. The cards rise out of the mouth as one fanned stack, from behind the pack's face.
                els.forEach((el, i) => {
                    el.style.zIndex = String(1 + i);
                    gsap.set(el, { x: W / 2 - cw / 2, y: inside - ch / 2, scale: s0, rotation: fan(i), opacity: 1 });
                    to(el, {
                        y: out - ch / 2 - i * 1.5, duration: 0.55, delay: 0.2 + i * 0.045, ease: "power2.out",
                        onStart: () => (el.style.visibility = "visible"),
                    });
                });
                const lifted = 0.2 + (n - 1) * 0.045 + 0.55;
                // 2. The empty pack drops away and the stack spreads onto the ring.
                to(pk, { y: H * 0.6, opacity: 0, rotation: 4, duration: 0.6, delay: lifted, ease: "power2.in" });
                to(halo, { opacity: 1, duration: 1.2, delay: lifted });
                later(() => Sfx.whoosh(), lifted * 1000);
                els.forEach((el, i) => {
                    const spread = { p: 0 }, y0 = out - i * 1.5;
                    to(spread, {
                        p: 1, duration: 1.0, delay: lifted + 0.05 + i * 0.035, ease: "power3.inOut",
                        onUpdate: () => {
                            const p = spread.p;
                            // A half turn while the ring widens from the stack out to its radius.
                            const at = pos(i, -(1 - p) * Math.PI, R * p);
                            const y = y0 - ch / 2 + (at.y - (y0 - ch / 2)) * p;
                            gsap.set(el, { x: at.x, y, scale: s0 + (at.scale - s0) * p, rotation: fan(i) * (1 - p), opacity: 1 - p * (1 - (0.35 + 0.65 * at.depth)) });
                            if (p > 0.35) el.style.zIndex = String(Math.round(at.depth * 100));
                            if (p > 0.1 && p < 0.9 && Math.random() < 0.25) fx.trail(sb.left + at.x + cw / 2, sb.top + y + ch / 2);
                        },
                    });
                });
                later(goReady, (lifted + 0.05 + (n - 1) * 0.035 + 1.0) * 1000 + 50);
            });
        }

        function reveal(i: number, then?: () => void) {
            const el = els[i]!, s = o.cards[i]!;
            if (isUp(el)) return then?.();
            if (s.tier === "Common") {
                turn(el);
                Sfx.flip();
                buzz(10);
                onFront();
                return then?.();
            }
            busy = true;
            el.classList.remove("ps-card--glowing");
            setHint("");
            to(halo, { scale: 1.15, filter: "brightness(1.8)", duration: 0.6 });
            Sfx.rise(0.8);
            later(() => {
                turn(el);
                Sfx.flip();
                later(() => {
                    revealFx(el, s.tier, true, bannerTop());
                    later(() => {
                        to(halo, { scale: 1, filter: "brightness(1)", duration: 0.8 });
                        busy = false;
                        onFront();
                        then?.();
                    }, 1200);
                }, 270);
            }, 800);
        }

        // Dragging turns the ring under the finger; letting go keeps its speed and
        // settles on the nearest card, so a flick carries on for a few cards.
        const PER_PX = 1 / (R * 0.85); // ring turn per pixel dragged
        let drag: { x: number; t: number; moved: boolean; trail: { at: number; t: number }[] } | null = null;
        stage.addEventListener("pointerdown", (e: PointerEvent) => {
            if (!ready || busy) return;
            Sfx.unlock();
            // Catch a spinning ring where it is.
            const caught = spinning !== null;
            spinning?.kill();
            spinning = null;
            drag = { x: e.clientX, t: state.t, moved: caught, trail: [{ at: performance.now(), t: state.t }] };
        }, { signal });
        stage.addEventListener("pointermove", (e: PointerEvent) => {
            if (!drag) return;
            const dx = e.clientX - drag.x;
            if (!drag.moved) {
                if (Math.abs(dx) < 8) return; // a finger wobbles a little on a tap
                drag.moved = true;
                drag.x = e.clientX; // start from here, without a jump
                return;
            }
            state.t = drag.t - dx * PER_PX;
            render();
            const now = performance.now();
            drag.trail.push({ at: now, t: state.t });
            while (drag.trail.length > 2 && now - drag.trail[0]!.at > 100) drag.trail.shift();
        }, { signal });
        stage.addEventListener("pointerup", (e: PointerEvent) => {
            if (!drag) return;
            const d = drag;
            drag = null;
            if (d.moved) {
                // Speed over the last tenth of a second, in turn per second.
                const first = d.trail[0]!, last = d.trail[d.trail.length - 1]!;
                const dt = (performance.now() - first.at) / 1000;
                const v = dt > 0.005 && last.at > first.at ? (last.t - first.t) / Math.max(dt, (last.at - first.at) / 1000) : 0;
                // Coast about a third of a second's worth, at most a few cards, then the nearest card.
                const coast = Math.max(-step * 4, Math.min(step * 4, v * 0.32));
                const target = Math.round((state.t + coast) / step) * step, dist = Math.abs(target - state.t);
                // An ease-out whose starting speed matches the finger's (power2.out starts at 2·dist/duration).
                const duration = Math.abs(v) > 0.05 ? Math.max(0.25, Math.min(1.1, (2 * dist) / Math.abs(v))) : 0.35;
                return spinTo(target, undefined, duration, "power2.out");
            }
            const el = (e.target as Element).closest<CardEl>(".ps-card");
            if (!el) return;
            const i = els.indexOf(el);
            if (i === front()) return isUp(el) ? inspect(el) : reveal(i);
            // A face-down common flips where it is; a rare or better comes to the front for its reveal,
            // and a face-up card comes forward to be looked at.
            if (!isUp(el) && o.cards[i]!.tier === "Common") return reveal(i);
            const k = Math.round(state.t / step), off = (((i - (((k % n) + n) % n)) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
            spinTo((k + off) * step);
        }, { signal });
        stage.addEventListener("pointercancel", () => {
            drag = null;
        }, { signal });

        return {
            spin: (dir) => {
                if (ready && !busy) spinTo((Math.round(state.t / step) + dir) * step);
            },
            flipAll: () => {
                if (!ready || busy) return;
                els.forEach((el, i) => {
                    if (!isUp(el) && o.cards[i]!.tier === "Common") turn(el);
                });
                Sfx.flip();
                // Then turn to each rare still face down and reveal it, one at a time.
                const hits = els.map((_, i) => i).filter((i) => !isUp(els[i]!));
                const next = () => {
                    const i = hits.shift();
                    if (i === undefined) return onFront();
                    const k = Math.round(state.t / step), off = (((i - (((k % n) + n) % n)) + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
                    busy = true;
                    spinTo((k + off) * step, () => {
                        busy = false;
                        reveal(i, next);
                    });
                };
                next();
            },
        };
    }

    // ---- wider screens: the duel table -----------------------------------------
    function tableStage(): Omit<PackStage, "destroy"> {
        const rowsOf = n <= 5 ? [n] : n <= 10 ? [5, n - 5] : [Math.ceil(n / 2), Math.floor(n / 2)];
        const cols = rowsOf[0]!, rows = rowsOf.length, gap = 20, avail = H - 56;
        const cw = Math.min((W * 0.92 - (cols - 1) * gap) / cols, ((avail - (rows - 1) * gap) / rows) * ASPECT, 210), ch = cw / ASPECT;
        const gridTop = 12 + (avail - (rows * ch + (rows - 1) * gap)) / 2;
        const slot = (i: number) => {
            const r = i < cols ? 0 : 1, c = r ? i - cols : i, inRow = rowsOf[r]!;
            return { x: W / 2 + (c - (inRow - 1) / 2) * (cw + gap), y: gridTop + r * (ch + gap) + ch / 2 };
        };
        stage.insertAdjacentHTML("beforeend", `<div class="ps-backdrop ps-table"></div><div class="ps-dim"></div>`);
        for (let i = 0; i < n; i++) {
            const p = slot(i), s = document.createElement("div");
            s.className = "ps-slot";
            s.style.animationDelay = `${0.15 + i * 0.04}s`;
            Object.assign(s.style, { left: p.x - cw / 2 - 3 + "px", top: p.y - ch / 2 - 3 + "px", width: cw + 6 + "px", height: ch + 6 + "px" });
            stage.appendChild(s);
        }
        stage.appendChild(hint);
        const dim = stage.querySelector<HTMLElement>(".ps-dim")!;
        const els: CardEl[] = [];
        let busy = false, ready = false, focused: { el: CardEl; i: number } | null = null;

        const place = (el: CardEl, i: number) => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                tap(el, i);
            });
            addPeek(el);
        };
        const goReady = () => {
            ready = true;
            o.onReady();
            setHint(flipped.size === n ? "Hover a card for details, click for a close-up" : "Click a card to flip it");
        };

        if (o.flipped.length) {
            o.cards.forEach((s, i) => {
                const el = cardEl(s, cw, i), p = slot(i);
                el.style.zIndex = String(10 + i);
                if (o.flipped.includes(i)) {
                    turn(el);
                    if (s.tier !== "Common") el.classList.add("ps-card--revealed");
                } else if (s.tier !== "Common") el.classList.add("ps-card--glowing");
                gsap.set(el, { x: p.x - cw / 2, y: p.y - ch / 2 });
                stage.appendChild(el);
                els.push(el);
                place(el, i);
            });
            goReady();
        } else {
            const pk = packEl(), strip = pk.querySelector<HTMLElement>(".ps-pack-strip")!;
            const packH = Math.min(H * 0.6, (W * 0.5) / PACK_ASPECT), packW = packH * PACK_ASPECT;
            Object.assign(pk.style, { width: packW + "px", height: packH + "px", left: (W - packW) / 2 + "px", top: (H - packH) / 2 - 20 + "px", cursor: "pointer" });
            pk.tabIndex = 0;
            stage.appendChild(pk);
            anims.push(gsap.from(pk, { y: -H * 0.6, rotation: -12, duration: 0.7, ease: "bounce.out" }));
            later(Sfx.thump, 380);
            setHint("Click the pack to open it");
            let opened = false;
            const open = () => {
                if (opened) return;
                opened = true;
                Sfx.unlock();
                setHint("");
                to(pk, { x: "+=7", yoyo: true, repeat: 7, duration: 0.045 });
                later(() => {
                    ripStrip(strip, 1);
                    to(pk, { x: 40 - parseFloat(pk.style.left), y: H / 2 - packH * 0.2 - parseFloat(pk.style.top), scale: 0.36, transformOrigin: "0 0", rotation: -8, duration: 0.5, ease: "power2.inOut" });
                    later(() => dealAll(pk), 520);
                }, 360);
            };
            pk.addEventListener("click", open);
            pk.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && open());
        }

        function dealAll(pk: HTMLElement) {
            const from = centerOf(pk), sb = stage.getBoundingClientRect();
            o.cards.forEach((s, i) => {
                const el = cardEl(s, cw, i), p = slot(i), hit = s.tier !== "Common";
                el.style.zIndex = String(10 + i);
                stage.appendChild(el);
                els.push(el);
                const delay = i * 0.13 + (hit ? 0.45 : 0);
                fromTo(el, { x: from.x - sb.left - cw / 2, y: from.y - sb.top - ch / 2, scale: 0.3, rotation: (Math.random() - 0.5) * 60 },
                    { x: p.x - cw / 2, y: p.y - ch / 2, scale: 1, rotation: (Math.random() - 0.5) * 4, duration: hit ? 0.55 : 0.38, delay, ease: hit ? "back.out(1.4)" : "power3.out",
                      onStart: hit ? Sfx.whoosh : Sfx.deal,
                      onComplete: hit ? () => { Sfx.thump(); buzz(30); el.classList.add("ps-card--glowing"); } : undefined });
                place(el, i);
            });
            later(() => {
                to(pk, { opacity: 0, duration: 0.4 });
                goReady();
            }, n * 130 + 600);
        }

        function liftFlip(el: CardEl) {
            anims.push(gsap.timeline()
                .to(el, { scale: 1.12, y: "-=10", duration: 0.12, ease: "power2.out" })
                .add(() => { turn(el); Sfx.flip(); })
                .to(el, { scale: 1, y: "+=10", duration: 0.35, ease: "back.out(2.5)" }, "+=.2"));
        }
        function tap(el: CardEl, i: number) {
            if (!ready || busy) return;
            if (focused) return putDown();
            if (!isUp(el)) return o.cards[i]!.tier === "Common" ? (liftFlip(el), afterFlip()) : beat(el, i);
            inspect(el);
        }
        function focus(el: CardEl, i: number) {
            focused = { el, i };
            el.style.zIndex = "70";
            dim.classList.add("ps-dim--on");
            to(dim, { opacity: 1, duration: 0.4 });
            const s = Math.min((W * 0.66) / cw, (H * 0.8) / ch);
            to(el, { x: W / 2 - cw / 2, y: H / 2 - ch / 2, scale: s, rotation: 0, duration: 0.6, ease: "power3.inOut" });
        }
        function putDown() {
            if (!focused) return;
            const { el, i } = focused, p = slot(i);
            focused = null;
            untilt(el);
            dim.classList.remove("ps-dim--on");
            to(dim, { opacity: 0, duration: 0.35 });
            to(el, { x: p.x - cw / 2, y: p.y - ch / 2, scale: 1, duration: 0.5, ease: "power3.inOut", onComplete: () => { el.style.zIndex = String(10 + i); } });
            afterFlip();
        }
        dim.addEventListener("click", () => focused && !busy && putDown());

        /** A rare: lift it to the middle, shake, turn it, and pay it off. */
        function beat(el: CardEl, i: number, then?: () => void) {
            busy = true;
            hidePeek();
            el.classList.remove("ps-card--glowing");
            focus(el, i);
            Sfx.rise(0.9);
            later(() => to(el, { x: "+=3", yoyo: true, repeat: 9, duration: 0.05 }), 500);
            later(() => {
                turn(el);
                Sfx.flip();
                later(() => {
                    revealFx(el, o.cards[i]!.tier, false);
                    later(() => {
                        busy = false;
                        if (then) later(() => (putDown(), then()), 500);
                        else setHint("Click anywhere to put it down");
                    }, 900);
                }, 270);
            }, 1050);
        }
        function afterFlip() {
            if (!focused) setHint(flipped.size === n ? "Hover a card for details, click for a close-up" : "");
        }

        return {
            spin: () => undefined,
            flipAll: () => {
                if (!ready || busy || focused) return;
                const left = els.filter((el, i) => o.cards[i]!.tier === "Common" && !isUp(el));
                left.forEach((el, k) => later(() => { turn(el); Sfx.flip(); }, k * 90));
                const hits = els.map((_, i) => i).filter((i) => o.cards[i]!.tier !== "Common" && !isUp(els[i]!));
                const next = () => {
                    const i = hits.shift();
                    if (i !== undefined) beat(els[i]!, i, next);
                    else afterFlip();
                };
                later(next, left.length * 90 + (hits.length ? 500 : 0));
            },
        };
    }

    const api = o.phone ? ringStage() : tableStage();
    return {
        ...api,
        destroy() {
            alive = false;
            ac.abort();
            timers.forEach(clearTimeout);
            anims.forEach((a) => a.kill());
            hidePeek();
            outside.forEach((el) => el.remove());
            fx.destroy();
            stage.innerHTML = "";
        },
    };
}
