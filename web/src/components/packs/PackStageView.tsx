"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CardSet, PulledCard } from "@/lib/api";
import { useIsPhone } from "@/lib/useIsPhone";
import { createPackStage, type PackStage } from "@/components/packs/stage/engine";
import { setSoundOn, soundOn } from "@/components/packs/stage/fx";
import { toStageCard } from "@/components/packs/stage/plate";
import { CardCloseUp } from "@/components/card/CardPlate";
import "@/components/packs/stage/pack-stage.css";

const CARD_BACK = `${process.env.NEXT_PUBLIC_IMAGE_HOST ?? ""}/cards/back_high.jpg`;

/**
 * The pack-opening screen: phones tear each pack and turn its cards on a ring;
 * wider screens deal them onto a duel mat. The stage (engine.ts) runs the show;
 * this wraps it with the pack count, Open All / Flip All / Next Pack, and sound.
 * Each pack mounts a fresh stage; one already part-flipped resumes face up.
 */
export default function PackStageView({
    set,
    pack,
    packIndex,
    packCount,
    flippedCards,
    fullyOpened,
    ownedBefore,
    onFlip,
    onNextPack,
    onOpenAll,
    onBack,
    backLabel = "Back to Campaign",
}: {
    set: CardSet;
    pack: PulledCard[];
    packIndex: number;
    packCount: number;
    flippedCards: Set<number>;
    fullyOpened: boolean;
    /** How many of the card at `index` the player had before pulling it. */
    ownedBefore: (index: number) => number;
    onFlip: (index: number) => void;
    onNextPack: () => void;
    onOpenAll: () => void;
    onBack: () => void;
    /** The back button's words (wide screens). */
    backLabel?: string;
}) {
    const isPhone = useIsPhone();
    const host = useRef<HTMLDivElement>(null);
    const stage = useRef<PackStage | null>(null);
    // Which stage (pack, layout, width) has its cards out and can be flipped.
    const [readyStage, setReadyStage] = useState("");
    const [sound, setSound] = useState(soundOn);
    const [width, setWidth] = useState(0);
    // The engine keeps the callbacks it was made with; these always reach the latest props.
    const latest = useRef({ onFlip, ownedBefore, flippedCards });
    useLayoutEffect(() => {
        latest.current = { onFlip, ownedBefore, flippedCards };
    });
    /** The card open in the close-up, by its place in the pack. */
    const [inspected, setInspected] = useState<number | null>(null);
    // A new pack's cards aren't the ones a close-up was showing.
    const [inspectedPack, setInspectedPack] = useState(packIndex);
    if (inspectedPack !== packIndex) {
        setInspectedPack(packIndex);
        setInspected(null);
    }

    // Re-lay the stage when its width changes (not its height: a phone's address bar moves that).
    useLayoutEffect(() => {
        const el = host.current;
        if (!el) return;
        let t: ReturnType<typeof setTimeout> | undefined;
        const ro = new ResizeObserver(() => {
            clearTimeout(t);
            t = setTimeout(() => setWidth(Math.round(el.clientWidth)), width ? 250 : 0);
        });
        ro.observe(el);
        return () => {
            ro.disconnect();
            clearTimeout(t);
        };
    }, [width]);

    useEffect(() => {
        const el = host.current;
        if (!el || !width || !pack.length) return;
        const key = `${packIndex}-${isPhone}-${width}`;
        const { ownedBefore: owned, flippedCards: up } = latest.current;
        const s = createPackStage(el, {
            cards: pack.map((c, i) => toStageCard(c, owned(i))),
            packArt: set.set_image ?? "",
            packName: set.set_name,
            cardBack: CARD_BACK,
            flipped: [...up],
            phone: isPhone,
            onFlip: (i) => latest.current.onFlip(i),
            onReady: () => setReadyStage(key),
            onAllFlipped: () => undefined,
            onInspect: setInspected,
        });
        stage.current = s;
        return () => {
            s.destroy();
            stage.current = null;
        };
        // A new stage per pack, per layout and per width.
    }, [packIndex, pack, isPhone, width, set.set_image, set.set_name]);

    const ready = readyStage === `${packIndex}-${isPhone}-${width}`;
    const last = packIndex >= packCount - 1;
    const toggleSound = () => {
        setSoundOn(!sound);
        setSound(!sound);
    };

    return (
        <div className="ps-view h-full w-full flex flex-col min-h-0">
            <header className="ps-head flex items-center justify-between gap-3 px-3 md:px-4 pt-2 pb-2 shrink-0">
                <div className="flex gap-2 md:w-1/3">
                    <button onClick={onBack} className="ps-btn" aria-label={backLabel}>
                        <span className="md:hidden">‹</span>
                        <span className="hidden md:inline">{backLabel}</span>
                    </button>
                    <button onClick={onOpenAll} className="ps-btn">Open All</button>
                </div>
                <div className="text-center min-w-0 md:w-1/3">
                    <h2 className="text-base md:text-3xl font-black text-white drop-shadow-md leading-none truncate" style={{ fontFamily: "var(--font-display)" }}>{set.set_name}</h2>
                    <p className="text-primary font-bold text-sm md:text-lg leading-none mt-1">Pack {packIndex + 1} of {packCount}</p>
                </div>
                <div className="flex justify-end md:w-1/3">
                    <button onClick={toggleSound} className="ps-btn" aria-pressed={sound} aria-label={sound ? "Sound on" : "Sound off"}>
                        {sound ? "🔊" : "🔈"}
                    </button>
                </div>
            </header>

            <div ref={host} data-own-swipe className="ps-stage flex-1 min-h-0 mx-2 md:mx-6" />

            <div className="ps-bar shrink-0">
                {isPhone && <button className="ps-btn ps-btn--round" onClick={() => stage.current?.spin(-1)} disabled={!ready} aria-label="Turn left">‹</button>}
                {fullyOpened ? (
                    <button className="ps-btn" style={{ color: "#2a1c05", background: "linear-gradient(#ffe8a6, #e0b54f 55%, #b5852a)", borderColor: "#ffe08a" }} onClick={onNextPack}>
                        {last ? "Finish" : "Next Pack"}
                    </button>
                ) : (
                    <button className="ps-btn" onClick={() => stage.current?.flipAll()} disabled={!ready}>Flip All</button>
                )}
                {isPhone && <button className="ps-btn ps-btn--round" onClick={() => stage.current?.spin(1)} disabled={!ready} aria-label="Turn right">›</button>}
            </div>

            {inspected !== null && pack[inspected] && (
                <CardCloseUp
                    card={toStageCard(pack[inspected], ownedBefore(inspected))}
                    mark
                    from={() => stage.current?.cardAt(inspected)}
                    onClose={() => setInspected(null)}
                />
            )}
        </div>
    );
}
