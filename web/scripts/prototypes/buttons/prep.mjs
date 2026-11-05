// Turns a generated button plaque into a 9-slice frame and a separate centre panel.
// The frame's flat background (white or black) near the outer edge becomes transparent.
//
//   node prep.mjs src/a-remaster.jpg img/a white 0.19 0.107
//   (source, output prefix, background, slice as a share of height, slice as a share of width)
import sharp from "sharp";

const [src, out, bg, sy, sx] = process.argv.slice(2);
const W = 1376;
const { data, info } = await sharp(src).resize(W).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const band = Math.round(height * 0.12);
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
        if (edge > band) continue;
        const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        // Distance from the flat background colour, softened into alpha.
        const d = bg === "white" ? 255 - min + (max - min) : max;
        data[i + 3] = Math.max(0, Math.min(255, (d - 14) * 9));
    }
}
const frame = sharp(data, { raw: { width, height, channels: 4 } });
await frame.clone().webp({ quality: 88, alphaQuality: 90 }).toFile(`${out}-frame.webp`);
const left = Math.round(width * Number(sx)), top = Math.round(height * Number(sy));
await sharp(src).resize(W).extract({ left, top, width: width - left * 2, height: height - top * 2 }).webp({ quality: 84 }).toFile(`${out}-centre.webp`);
console.log(`${out}: slice ${top}px top/bottom, ${left}px left/right`);
