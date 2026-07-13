const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '../public/ui/button_gold.png');
const outputPath = path.join(__dirname, '../public/ui/button_gold_wide_v2.png');

async function generateWideButton() {
    try {
        console.log('Loading button_gold.png...');
        // Load original image (1024x1024)
        const image = sharp(inputPath);
        const metadata = await image.metadata();

        // Target dimensions: 1024x256 (4:1 ratio)
        // We resize the source to 256x256 first to get the corners at the right scale
        const resized = await image
            .resize(256, 256, { fit: 'fill' })
            .toBuffer();

        // Slice dimensions
        const cornerSize = 80; // Left/Right caps width
        const centerSourceWidth = 256 - (cornerSize * 2); // 96px

        // Extract slices
        const leftCap = await sharp(resized)
            .extract({ left: 0, top: 0, width: cornerSize, height: 256 })
            .toBuffer();

        const rightCap = await sharp(resized)
            .extract({ left: 256 - cornerSize, top: 0, width: cornerSize, height: 256 })
            .toBuffer();

        const centerSlice = await sharp(resized)
            .extract({ left: cornerSize, top: 0, width: centerSourceWidth, height: 256 })
            .toBuffer();

        // Target center width
        const targetWidth = 1024;
        const targetCenterWidth = targetWidth - (cornerSize * 2); // 1024 - 160 = 864px

        // Create tiled center
        // We need to repeat the centerSlice to fill targetCenterWidth
        // 864 / 96 = 9 repeats exactly
        const repeats = Math.ceil(targetCenterWidth / centerSourceWidth);

        const compositeOperations = [];

        // Add Left Cap
        compositeOperations.push({ input: leftCap, left: 0, top: 0 });

        // Add Tiled Center
        for (let i = 0; i < repeats; i++) {
            let left = cornerSize + (i * centerSourceWidth);
            // If the last tile goes beyond, we crop it (though here it fits exactly if 96*9=864)
            // But let's be safe and crop the last one if needed
            let widthToUse = centerSourceWidth;
            if (left + widthToUse > targetWidth - cornerSize) {
                widthToUse = (targetWidth - cornerSize) - left;
            }

            if (widthToUse > 0) {
                // We can't easily crop in the composite step, so we just overlay. 
                // Since the right cap will be drawn last (or on top), it should cover any overflow if we are careful.
                // Actually, let's just tile.
                compositeOperations.push({ input: centerSlice, left: left, top: 0 });
            }
        }

        // Add Right Cap (on top of any center overflow)
        compositeOperations.push({ input: rightCap, left: targetWidth - cornerSize, top: 0 });

        // Create canvas
        await sharp({
            create: {
                width: targetWidth,
                height: 256,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
            .composite(compositeOperations)
            .png()
            .toFile(outputPath);

        console.log(`Generated wide button at ${outputPath}`);

    } catch (error) {
        console.error('Error generating button:', error);
    }
}

generateWideButton();
