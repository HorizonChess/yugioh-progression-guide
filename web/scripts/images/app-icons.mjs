// The app's icons, for installing it on a phone or desktop: a card, face down (the back the duel
// board deals), standing slightly turned on the duel arena's dark purple. Solid backgrounds (iOS
// doesn't do transparent home-screen icons); the "maskable" one keeps the card inside the middle 60%
// so any shape a phone cuts the icon to fits.
//
//   node scripts/images/app-icons.mjs        (from web/; writes public/icons/)
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || "https://pub-9397530dccf24d04a56c8eafb6e3edd0.r2.dev";
const back = Buffer.from(await (await fetch(`${HOST}/cards/back_high.jpg`)).arrayBuffer());
const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

const background = (size) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs><radialGradient id="g" cx="50%" cy="46%" r="65%">
            <stop offset="0" stop-color="#3a2a5e"/><stop offset="0.55" stop-color="#191326"/><stop offset="1" stop-color="#07050b"/>
        </radialGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`);

/** The card at `height` px, its corners rounded as a printed card's, turned `tilt` degrees, with a shadow under it. */
async function card(height, tilt) {
    const width = Math.round((height * 59) / 86);
    const radius = Math.round(width * 0.045);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
    const face = await sharp(back).resize(width, height, { fit: "fill", kernel: "lanczos3" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    // A soft shadow: the card's shape, dark and blurred, a little below it.
    const pad = Math.round(height * 0.12);
    const shadow = await sharp({ create: { width: width + pad * 2, height: height + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#000" fill-opacity="0.75"/></svg>`), left: pad, top: Math.round(pad * 1.25) }])
        .blur(Math.max(1, height * 0.035))
        .png()
        .toBuffer();
    const stacked = await sharp(shadow).composite([{ input: face, left: pad, top: pad }]).png().toBuffer();
    return sharp(stacked).rotate(tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function icon(file, size, share) {
    const c = await card(Math.round(size * share), -8);
    const { width, height } = await sharp(c).metadata();
    await sharp(background(size))
        .composite([{ input: c, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
        .png({ compressionLevel: 9 })
        .toFile(`${OUT}/${file}`);
    console.log(`${OUT}/${file}`);
}

await icon("icon-192.png", 192, 0.7);
await icon("icon-512.png", 512, 0.7);
await icon("maskable-512.png", 512, 0.52);
await icon("apple-touch-icon.png", 180, 0.68);
