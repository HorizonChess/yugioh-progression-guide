// Downloads every booster image in src/data/booster_images.json and saves a small
// WebP copy to public/packs/<SET_CODE>.webp, so the site serves pack art itself
// instead of linking Yugipedia's full-size PNGs (up to ~5 MB each).
//
//   node scripts/images/pack-art.mjs            (skips packs already converted)
//   node scripts/images/pack-art.mjs --force

import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(WEB, "public/packs");
const WIDTH = 480;
const force = process.argv.includes("--force");
const images = JSON.parse(readFileSync(join(WEB, "src/data/booster_images.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

const todo = Object.entries(images).filter(([code]) => force || !existsSync(join(OUT, `${code}.webp`)));
let done = 0, failed = [];
for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async ([code, url]) => {
        try {
            const res = await fetch(url, { headers: { "user-agent": "ygo-progression-pack-art/1.0" } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            await sharp(buf).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(OUT, `${code}.webp`));
            done++;
        } catch (e) {
            failed.push(`${code}: ${e.message}`);
        }
    }));
}
console.log(`Converted ${done} of ${todo.length}.${failed.length ? " Failed: " + failed.join(", ") : ""}`);
