// Cuts a generated button off its flat magenta background and trims to the object.
// The button stays one whole image: it's scaled as a unit, never sliced.
//
//   node cutout.mjs src/w-cartouche.img img/w-cartouche.webp
import sharp from "sharp";

const [src, out] = process.argv.slice(2);
const { data, info } = await sharp(src).resize(1600).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // How magenta a pixel is: red and blue high, green well below both.
    const m = Math.min(r, b) - g;
    if (m > 40) {
        const a = Math.max(0, Math.min(255, 255 - (m - 40) * 3));
        data[i + 3] = a;
        // Pull the pink fringe out of semi-transparent edge pixels.
        if (a < 255) { data[i] = Math.min(r, g + 40); data[i + 2] = Math.min(b, g + 30); }
    }
}
await sharp(data, { raw: info }).trim({ threshold: 10 }).webp({ quality: 88, alphaQuality: 92 }).toFile(out);
const meta = await sharp(out).metadata();
console.log(out, meta.width, "x", meta.height);
