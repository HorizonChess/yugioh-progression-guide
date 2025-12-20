const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { pipeline } = require('stream/promises');

// --- Configuration ---
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

const TEMP_DIR = path.join(__dirname, 'temp_optimize');
const PROGRESS_FILE = path.join(__dirname, 'optimize_progress.json');
const ERROR_LOG = path.join(__dirname, 'optimize_errors.log');
const BATCH_SIZE = 5;

// Image sizes to generate
const SIZES = [
    { suffix: '_sm', width: 100 },  // For deck builder slots (48-108px display)
    { suffix: '_md', width: 200 },  // For collection grids, tooltips (154-211px display)
    { suffix: '_lg', width: 421 },  // Match YGOPRODeck small size
];

// ... (skip down to resizeImage)

async function resizeImage(inputPath, outputPath, width) {
    await sharp(inputPath)
        .resize(width, null, {
            kernel: 'mitchell',
            withoutEnlargement: true
        })
        .jpeg({
            quality: 90,
            chromaSubsampling: '4:4:4',
            mozjpeg: true,
            trellisQuantisation: true,
            overshootDeringing: true,
            optimizeScans: true,
            quantisationTable: 3 // ImageMagick table, typically good for high quality
        })
        .toFile(outputPath);
}

async function uploadToR2(localPath, key) {
    const fileStream = fs.createReadStream(localPath);
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileStream,
            ContentType: 'image/jpeg',
            CacheControl: 'public, max-age=31536000, immutable',
        },
    });

    return upload.done();
}

async function processImage(jpgKey, progress) {
    // Extract image ID from key (e.g., "cards/12345.jpg" -> "12345")
    const filename = path.basename(jpgKey, '.jpg');
    const imageId = filename;

    // Skip if already processed (unless --force)
    if (!FORCE && progress.processed.includes(imageId)) {
        return { status: 'skipped', reason: 'already processed' };
    }

    // Check if sized images already exist in R2 (unless --force)
    if (!FORCE && await checkSizedImagesExist(imageId)) {
        progress.processed.push(imageId);
        return { status: 'skipped', reason: 'sized images exist' };
    }

    if (DRY_RUN) {
        return { status: 'dry-run', imageId };
    }

    const localOriginal = path.join(TEMP_DIR, `${imageId}.jpg`);
    const localFiles = [];

    try {
        // Download original JPG from R2
        await downloadFromR2(jpgKey, localOriginal);
        localFiles.push(localOriginal);

        const originalSize = fs.statSync(localOriginal).size;
        let totalNewSize = 0;

        // Generate each size
        for (const size of SIZES) {
            const localSized = path.join(TEMP_DIR, `${imageId}${size.suffix}.jpg`);
            const r2Key = `cards/${imageId}${size.suffix}.jpg`;

            await resizeImage(localOriginal, localSized, size.width);
            localFiles.push(localSized);

            const sizedFileSize = fs.statSync(localSized).size;
            totalNewSize += sizedFileSize;

            // Upload to R2
            await uploadToR2(localSized, r2Key);
        }

        // Cleanup temp files
        for (const file of localFiles) {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }

        // Mark as processed
        progress.processed.push(imageId);
        saveProgress(progress);

        return {
            status: 'success',
            originalSize,
            totalNewSize,
        };

    } catch (error) {
        // Cleanup on error
        for (const file of localFiles) {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }

        progress.failed.push(imageId);
        logError(`Failed to process ${imageId}: ${error.message}`);

        return { status: 'error', error: error.message };
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

async function main() {
    console.log('=== Image Optimization Script ===');
    console.log('Generating pre-sized images: 100px (_sm) and 200px (_md)');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Resume: ${RESUME ? 'YES' : 'NO'}`);
    console.log(`Force: ${FORCE ? 'YES' : 'NO'}`);
    console.log('');

    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Load progress
    const progress = loadProgress();
    console.log(`Previously processed: ${progress.processed.length} images`);
    console.log(`Previously failed: ${progress.failed.length} images`);
    console.log('');

    // List all original JPG files (excluding _sm and _md)
    let jpgFiles = [];

    if (SPECIFIC_ID) {
        console.log(`Targeting specific ID: ${SPECIFIC_ID}`);
        // For specific ID, we just need to know it exists or just try to process it.
        // We'll assume the source exists or check R2.
        // Actually, let's just construct the key.
        jpgFiles = [`cards/${SPECIFIC_ID}.jpg`];
    } else {
        jpgFiles = await listOriginalJpgFiles();
    }

    if (jpgFiles.length === 0) {
        console.log('No original JPG files found in R2 bucket');
        return;
    }

    // Filter out already processed (if resuming)
    const toProcess = RESUME && !FORCE
        ? jpgFiles.filter(key => {
            const imageId = path.basename(key, '.jpg');
            return !progress.processed.includes(imageId);
        })
        : jpgFiles;

    console.log(`Images to process: ${toProcess.length}`);
    console.log('');

    if (toProcess.length === 0) {
        console.log('All images already processed!');
        return;
    }

    const startTime = Date.now();
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let totalOriginalSize = 0;
    let totalNewSize = 0;

    // Process in batches
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batch = toProcess.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
            batch.map(key => processImage(key, progress))
        );

        for (const result of results) {
            if (result.status === 'success') {
                processed++;
                totalOriginalSize += result.originalSize;
                totalNewSize += result.totalNewSize;
            } else if (result.status === 'skipped' || result.status === 'dry-run') {
                skipped++;
            } else if (result.status === 'error') {
                errors++;
            }
        }

        // Progress update
        const current = i + batch.length;
        const elapsed = Date.now() - startTime;
        const rate = current / (elapsed / 1000);
        const remaining = toProcess.length - current;
        const eta = remaining / rate * 1000;

        console.log(
            `[${current}/${toProcess.length}] ` +
            `Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors} | ` +
            `ETA: ${formatTime(eta)}`
        );
    }

    // Final summary
    console.log('');
    console.log('=== Summary ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Total skipped: ${skipped}`);
    console.log(`Total errors: ${errors}`);

    if (processed > 0) {
        console.log(`Total original size: ${formatBytes(totalOriginalSize)}`);
        console.log(`Total new sizes combined: ${formatBytes(totalNewSize)}`);
    }

    console.log(`Time elapsed: ${formatTime(Date.now() - startTime)}`);

    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
        try {
            fs.rmdirSync(TEMP_DIR);
        } catch (e) {
            // Directory not empty, that's fine
        }
    }

    console.log('');
    console.log('Done!');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
