"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { CardSet } from "@/lib/api";
import { markLoaded } from "@/lib/utils";
import { landFlight } from "@/lib/pack-flight";
import CartoucheButton from "@/components/ui/CartoucheButton";

/**
 * The pack screen between the timeline and the opener (default /packs state).
 * The pack the player tapped on the timeline flies from where it sat to centre
 * stage, under its own light, and the set's name and the choices gather around
 * it: open the packs, or read the set's card list (also by tapping the pack).
 * Fits the viewport, no scroll.
 */
export default function StoreView({
    set,
    setIndex,
    cardCount,
    isLocked,
    lockedMessage = "You must complete previous sets to unlock pack opening for this set.",
    quantity,
    setQuantity,
    onOpen,
    onViewDetails,
    onBack,
}: {
    set: CardSet;
    setIndex: number;
    cardCount: number;
    isLocked: boolean;
    lockedMessage?: string;
    quantity: number;
    /** Omitted when the pack count is fixed (server series). */
    setQuantity?: (n: number) => void;
    onOpen: () => void;
    onViewDetails: () => void;
    onBack: () => void;
}) {
    const pack = useRef<HTMLButtonElement>(null);

    // Land the pack flying in from the timeline; otherwise rise into place.
    useLayoutEffect(() => {
        const el = pack.current;
        if (!el) return;
        const landing = landFlight(setIndex, el);
        if (landing) return landing;
        const tween = gsap.from(el, { y: 40, scale: 0.92, opacity: 0, duration: 0.6, ease: "power2.out", clearProps: "transform,opacity" });
        return () => {
            tween.kill();
        };
    }, [setIndex]);

    return (
        <div className="store">
            <button onClick={onBack} className="store__back">‹ Back to the campaign</button>

            <header className="store__title">
                <p className="store__stage">Stage {setIndex + 1}{isLocked ? " · Locked" : ""}</p>
                <h1>{set.set_name}</h1>
                <p className="store__meta">{set.tcg_date} · {cardCount} cards</p>
            </header>

            <div className="store__stagecenter">
                <div className="store__light" aria-hidden="true" />
                <button ref={pack} onClick={onViewDetails} className="store__pack art-loading" aria-label={`${set.set_name}: view the card list`}>
                    {set.set_image ? (
                        <img ref={markLoaded} onLoad={markLoaded} src={set.set_image} alt="" fetchPriority="high" />
                    ) : (
                        <span className="store__noart">No pack art</span>
                    )}
                    <span className="store__peek">Card list</span>
                </button>
            </div>

            <div className="store__actions">
                {isLocked ? (
                    <>
                        <p className="store__locked">{lockedMessage}</p>
                        <CartoucheButton onClick={onViewDetails} className="store__btn">Card List</CartoucheButton>
                    </>
                ) : (
                    <>
                        {setQuantity && (
                            <div className="store__qty" role="group" aria-label="How many packs">
                                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="One fewer">−</button>
                                <input
                                    type="number"
                                    min={1}
                                    value={quantity}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!Number.isNaN(v)) setQuantity(Math.max(1, v));
                                    }}
                                    aria-label="Packs to open"
                                />
                                <button onClick={() => setQuantity(quantity + 1)} aria-label="One more">+</button>
                                {[1, 5, 10, 24].map((n) => (
                                    <button key={n} onClick={() => setQuantity(n)} className={quantity === n ? "store__chip store__chip--on" : "store__chip"}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="store__row">
                            <CartoucheButton onClick={onOpen} next className="store__btn">
                                Open {quantity} {quantity === 1 ? "Pack" : "Packs"}
                            </CartoucheButton>
                            <CartoucheButton onClick={onViewDetails} className="store__btn">Card List</CartoucheButton>
                        </div>
                    </>
                )}
                <p className="store__note">Opened cards go straight into your collection.</p>
            </div>
        </div>
    );
}
