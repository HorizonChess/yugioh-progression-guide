"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { asset } from "@/lib/utils";

const EYE = asset("/ui/millennium-eye.webp");

/**
 * A tri-folded letter: it arrives folded (from `from`, the letter's box as it left the envelope,
 * or from below), opens its top then bottom panel, and inks in its content. Panels are only paper;
 * the real content sits on top once the sheet is flat.
 */
export default function Letter({ from, reduce, children }: { from: DOMRect | "below"; reduce: boolean; children: ReactNode }) {
    const root = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = root.current;
        if (!el) return;
        const ctx = gsap.context(() => {
            const box = el.getBoundingClientRect();
            const enter =
                from === "below"
                    ? { y: window.innerHeight * 0.75, rotation: 5 }
                    : {
                          x: from.left + from.width / 2 - (box.left + box.width / 2),
                          y: from.top + from.height / 2 - (box.top + box.height / 2),
                          scaleX: from.width / box.width,
                          scaleY: from.height / (box.height / 3),
                      };
            // A panel darkens as it turns away from the candle.
            const shade = (sel: string) =>
                function (this: gsap.core.Tween) {
                    const deg = Number(gsap.getProperty(this.targets()[0] as Element, "rotationX"));
                    gsap.set(sel, { opacity: Math.abs(Math.sin((deg * Math.PI) / 180)) * 0.55 });
                };
            const tl = gsap.timeline();
            tl.set(el, { transformStyle: "preserve-3d" })
                .set(".ob-letter__content, .ob-letter__frame", { autoAlpha: 0 })
                .set(".ob-letter__panel--top", { rotationX: -180, z: 2 })
                .set(".ob-letter__panel--bottom", { rotationX: 180, z: 1 })
                .set(".ob-letter__shadow", { top: "33%", bottom: "33%" })
                .from(el, { ...enter, duration: from === "below" ? 0.9 : 0.7, ease: "power3.out" })
                .to(".ob-letter__panel--top", { rotationX: 0, z: 0, duration: 0.6, ease: "power2.inOut", onUpdate: shade(".ob-letter__panel--top .ob-letter__shade") }, "+=0.05")
                .to(".ob-letter__shadow", { top: "0%", duration: 0.6, ease: "power2.inOut" }, "<")
                .to(".ob-letter__panel--bottom", { rotationX: 0, z: 0, duration: 0.6, ease: "power2.inOut", onUpdate: shade(".ob-letter__panel--bottom .ob-letter__shade") }, ">-0.15")
                .to(".ob-letter__shadow", { bottom: "-1%", duration: 0.6, ease: "power2.inOut" }, "<")
                .set(el, { transformStyle: "flat", clearProps: "transform" })
                .to(".ob-letter__frame, .ob-letter__content", { autoAlpha: 1, duration: 0.3 })
                .fromTo(".ob-letter__content .ob-ink", { autoAlpha: 0, y: 6, filter: "blur(3px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.45, stagger: 0.06, ease: "power2.out", clearProps: "filter" }, "<")
                .fromTo(".ob-letter__crest-shine", { backgroundPositionX: "130%" }, { backgroundPositionX: "-30%", duration: 1.1, ease: "power2.inOut" }, "<0.3");
            if (reduce) tl.progress(1);
            else gsap.to(".ob-letter__crest-shine", { backgroundPositionX: "-30%", startAt: { backgroundPositionX: "130%" }, duration: 1.1, ease: "power2.inOut", repeat: -1, repeatDelay: 6, delay: tl.duration() + 6 });
        }, el);
        return () => ctx.revert();
        // The letter animates in once; later content changes ink in on their own.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const panel = (where: "top" | "mid" | "bottom") => (
        <div className={`ob-letter__panel ob-letter__panel--${where}`}>
            <div className="ob-letter__face ob-paper">
                <div className="ob-letter__shade" />
            </div>
            {where !== "mid" && (
                <div className="ob-letter__face ob-letter__face--back ob-paper">
                    <div className="ob-letter__shade" />
                </div>
            )}
        </div>
    );

    return (
        <div className="ob-letter-stage">
            <div ref={root} className="ob-letter">
                <div className="ob-letter__shadow" />
                {panel("mid")}
                {panel("bottom")}
                {panel("top")}
                <div className="ob-letter__frame">
                    <div className="ob-letter__crest" aria-hidden>
                        <img src={EYE} alt="" />
                        {/* A glint that only shows on the gold: the eye image is its mask. */}
                        <span className="ob-letter__crest-shine" style={{ maskImage: `url(${EYE})`, WebkitMaskImage: `url(${EYE})` }} />
                    </div>
                </div>
                <div className="ob-letter__content">{children}</div>
            </div>
        </div>
    );
}
