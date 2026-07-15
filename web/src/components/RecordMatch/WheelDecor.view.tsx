import React from 'react';

/**
 * Winner's Wheel ornamental furniture, drawn as crisp SVG. Split into TWO layers
 * because they move differently:
 *
 *   <WheelRim>  — the engraved gold RIM + boundary STUDS. SPINS WITH the wheel
 *                 (it's part of the wheel body, not a static frame), so it's
 *                 rendered inside the rotating layer.
 *   <WheelHub>  — the Eye-of-Horus HUB + the fixed ANKH POINTER. STATIC: the eye
 *                 stays centered and the pointer stays at 9 o'clock while the
 *                 wheel turns beneath them.
 *
 * All gold derives from --primary via the --wheel-gold-* / gradient tokens (see
 * globals.css), so a token swap re-themes the whole wheel. Coordinates are a
 * 0..100 square; each SVG is `absolute inset-0`, scaling 1:1 with the wheel.
 */

/** Shared gold gradient defs, keyed so two SVGs don't collide on ids. */
function GoldDefs({ idPrefix }: { idPrefix: string }) {
    return (
        <defs>
            {/* Beveled gold — 4 stops derived from --primary */}
            <linearGradient id={`${idPrefix}-gold`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--wheel-gold-bright)" />
                <stop offset="0.4" stopColor="var(--wheel-gold)" />
                <stop offset="0.7" stopColor="var(--wheel-gold-deep)" />
                <stop offset="1" stopColor="var(--wheel-gold-shadow)" />
            </linearGradient>
            {/* Domed stud — bright center, gold body, dark edge */}
            <radialGradient id={`${idPrefix}-stud`} cx="0.38" cy="0.32" r="0.75">
                <stop offset="0" stopColor="var(--wheel-gold-bright)" />
                <stop offset="0.5" stopColor="var(--wheel-gold)" />
                <stop offset="1" stopColor="var(--wheel-gold-shadow)" />
            </radialGradient>
        </defs>
    );
}

/**
 * WheelRim — spins with the wheel. Engraved gold ring + a stud boss at each wedge
 * boundary. `segments` = number of wedges.
 */
export function WheelRim({ segments }: { segments: number }) {
    const cx = 50;
    const cy = 50;
    const studRadius = 44.5;
    const slice = 360 / segments;
    const studs = Array.from({ length: segments }, (_, i) => {
        // Boundary i sits at the start of wedge i (wedges drawn from -slice/2,
        // 0deg = up, clockwise) — matches the disc's conic frame.
        const angle = (i * slice - slice / 2 - 90) * (Math.PI / 180);
        return { x: cx + studRadius * Math.cos(angle), y: cy + studRadius * Math.sin(angle) };
    });

    return (
        <svg className="wheel__rim-svg" viewBox="0 0 100 100" aria-hidden xmlns="http://www.w3.org/2000/svg">
            <GoldDefs idPrefix="rim" />

            {/* Engraved gold RIM: beveled band — dark outer edge, gold body, dark
                inner groove — plus a top-left highlight arc for carved-metal sheen. */}
            <circle cx={cx} cy={cy} r={48.5} fill="none" stroke="var(--wheel-gold-shadow)" strokeWidth={3} />
            <circle cx={cx} cy={cy} r={46.5} fill="none" stroke="url(#rim-gold)" strokeWidth={5} />
            <circle cx={cx} cy={cy} r={44} fill="none" stroke="var(--wheel-gold-deep)" strokeWidth={1.4} />
            <circle
                cx={cx} cy={cy} r={46.5} fill="none"
                stroke="var(--wheel-gold-bright)" strokeWidth={1} strokeOpacity={0.7}
                strokeDasharray="34 120" strokeDashoffset={80} strokeLinecap="round"
            />

            {/* Boundary STUD BOSSES — a rivet at each wedge divide */}
            {studs.map((s, i) => (
                <g key={i}>
                    <circle cx={s.x} cy={s.y} r={2.3} fill="var(--wheel-gold-shadow)" />
                    <circle cx={s.x} cy={s.y} r={1.8} fill="url(#rim-stud)" />
                    <circle cx={s.x} cy={s.y} r={0.6} fill="var(--wheel-gold-bright)" opacity={0.85} />
                </g>
            ))}
        </svg>
    );
}

/**
 * WheelHub — static. The Eye-of-Horus (Wadjet) hub at dead center + the fixed
 * carved-gold ankh pointer at 9 o'clock. Neither rotates.
 */
export function WheelHub() {
    const cx = 50;
    const cy = 50;
    return (
        <svg className="wheel__hub-svg" viewBox="0 0 100 100" aria-hidden xmlns="http://www.w3.org/2000/svg">
            <GoldDefs idPrefix="hub" />
            <defs>
                {/* Stone boss behind the eye */}
                <radialGradient id="hub-boss" cx="0.42" cy="0.36" r="0.75">
                    <stop offset="0" stopColor="var(--wheel-wedge-dark)" />
                    <stop offset="0.7" stopColor="#241a0e" />
                    <stop offset="1" stopColor="#0f0a05" />
                </radialGradient>
            </defs>

            {/* HUB: stone boss + Eye of Horus (Wadjet). The eye group is centered on
                (cx,cy): its 0..100 local artwork is translated by -50,-50 AFTER
                scaling, so the drawing's own centre lands exactly on the hub centre
                (no left lean). */}
            <circle cx={cx} cy={cy} r={9.5} fill="url(#hub-boss)" />
            <circle cx={cx} cy={cy} r={9.5} fill="none" stroke="url(#hub-gold)" strokeWidth={1.6} />
            <circle cx={cx} cy={cy} r={8} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={0.5} />
            <g transform={`translate(${cx} ${cy}) scale(0.15) translate(-50 -50)`}>
                <g fill="none" stroke="var(--wheel-gold-bright)" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round">
                    {/* Eye artwork centered in its own 0..100 box (centroid ≈ 50,50):
                        upper lid (filled), pupil, teardrop, curl, brow. */}
                    <path d="M22 50 Q44 36 70 44 Q58 54 38 56 Q28 56 22 50 Z" fill="var(--wheel-gold-bright)" stroke="none" />
                    <circle cx="45" cy="50" r="5.5" fill="#1a1206" stroke="none" />
                    <path d="M44 57 L40 74" />
                    <path d="M54 57 Q58 70 50 76 Q46 78 48 72" />
                    <path d="M24 43 Q44 30 70 38" strokeWidth={4} />
                </g>
            </g>

            {/* POINTER at 9 o'clock: a bold carved-gold arrowhead whose TIP just
                kisses the outer rim. Body + boss sit OUTSIDE the wheel; an ANKH
                (loop-topped cross — an Egyptian glyph, not the ♀ Venus sign the old
                open loop read as) is engraved on the boss. */}
            <g transform="translate(-5 50)">
                <circle cx={-2} cy={0} r={5.5} fill="var(--wheel-gold-shadow)" />
                <circle cx={-2} cy={0} r={4.6} fill="url(#hub-stud)" />
                {/* Ankh: a CLOSED teardrop loop on top + crossbar + stem. Reads as an
                    ankh (not Venus) because the loop is a filled teardrop, not an
                    open ring, and the crossbar sits below it. */}
                <g fill="none" stroke="var(--wheel-wedge-dark)" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M-2 -2.7 Q-0.7 -1.7 -2 -0.6 Q-3.3 -1.7 -2 -2.7 Z" fill="var(--wheel-wedge-dark)" stroke="none" />
                    <path d="M-2 -0.6 L-2 2.6" />
                    <path d="M-3.6 0.7 L-0.4 0.7" />
                </g>
                <path
                    d="M6.5 0 L1 -4.5 L2.4 0 L1 4.5 Z"
                    fill="url(#hub-gold)"
                    stroke="var(--wheel-gold-shadow)"
                    strokeWidth={0.8}
                    strokeLinejoin="round"
                />
                <path d="M2 -3.4 L6 -0.3" stroke="var(--wheel-gold-bright)" strokeWidth={0.7} strokeOpacity={0.8} />
            </g>
        </svg>
    );
}
