// Puts the duel engine's data on R2 for browsers: the practice bot thinks on the player's device
// (a Web Worker running the same engine), and fetches the data the server plays from.
//
//   npm run fetch-engine -w @ygo/api                 (api/engine-data, the pinned version)
//   npx tsx web/scripts/engine/upload-engine.mjs     (needs web/.env.local; FORCE=1 uploads again)
//
// Until it's run for the pinned version, the server plays practice games itself (hub.ts, onDevice).
//
// Under engine/<data id>/ (the id names the pinned commits: engineDataId, duel/src/engine-id.ts):
//   cards.json, strings.json   as the server has them (gzipped)
//   libs.json                  every library script (utility.lua, proc_*.lua…): name → text (gzipped)
//   scripts/c<code>.lua        each card's script: official/, else pre-errata/, else goat/ (as the server reads them)
//   done.json                  written last: the upload is whole
// Each version has its own folder, so files never change once there (cached for good).

import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";
import dotenv from "dotenv";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { engineDataId } from "../../../duel/src/engine-id.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA = process.env.ENGINE_DATA ?? join(ROOT, "api/engine-data");
dotenv.config({ path: join(ROOT, "web/.env.local") });
const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKET_NAME } = process.env;
if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_BUCKET_NAME) {
    throw new Error("Missing Cloudflare R2 credentials in web/.env.local");
}
if (!existsSync(join(DATA, "version.json"))) throw new Error(`No engine data in ${DATA}: run npm run fetch-engine -w @ygo/api`);

const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: CLOUDFLARE_ACCESS_KEY_ID, secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY },
});

const version = readFileSync(join(DATA, "version.json"), "utf-8");
const v = JSON.parse(version);
const prefix = `engine/${engineDataId(version)}`;
const CACHE = "public, max-age=31536000, immutable";

async function exists(key) {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: CLOUDFLARE_BUCKET_NAME, Key: key }));
        return true;
    } catch {
        return false;
    }
}
const put = (key, body, type, gzip = false) =>
    s3.send(new PutObjectCommand({
        Bucket: CLOUDFLARE_BUCKET_NAME, Key: `${prefix}/${key}`, Body: gzip ? gzipSync(body) : body,
        ContentType: type, CacheControl: CACHE, ...(gzip ? { ContentEncoding: "gzip" } : {}),
    }));

if (!process.env.FORCE && (await exists(`${prefix}/done.json`))) {
    console.log(`${prefix} is already uploaded (FORCE=1 to upload it again)`);
    process.exit(0);
}

const scriptsDir = join(DATA, "scripts");
const libs = Object.fromEntries(readdirSync(scriptsDir).filter((f) => f.endsWith(".lua")).map((f) => [f, readFileSync(join(scriptsDir, f), "utf-8")]));
await put("cards.json", readFileSync(join(DATA, "cards.json")), "application/json", true);
await put("strings.json", readFileSync(join(DATA, "strings.json")), "application/json", true);
await put("libs.json", JSON.stringify(libs), "application/json", true);
console.log(`${prefix}: cards, strings and ${Object.keys(libs).length} libraries`);

// Each card's script, from the first folder that has it.
const cards = new Map();
for (const dir of ["goat", "pre-errata", "official"]) {
    const d = join(scriptsDir, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (/^c\d+\.lua$/.test(f)) cards.set(f, join(d, f));
}
const files = [...cards];
let done = 0;
async function worker() {
    for (;;) {
        const next = files.pop();
        if (!next) return;
        const [name, file] = next;
        for (let attempt = 0; ; attempt++) {
            try {
                await put(`scripts/${name}`, readFileSync(file), "text/plain; charset=utf-8");
                break;
            } catch (error) {
                if (attempt >= 4) throw error;
                await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            }
        }
        if (++done % 1000 === 0) console.log(`  ${done} / ${cards.size} card scripts`);
    }
}
await Promise.all(Array.from({ length: 48 }, worker));
await put("done.json", JSON.stringify({ version: v, cards: cards.size, at: new Date().toISOString() }), "application/json");
console.log(`${prefix}: ${cards.size} card scripts, done`);
