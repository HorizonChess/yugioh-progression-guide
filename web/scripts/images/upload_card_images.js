// Uploads the images of the given cards to R2 (cards/<id>.jpg, and its _sm and _md sizes), from
// YGOPRODeck: for cards the original uploads missed, such as ones printed after their cutoff that a
// duelist's deck plays.
//   node web/scripts/images/upload_card_images.js 80280944 51644030 ...
const path = require('path');
const sharp = require('sharp');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKET_NAME } = process.env;
if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_BUCKET_NAME) {
    console.error('Missing the Cloudflare R2 settings in web/.env.local');
    process.exit(1);
}
const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
if (!ids.length) {
    console.error('usage: node upload_card_images.js <card id> ...');
    process.exit(1);
}

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: CLOUDFLARE_ACCESS_KEY_ID, secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY },
});
const SIZES = [{ suffix: '_sm', width: 100 }, { suffix: '_md', width: 200 }];

async function put(key, body) {
    await new Upload({
        client: s3,
        params: { Bucket: CLOUDFLARE_BUCKET_NAME, Key: key, Body: body, ContentType: 'image/jpeg', CacheControl: 'public, max-age=31536000, immutable' },
    }).done();
}

(async () => {
    for (const id of ids) {
        const response = await fetch(`https://images.ygoprodeck.com/images/cards/${id}.jpg`);
        if (!response.ok) throw new Error(`${id}: YGOPRODeck answered ${response.status}`);
        const original = Buffer.from(await response.arrayBuffer());
        const meta = await sharp(original).metadata();
        if (meta.format !== 'jpeg') throw new Error(`${id}: not a JPEG (${meta.format})`);
        await put(`cards/${id}.jpg`, original);
        for (const { suffix, width } of SIZES) {
            const sized = await sharp(original).resize(width, null, { kernel: 'mitchell', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
            await put(`cards/${id}${suffix}.jpg`, sized);
        }
        console.log(`${id}: uploaded (${meta.width}x${meta.height}, ${original.length} bytes)`);
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
