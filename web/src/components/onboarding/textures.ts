// Procedural textures as SVG data URIs: rasterised once by the browser, then tiled like images.

const svg = (size: number, body: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`)}")`;

/** Grey paper fibre lit from the top left; multiply it over a paper colour. */
export const PAPER_GRAIN = svg(
    360,
    `<filter id='f' x='0' y='0' width='100%' height='100%'>
        <feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='4' stitchTiles='stitch'/>
        <feDiffuseLighting lighting-color='#fff' surfaceScale='0.9' diffuseConstant='1.05'><feDistantLight azimuth='225' elevation='60'/></feDiffuseLighting>
    </filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
);

/** Soft blotches for aged paper; multiply, at low opacity. */
export const PAPER_MOTTLE = svg(
    600,
    `<filter id='f' x='0' y='0' width='100%' height='100%'>
        <feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3' seed='9' stitchTiles='stitch'/>
        <feColorMatrix values='0 0 0 0 0.6  0 0 0 0 0.47  0 0 0 0 0.32  0 0 0 -0.75 0.52'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
);

/** Dark walnut: long grain streaks with fine pores. */
export const WOOD = svg(
    700,
    `<filter id='f' x='0' y='0' width='100%' height='100%'>
        <feTurbulence type='fractalNoise' baseFrequency='0.0035 0.11' numOctaves='4' seed='12' stitchTiles='stitch' result='g'/>
        <feColorMatrix in='g' values='0 0 0 0.55 0.06  0 0 0 0.33 0.03  0 0 0 0.19 0.015  0 0 0 0 1' result='c'/>
        <feTurbulence type='fractalNoise' baseFrequency='0.9 0.04' numOctaves='2' seed='3' stitchTiles='stitch' result='p'/>
        <feDiffuseLighting in='p' lighting-color='#fff' surfaceScale='1.4' result='l'><feDistantLight azimuth='270' elevation='50'/></feDiffuseLighting>
        <feBlend in='c' in2='l' mode='multiply'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
);

/** Pebbled leather grain, lit; multiply over a leather colour. */
export const LEATHER = svg(
    240,
    `<filter id='f' x='0' y='0' width='100%' height='100%'>
        <feTurbulence type='turbulence' baseFrequency='0.32' numOctaves='2' seed='5' stitchTiles='stitch'/>
        <feDiffuseLighting lighting-color='#fff' surfaceScale='1.6'><feDistantLight azimuth='235' elevation='55'/></feDiffuseLighting>
    </filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
);

/** Envelope liner: gold stars on oxblood. */
export const LINER = svg(
    56,
    `<rect width='56' height='56' fill='#4a0d10'/>
    <path d='M14 4l2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L6.2 9.8l5.4-.8z' fill='#c9a032' opacity='0.8'/>
    <path d='M42 32l2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z' fill='#c9a032' opacity='0.8'/>`,
);
