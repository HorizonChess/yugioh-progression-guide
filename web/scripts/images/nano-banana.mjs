// Generates an image with Google's Nano Banana models (Gemini image generation).
// Reads GEMINI_API_KEY from api/.env (gitignored) and never prints it.
//
//   node scripts/images/nano-banana.mjs --out wall.png --ref public/bg-stone.png \
//        --aspect 16:9 --size 2K "prompt text"
//
// --model defaults to gemini-3-pro-image (Nano Banana Pro). --ref may repeat.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const refs = [];
for (let i; (i = args.indexOf("--ref")) >= 0; ) refs.push(args.splice(i, 2)[1]);
const model = opt("model", "gemini-3-pro-image");
const out = opt("out", "nano-banana.png");
const aspect = opt("aspect", "1:1");
const size = opt("size", "2K");
const prompt = args.join(" ");
if (!prompt) throw new Error("Give a prompt");

const env = readFileSync(join(ROOT, "api/.env"), "utf8");
const key = env.split(/\r?\n/).find((l) => /^\s*GEMINI_API_KEY\s*=/.test(l))?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("No GEMINI_API_KEY in api/.env");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const sniff = (buf, path) => (buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf[0] === 0x89 ? "image/png" : MIME[extname(path)] || "image/png");
const parts = [{ text: prompt }, ...refs.map((p) => { const b = readFileSync(p); return { inline_data: { mime_type: sniff(b, p), data: b.toString("base64") } }; })];

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: aspect, imageSize: size } },
    }),
});
const body = await res.json();
if (!res.ok) {
    console.error("HTTP", res.status, body.error?.status, (body.error?.message || "").replaceAll(key, "<key>"));
    process.exit(1);
}
const got = body.candidates?.[0]?.content?.parts ?? [];
const img = got.find((p) => p.inlineData || p.inline_data);
const text = got.filter((p) => p.text).map((p) => p.text).join(" ").trim();
if (!img) {
    console.error("No image returned.", body.candidates?.[0]?.finishReason ?? "", text);
    process.exit(1);
}
const data = img.inlineData ?? img.inline_data;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(data.data, "base64"));
console.log(`Saved ${out} (${data.mimeType ?? data.mime_type})${text ? " · " + text.slice(0, 200) : ""}`);
