// The app's icons, for installing it on a phone or desktop: the Millennium Eye in gold on the duel
// arena's dark purple. Solid backgrounds (iOS doesn't do transparent home-screen icons); the
// "maskable" one keeps the eye inside the middle 60% so any shape a phone cuts it to fits.
//
//   node scripts/images/app-icons.mjs        (from web/; writes public/icons/)
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const EYE = "public/ui/millennium-eye.webp";
const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

const background = (size) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs><radialGradient id="g" cx="50%" cy="46%" r="65%">
            <stop offset="0" stop-color="#3a2a5e"/><stop offset="0.55" stop-color="#191326"/><stop offset="1" stop-color="#07050b"/>
        </radialGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`);

async function icon(file, size, eyeShare) {
    const eye = await sharp(EYE).resize({ width: Math.round(size * eyeShare), kernel: "lanczos3" }).png().toBuffer();
    const { width, height } = await sharp(eye).metadata();
    await sharp(background(size))
        .composite([{ input: eye, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
        .png({ compressionLevel: 9 })
        .toFile(`${OUT}/${file}`);
    console.log(`${OUT}/${file}`);
}

await icon("icon-192.png", 192, 0.74);
await icon("icon-512.png", 512, 0.74);
await icon("maskable-512.png", 512, 0.56);
await icon("apple-touch-icon.png", 180, 0.72);
