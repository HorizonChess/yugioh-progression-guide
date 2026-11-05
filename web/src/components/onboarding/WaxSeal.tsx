import { forwardRef } from "react";

// A wobbly blob, as if the wax spread unevenly: seeded so server and client agree.
const BLOB = (() => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const r = 80 + rand() * 9 + (i % 7 === 3 ? 8 : 0);
        return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r] as const;
    });
    const mid = (i: number) => {
        const [ax, ay] = pts[i % pts.length]!;
        const [bx, by] = pts[(i + 1) % pts.length]!;
        return `${((ax + bx) / 2).toFixed(1)} ${((ay + by) / 2).toFixed(1)}`;
    };
    return `M${mid(0)} ` + pts.map((p, i) => `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${mid(i)}`).slice(1).join(" ") + ` Q${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)} ${mid(0)}Z`;
})();

// The Seal of Orichalcos's shape: a unicursal hexagram, one line through six points
// on the inner ring, crossing itself in an X at the centre (top, lower right,
// upper left, bottom, upper right, lower left, and back to the top).
const point = (deg: number, r: number) => `${(100 + Math.cos((deg * Math.PI) / 180) * r).toFixed(1)} ${(100 + Math.sin((deg * Math.PI) / 180) * r).toFixed(1)}`;
const HEXAGRAM = "M" + [-90, 30, 210, 90, -30, 150].map((deg) => point(deg, 46)).join(" L") + " Z";
// Rune-like marks around the band between the rings: alternately long and short.
const RUNES = Array.from({ length: 32 }, (_, i) => `M${point(i * 11.25, 49)} L${point(i * 11.25, i % 2 ? 52.5 : 55)}`).join(" ");

/** Wax pressed with the Orichalcos seal: lighting comes from SVG filters, so it has real gloss and an embossed rim. */
const WaxSeal = forwardRef<SVGSVGElement, { className?: string }>(function WaxSeal({ className }, ref) {
    return (
        <svg ref={ref} viewBox="0 0 200 200" className={className} aria-hidden>
            <defs>
                {/* The blob is drawn black and the pressed emblem red: the filter reads red as "pressed in". */}
                <filter id="ob-seal-wax" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                    <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" />
                    <feGaussianBlur stdDeviation="1.1" result="press" />
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="rim" />
                    <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="8" result="noise" />
                    <feComposite in="noise" in2="rim" operator="arithmetic" k2="0.16" k3="1" />
                    <feComposite in2="press" operator="arithmetic" k2="1" k3="-0.55" result="height" />
                    <feDiffuseLighting in="height" surfaceScale="7" diffuseConstant="1.2" lightingColor="#fff" result="diffuse">
                        <feDistantLight azimuth="225" elevation="42" />
                    </feDiffuseLighting>
                    <feFlood floodColor="#9a1b1b" />
                    <feBlend in2="diffuse" mode="multiply" result="shaded" />
                    <feSpecularLighting in="height" surfaceScale="7" specularConstant="1.15" specularExponent="26" lightingColor="#ffe6dc" result="gloss">
                        <fePointLight x="50" y="30" z="160" />
                    </feSpecularLighting>
                    <feComposite in="shaded" in2="SourceAlpha" operator="in" result="body" />
                    <feComposite in="gloss" in2="SourceAlpha" operator="in" result="shine" />
                    <feMerge>
                        <feMergeNode in="body" />
                        <feMergeNode in="shine" />
                    </feMerge>
                </filter>
            </defs>
            <g filter="url(#ob-seal-wax)">
                <path d={BLOB} fill="#000" />
                <g fill="none" stroke="#f00" strokeLinejoin="round">
                    <circle cx="100" cy="100" r="58.5" strokeWidth="4" />
                    <circle cx="100" cy="100" r="46.5" strokeWidth="2.5" />
                    <path d={RUNES} strokeWidth="2.2" strokeLinecap="round" />
                    <path d={HEXAGRAM} strokeWidth="4" />
                </g>
            </g>
            <g className="ob-seal__cracks" fill="none" stroke="#2a0505" strokeWidth="2.4" strokeLinejoin="round" opacity="0.85">
                <path d="M100 100 L112 84 L108 66 L121 47 L118 24" />
                <path d="M100 100 L83 107 L70 98 L49 112 L26 108" />
                <path d="M100 100 L104 121 L94 140 L101 162 L95 182" />
            </g>
        </svg>
    );
});

export default WaxSeal;
