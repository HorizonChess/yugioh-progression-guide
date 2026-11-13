// Rock-paper-scissors card art (the pregame showdown, RpsShowdown.tsx), served from R2 at
// rps/<hand>.webp. The three cards were generated with Gemini: Rock in a monster's orange, Paper
// in a spell's teal, Scissors in a trap's magenta.
//
//   node scripts/images/rps-art.mjs <dir with rock, paper and scissors images>   (needs web/.env.local)

import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
/** The showdown shows a card up to 170px wide: twice that and a bit for high-density screens. */
const WIDTH = 400;
const dir = process.argv[2];
if (!dir) throw new Error("Usage: node scripts/images/rps-art.mjs <dir>");

dotenv.config({ path: join(WEB, ".env.local") });
const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKET_NAME } = process.env;
if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_BUCKET_NAME) {
    throw new Error("Missing Cloudflare R2 credentials in web/.env.local");
}
const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: CLOUDFLARE_ACCESS_KEY_ID, secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY },
});
const files = readdirSync(dir);
for (const hand of ["rock", "paper", "scissors"]) {
    const file = files.find((f) => f.replace(/\.[^.]+$/, "") === hand);
    if (!file) throw new Error(`No ${hand} image in ${dir}`);
    const body = await sharp(join(dir, file)).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    await s3.send(new PutObjectCommand({
        Bucket: CLOUDFLARE_BUCKET_NAME, Key: `rps/${hand}.webp`, Body: body,
        ContentType: "image/webp", CacheControl: "public, max-age=604800",
    }));
    console.log(`rps/${hand}.webp`, `${Math.round(body.length / 1024)} KB`);
}
