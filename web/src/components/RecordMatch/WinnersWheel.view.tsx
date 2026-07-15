"use client";

import React, { useMemo, useState } from 'react';
import FrameButton from '@/components/ui/FrameButton.view';
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
 * WinnersWheel — the "you won, spin for a prize" modal (win path only).
 *
 * Presentational: an actual 6-segment wheel (conic-gradient slices + a fixed
 * pointer) that spins to a random prize, reveals it, then hands claiming back to
 * the parent via onClaim. Built from tokens + FrameButton so it matches the app
 * and re-themes with --primary. Prize list is the shared WHEEL_PRIZES.
 */
export default function WinnersWheel({ onSpinComplete, onClaim }: WinnersWheelProps) {
    const [spinning, setSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [result, setResult] = useState<WheelPrize | null>(null);

    // Alternating gold/dark wedges via a conic-gradient — themed off --primary.
    const wheelBackground = useMemo(() => {
        const stops = WHEEL_PRIZES.map((_, i) => {
            const from = i * SLICE;
            const to = (i + 1) * SLICE;
            const color = i % 2 === 0 ? 'var(--primary)' : 'var(--wood)';
            return `${color} ${from}deg ${to}deg`;
        }).join(', ');
        return `conic-gradient(from -${SLICE / 2}deg, ${stops})`;
    }, []);

    const handleSpin = () => {
        if (spinning || result) return;
        setSpinning(true);

        const index = Math.floor(Math.random() * WHEEL_PRIZES.length);
        const prize = WHEEL_PRIZES[index];

        // Land the chosen slice under the LEFT pointer (9 o'clock). In the top-
        // clockwise frame the left is 270deg, so rotate wedge i's center (at
        // i*SLICE) to 270. A left-side label is horizontal → the winning prize is
        // upright and readable at rest. Extra whole turns give the spin.
        const turns = 5;
        const target = turns * 360 + (270 - index * SLICE);
        setRotation(prev => prev + target);

        window.setTimeout(() => {
            setSpinning(false);
            setResult(prize);
            onSpinComplete?.(prize);
        }, SPIN_MS);
    };

    return (
        <div className="wheel-modal">
            <div className="text-center">
                <span className="record-eyebrow">Victory Reward</span>
                <h2 className="text-xl md:text-2xl font-black text-white leading-none mt-0.5">Winner&apos;s Wheel</h2>
            </div>

            {/* The wheel — a real spinning wheel under a FIXED LEFT pointer. Wedges
                and labels spin together by `rotation`, so the won prize lands at the
                pointer (9 o'clock). Labels lie ALONG their wedge like a row, so the
                wedge's full length holds the text (long names like STARLIGHT fit).
                A left-side label is horizontal, so the winning prize is always upright
                and readable at rest. */}
            <div className="wheel">
                <div className="wheel__pointer" aria-hidden />

                {/* Colored wedges — spin */}
                <div
                    className="wheel__disc"
                    style={{
                        background: wheelBackground,
                        transform: `rotate(${rotation}deg)`,
                        transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
                    }}
                />

                {/* Label layer — spins WITH the disc so labels track their wedges */}
                <div
                    className="wheel__labels"
                    aria-hidden
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
                    }}
                >
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
                                    style={{ color: i % 2 === 0 ? 'var(--ink)' : '#ffffff' }}
                                >
                                    {prize.short}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="wheel__hub" aria-hidden />
            </div>

            {/* Spin, or reveal + claim */}
            {result ? (
                <div className="text-center animate-in zoom-in duration-300 flex flex-col items-center gap-3">
                    <div>
                        <div className="text-[0.65rem] uppercase tracking-[0.3em] text-primary/80 mb-0.5">You won</div>
                        <div className="text-lg md:text-xl font-black text-primary leading-tight">{result.label}</div>
                    </div>
                    <FrameButton
                        onClick={() => onClaim(result)}
                        className="w-48 h-12"
                        textClassName="tracking-[0.15em]"
                        aria-label="Claim prize"
                    >
                        Claim Prize
                    </FrameButton>
                </div>
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
    );
}
