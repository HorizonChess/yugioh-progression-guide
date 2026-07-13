const fs = require('fs');
const path = require('path');
const https = require('https');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// --- Configuration ---
// Load from .env.local or environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.CLOUDFLARE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME;

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
    console.error("Error: Missing Cloudflare R2 credentials in .env.local");
    console.error("Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_BUCKET_NAME");
    process.exit(1);
}

const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

const API_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const SETS_URL = 'https://db.ygoprodeck.com/api/v7/cardsets.php';
const TEMP_DIR = path.join(__dirname, 'temp_images');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

async function fetchSets() {
    console.log('Fetching set data...');
    return new Promise((resolve, reject) => {
        https.get(SETS_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function fetchAllCards() {
    console.log('Fetching card data from YGOPRODeck...');
    return new Promise((resolve, reject) => {
        https.get(API_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.data);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: Status ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => { }); // Delete the file async
            reject(err);
        });
    });
}

async function uploadToR2(filepath, key) {
    const fileStream = fs.createReadStream(filepath);
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileStream,
            ContentType: 'image/jpeg',
        },
    });

    return upload.done();
}

async function processCards() {
    try {
        // 1. Fetch Sets to get dates
        const sets = await fetchSets();
        const setDateMap = new Map();
        sets.forEach(set => {
            if (set.tcg_date) {
                setDateMap.set(set.set_name, new Date(set.tcg_date));
            }
        });

        // 2. Fetch Cards
        const allCards = await fetchAllCards();
        console.log(`Total cards found: ${allCards.length}`);

        // 3. Filter cards (same logic as original migrate_images.js)
        const CUTOFF_DATE = new Date('2016-12-31');

        const cardsToMigrate = allCards.filter(card => {
            if (!card.card_sets) return false;

            // Check if any set date is <= 2016
            return card.card_sets.some(set => {
                const date = setDateMap.get(set.set_name);
                if (!date) return false;
                return date <= CUTOFF_DATE;
            });
        });

        console.log(`Cards in scope (<= 2016): ${cardsToMigrate.length}`);

        // 4. Count and collect alternate artworks (card_images[1+])
        // The original script only uploaded card_images[0], so we need all images at index 1+
        const altArtworks = [];
        for (const card of cardsToMigrate) {
            if (!card.card_images || card.card_images.length <= 1) continue;

            // Skip index 0 - already uploaded by original migrate_images.js
            for (let i = 1; i < card.card_images.length; i++) {
                altArtworks.push({
                    card,
                    image: card.card_images[i],
                    artIndex: i
                });
            }
        }

        console.log(`Alternate artworks to upload: ${altArtworks.length}`);

        if (altArtworks.length === 0) {
            console.log('No alternate artworks found. Exiting.');
            return;
        }

        // 5. Process in batches
        let processed = 0;
        const total = altArtworks.length;
        const BATCH_SIZE = 10;

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = altArtworks.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ({ card, image, artIndex }) => {
                const imageUrl = image.image_url;
                const imageId = image.id;
                const filename = `${imageId}.jpg`;
                const localPath = path.join(TEMP_DIR, filename);
                const r2Key = `cards/${filename}`;

                try {
                    await downloadImage(imageUrl, localPath);
                    await uploadToR2(localPath, r2Key);
                    fs.unlinkSync(localPath);
                } catch (err) {
                    console.error(`Error processing ${card.name} alt #${artIndex} (${imageId}):`, err.message);
                }
            }));

            processed += batch.length;
            if (processed % 50 === 0 || processed >= total) {
                console.log(`Processed ${processed}/${total} alternate artworks...`);
            }
        }

        console.log('Migration of alternate artworks complete!');
        if (fs.existsSync(TEMP_DIR)) {
            fs.rmdirSync(TEMP_DIR);
        }

    } catch (error) {
        console.error('Fatal error:', error);
    }
}

processCards();
