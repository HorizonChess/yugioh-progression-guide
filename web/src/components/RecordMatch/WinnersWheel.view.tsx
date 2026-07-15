"use client";

import React, { useMemo, useState } from 'react';
import FrameButton from '@/components/ui/FrameButton.view';
import { WheelRim, WheelHub } from '@/components/RecordMatch/WheelDecor.view';
import { WHEEL_PRIZES, WheelPrize } from '@/lib/rewards';

interface WinnersWheelProps {
    /** Fired once the spin animation settles on a prize. */
    onSpinComplete?: (prize: WheelPrize) => void;
    /** Fired when the player claims the revealed prize. */
    onClaim: (prize: WheelPrize) => void;
}

const SPIN_MS = 3600;              // wheel-settle duration
const SLICE = 360 / WHEEL_PRIZES.length;

/**
 * WinnersWheel — the "you won, spin for a prize" CONTENT (win path only).
 *
 * The WHEEL CONTENT of the win moment: heading → spinning wheel → spin/claim.
 * It is rendered INSIDE the shared, always-mounted `.win-panel` (see
 * RecordMatchPage.controller) — it curtains IN where the record board vortexed
 * OUT, without the panel box moving. So this is just the inner stack; the panel,
 * centering, and glass surface live in the controller.
 *
 * Presentational: an actual segmented wheel that spins to a random prize, reveals
 * it, then hands claiming back to the parent via onClaim. Built from tokens +
 * FrameButton so it matches the app and re-themes with --primary. Prize list is
 * the shared WHEEL_PRIZES.
 */
export default function WinnersWheel({ onSpinComplete, onClaim }: WinnersWheelProps) {
    const [spinning, setSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [result, setResult] = useState<WheelPrize | null>(null);

    // Alternating GOLD-LEAF / dark-STONE wedges via a conic-gradient. Both fills
    // derive from --primary (see --wheel-wedge-* tokens) so a token swap re-themes
    // the whole face. Hard stops at each slice keep crisp wedge edges; a separate
    // radial overlay (CSS) adds the domed sheen so it isn't a flat pie.
    const wheelBackground = useMemo(() => {
        const stops = WHEEL_PRIZES.map((_, i) => {
            const from = i * SLICE;
            const to = (i + 1) * SLICE;
            const color = i % 2 === 0 ? 'var(--wheel-wedge-light)' : 'var(--wheel-wedge-dark)';
            return `${color} ${from}deg ${to}deg`;
        }).join(', ');
        return `conic-gradient(from -${SLICE / 2}deg, ${stops})`;
    }, []);

    const handleSpin = () => {
        if (spinning || result) return;
        setSpinning(true);

        const index = Math.floor(Math.random() * WHEEL_PRIZES.length);
        const prize = WHEEL_PRIZES[index];

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
        <div className="wheel-content">
            <div className="text-center">
                <span className="record-eyebrow">Victory Reward</span>
                <h2 className="text-2xl md:text-3xl font-black text-white leading-none mt-1">Winner&apos;s Wheel</h2>
            </div>

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
                    <WheelRim segments={WHEEL_PRIZES.length} />
                </div>

                {/* Label layer — spins WITH the disc so labels track their wedges */}
                <div className="wheel__labels" aria-hidden style={spinStyle}>
                    {WHEEL_PRIZES.map((prize, i) => {
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

            {/* Footer — a CONSTANT-height slot so the 1fr wheel row never resizes
                when the result appears (otherwise the wheel visibly jumps smaller
                the instant the spin ends). The "You won / prize" line is ALWAYS in
                the layout; before the reveal it's just visibility:hidden (space
                reserved). The button below keeps the same box and only swaps its
                label/handler Spin → Claim. */}
            <div className="wheel-footer">
                <div className={`wheel-prize ${result ? 'is-revealed' : ''}`} aria-hidden={!result}>
                    <div className="wheel-prize__kicker">You won</div>
                    <div className="wheel-prize__name">{result ? result.label : ' '}</div>
                </div>

                {result ? (
                    <FrameButton
                        onClick={() => onClaim(result)}
                        className="w-48 h-12"
                        textClassName="tracking-[0.15em]"
                        aria-label="Claim prize"
                    >
                        Claim Prize
                    </FrameButton>
                ) : (
                    <FrameButton
                        onClick={handleSpin}
                        className="w-48 h-12"
                        textClassName="tracking-[0.15em]"
                        aria-label="Spin the wheel"
                    >
                        {spinning ? 'Spinning…' : 'Spin the Wheel'}
                    </FrameButton>
                )}
            </div>
        </div>
    );
}
