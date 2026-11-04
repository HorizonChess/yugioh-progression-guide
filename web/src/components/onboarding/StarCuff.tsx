"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { StarChip } from "./parts";

/** A duelist's leather cuff with a socket per chip; the chips drop in one by one, each with a flash. */
export default function StarCuff({ chips, reduce }: { chips: number; reduce: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ delay: 0.35 });
            gsap.utils.toArray<HTMLElement>(".ob-cuff__chip").forEach((chip, i) => {
                const flash = chip.nextElementSibling;
                tl.fromTo(chip, { y: -130, x: (i - (chips - 1) / 2) * 24, rotation: -200, scale: 1.7, autoAlpha: 0 }, { y: 0, x: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 0.55, ease: "power2.in" }, i * 0.22)
                    .to(chip, { scale: 0.9, duration: 0.07, yoyo: true, repeat: 1 })
                    .fromTo(flash, { scale: 0.4, autoAlpha: 0.9 }, { scale: 2.3, autoAlpha: 0, duration: 0.45, ease: "power2.out" }, "<");
            });
            if (reduce) tl.progress(1);
        }, root);
        return () => ctx.revert();
    }, [chips, reduce]);

    return (
        <div ref={root} className="ob-cuff ob-ink" role="img" aria-label={`Your duelist cuff with ${chips} star chips`}>
            <div className="ob-cuff__band">
                {Array.from({ length: chips }, (_, i) => (
                    <div key={i} className="ob-cuff__socket">
                        <span className="ob-cuff__chip">
                            <StarChip lit size={38} />
                        </span>
                        <span className="ob-cuff__flash" />
                    </div>
                ))}
            </div>
        </div>
    );
}
