"use client";

import React, { useMemo, useState } from 'react';
import CartoucheButton from '@/components/ui/CartoucheButton';
import { WheelRim, WheelHub } from '@/components/record-match/WheelDecor';
import { alertRepoError } from '@/context/ProgressionContext';
import { WheelPrize } from '@/lib/rewards';

interface WinnersWheelProps {
    /** The wedges, in order: the series' wheel. */
    prizes: readonly WheelPrize[];
    /** Asks the repository for the prize; the wheel animates to it. */
    spin: () => Promise<WheelPrize>;
    /** Fired once the spin animation settles on a prize. */
    onSpinComplete?: (prize: WheelPrize) => void;
    /** Fired when the player claims the revealed prize. */
    onClaim: (prize: WheelPrize) => void;
}

const SPIN_MS = 3600;              // wheel-settle duration

/**
 * WinnersWheel — the "you won, spin for a prize" CONTENT (win path only).
 *
 * The WHEEL CONTENT of the win moment: heading → spinning wheel → spin/claim.
 * It is rendered INSIDE the shared, always-mounted `.win-panel` (see
 * app/record-match/page.tsx) — it curtains IN where the record board vortexed
 * OUT, without the panel box moving. So this is just the inner stack; the panel,
 * centering, and glass surface live in the page.
 *
 * Presentational: an actual segmented wheel that spins to a random prize, reveals
 * it, then hands claiming back to the parent via onClaim. Built from tokens +
 * FrameButton so it matches the app and re-themes with --primary. Prize list is
 * the series' wheel (`wheelPrizesFor`), and the repository picks where it lands.
 */
export default function WinnersWheel({ prizes, spin, onSpinComplete, onClaim }: WinnersWheelProps) {
    const SLICE = 360 / prizes.length;
    const [spinning, setSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [result, setResult] = useState<WheelPrize | null>(null);

    // Alternating GOLD-LEAF / dark-STONE wedges via a conic-gradient. Both fills
    // derive from --primary (see --wheel-wedge-* tokens) so a token swap re-themes
    // the whole face. Hard stops at each slice keep crisp wedge edges; a separate
    // radial overlay (CSS) adds the domed sheen so it isn't a flat pie.
    const wheelBackground = useMemo(() => {
        const stops = prizes.map((_, i) => {
            const from = i * SLICE;
            const to = (i + 1) * SLICE;
            const color = i % 2 === 0 ? 'var(--wheel-wedge-light)' : 'var(--wheel-wedge-dark)';
            return `${color} ${from}deg ${to}deg`;
        }).join(', ');
        return `conic-gradient(from -${SLICE / 2}deg, ${stops})`;
    }, [prizes, SLICE]);

    const handleSpin = async () => {
        if (spinning || result) return;
        setSpinning(true);
        let prize: WheelPrize;
        try {
            prize = await spin();
        } catch (error) {
            setSpinning(false);
            return alertRepoError(error);
        }
        const index = Math.max(0, prizes.findIndex((p) => p.id === prize.id));

        // Land the chosen wedge under the LEFT pointer (9 o'clock). In the top-
        // clockwise frame the left is 270deg, so rotating wedge i's CENTER (at
        // i*SLICE) to 270 would park the pointer dead-center. Instead we add a
        // random JITTER within the wedge so it stops NATURALLY — off-centre, some
        // spins near a boundary — which creates real "did it land on it?" tension.
        // Bound the jitter to ±38% of the slice so the pointer always stays clearly
        // INSIDE the winning wedge (never on a divider), keeping the result honest.
        const jitter = (Math.random() - 0.5) * 2 * (SLICE * 0.38);
        const turns = 5;
        const target = turns * 360 + (270 - index * SLICE) + jitter;
        setRotation(prev => prev + target);

        window.setTimeout(() => {
            setSpinning(false);
            setResult(prize);
            onSpinComplete?.(prize);
        }, SPIN_MS);
    };

    // Shared spin transform — applied to EVERY layer that turns with the wheel
    // (wedges, rim/studs, labels) so they rotate as one body. Only the hub + the
    // fixed pointer stay still.
    //
    // `willChange:transform` + `translateZ(0)` pin these layers onto their OWN
    // compositor layer PERMANENTLY (during AND after the spin). Without it the
    // browser rasterizes cheaply while animating, then re-rasterizes crisply the
    // instant the transition ends — a visible "sharpen"/pop that breaks the
    // spinning-wheel illusion. A stable GPU layer renders identically throughout.
    const spinStyle: React.CSSProperties = {
        transform: `translateZ(0) rotate(${rotation}deg)`,
        transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
        willChange: 'transform',
    };

    return (
        <div className="rm-wheel">
            <div className="rm-wheel__dial">
            {/* The wheel row — a flex cell that gives the (height-driven, square)
                wheel a definite box to size against so it stays perfectly circular. */}
            <div className="wheel-row">
            {/* The wheel — a real spinning wheel under a FIXED LEFT pointer. Wedges
                and labels spin together by `rotation`, so the won prize lands at the
                pointer (9 o'clock). Labels lie ALONG their wedge like a row, so the
                wedge's full length holds the text (long names like STARLIGHT fit).
                A left-side label is horizontal, so the winning prize is always upright
                and readable at rest. */}
            <div className="wheel">
                {/* Colored wedges — spin. `wheel__disc` carries the conic wedges;
                    `wheel__sheen` is a static domed highlight so the disc reads as a
                    convex carved face, not a flat pie. */}
                <div
                    className="wheel__disc"
                    style={{ background: wheelBackground, ...spinStyle }}
                />

                {/* Rim + studs — SPIN WITH the wheel (they're the wheel's body, not a
                    static frame; a still rim would look like a picture frame). */}
                <div className="wheel__rim" aria-hidden style={spinStyle}>
                    <WheelRim segments={prizes.length} />
                </div>

                {/* Label layer — spins WITH the disc so labels track their wedges */}
                <div className="wheel__labels" aria-hidden style={spinStyle}>
                    {prizes.map((prize, i) => {
                        // Wedge i's mid-angle, 0deg = top, clockwise. The label strip is
                        // anchored at the hub and rotated by (i*SLICE - 90) to lie along
                        // wedge i. Orientation is STATIC (painted on the wheel), so labels
                        // turn bodily with their wedge like paint — no end-of-spin snap.
                        // The winner always rests at the LEFT pointer, where .wheel__label
                        // reads upright; the opposite side is inverted, like a real wheel.
                        const deg = i * SLICE - 90;
                        return (
                            <div
                                key={prize.id}
                                className="wheel__label-strip"
                                style={{ transform: `rotate(${deg}deg)` }}
                            >
                                <span
                                    className="wheel__label"
                                    style={{
                                        // Contrast that re-themes with --primary: dark ink
                                        // on the light (metal) wedges, bright gold-white on
                                        // the dark (stone) wedges.
                                        color: i % 2 === 0 ? 'var(--wheel-wedge-dark)' : 'var(--wheel-gold-bright)',
                                    }}
                                >
                                    {prize.short}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Static domed sheen over the spinning wedges (does not rotate) */}
                <div className="wheel__sheen" aria-hidden />

                {/* Static furniture: Eye-of-Horus hub + the fixed ankh pointer. Does
                    NOT spin — the wheel turns beneath it and a wedge lands at the
                    pointer. */}
                <div className="wheel__decor-layer" aria-hidden>
                    <WheelHub />
                </div>
            </div>
            </div>

            </div>

            {/* The prize line and the one button beside the wheel: Spin, then Claim. */}
            <div className="rm-wheel__side">
                <div className="wheel-prize is-revealed" aria-live="polite">
                    <div className="wheel-prize__kicker">{result ? "You won" : "Spin for your prize"}</div>
                    <div className="wheel-prize__name">{result ? result.label : "Winner's Wheel"}</div>
                </div>
                {result ? (
                    <CartoucheButton onClick={() => onClaim(result)} aria-label="Claim prize">Claim prize</CartoucheButton>
                ) : (
                    <CartoucheButton onClick={handleSpin} aria-label="Spin the wheel">{spinning ? "Spinning…" : "Spin the wheel"}</CartoucheButton>
                )}
            </div>
        </div>
    );
}
