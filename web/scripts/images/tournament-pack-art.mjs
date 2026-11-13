// Tournament-pack art (the "3 Tournament Packs" reward), served from R2 at packs/<SET_CODE>.webp.
// Sources are in src/data/tournament_pack_art.json: Yugipedia's scans, English printings
// (a German one where it is far bigger and its title is in English). Most are only
// 150-220px wide, so they are upscaled 4x with Real-ESRGAN before upload.
//
//   node scripts/images/tournament-pack-art.mjs fetch      download and trim into temp_packs/src
//   <python> scripts/images/upscale.py <RealESRGAN_x4plus.pth> scripts/images/temp_packs/src scripts/images/temp_packs/up
//   node scripts/images/tournament-pack-art.mjs upload     WebP from temp_packs/up, to R2 (needs web/.env.local)
//
// The python step needs torch and spandrel (the local ComfyUI venv has both).

import { mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TEMP = join(WEB, "scripts/images/temp_packs");
/** Wide enough for the pack on a high-density screen (it shows about 330px wide). */
const WIDTH = 720;
const sources = JSON.parse(readFileSync(join(WEB, "src/data/tournament_pack_art.json"), "utf8"));
const step = process.argv[2];

if (step === "fetch") {
    mkdirSync(join(TEMP, "src"), { recursive: true });
    for (const [code, url] of Object.entries(sources)) {
        const res = await fetch(url, { headers: { "user-agent": "ygo-progression-pack-art/1.0" } });
        if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
        // Some scans sit on a white margin: cut it (and any transparent one) off.
        const trimmed = await sharp(Buffer.from(await res.arrayBuffer())).ensureAlpha().trim({ threshold: 20 }).png().toBuffer();
        await sharp(trimmed).toFile(join(TEMP, "src", `${code}.png`));
        console.log(code, (await sharp(trimmed).metadata()).width);
    }
} else if (step === "upload") {
    const dotenv = await import("dotenv");
    dotenv.config({ path: join(WEB, ".env.local") });
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKET_NAME } = process.env;
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_BUCKET_NAME) {
        throw new Error("Missing Cloudflare R2 credentials in web/.env.local");
    }
    const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: CLOUDFLARE_ACCESS_KEY_ID, secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY },
    });
    const files = readdirSync(join(TEMP, "up")).filter((f) => f.endsWith(".png"));
    for (const file of files) {
        const code = file.replace(/\.png$/, "");
        if (!sources[code]) continue;
        const body = await sharp(join(TEMP, "up", file)).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        await s3.send(new PutObjectCommand({
            Bucket: CLOUDFLARE_BUCKET_NAME, Key: `packs/${code}.webp`, Body: body,
            ContentType: "image/webp", CacheControl: "public, max-age=604800",
        }));
        console.log(`packs/${code}.webp`, `${Math.round(body.length / 1024)} KB`);
    }
} else {
    console.log("Usage: node scripts/images/tournament-pack-art.mjs fetch|upload");
}
