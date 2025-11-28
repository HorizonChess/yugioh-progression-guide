const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '../public/ui/button_gold.png');
const outputPath = path.join(__dirname, '../public/ui/button_gold_wide_v3.png');

async function generateWideButton() {
    try {
        console.log('Loading button_gold.png...');
        const image = sharp(inputPath);

        // Resize to 256px height (to keep high quality for h-16 which is 64px, so 4x density)
        const resized = await image
            .resize(256, 256, { fit: 'fill' })
            .toBuffer();

        // Define slice points
        // The button has corners. Let's take a generous cap to preserve the corner details.
        const capSize = 100;

        // Extract Left Cap
        const leftCap = await sharp(resized)
            .extract({ left: 0, top: 0, width: capSize, height: 256 })
            .toBuffer();

        // Extract Right Cap
        const rightCap = await sharp(resized)
            .extract({ left: 256 - capSize, top: 0, width: capSize, height: 256 })
            .toBuffer();

        // Extract Center (small slice from the middle to stretch)
        // We take a slice from the very center to ensure it's the "flat" part of the plate
        const centerSliceWidth = 20;
        const centerStart = (256 - centerSliceWidth) / 2;

        const centerSlice = await sharp(resized)
            .extract({ left: Math.floor(centerStart), top: 0, width: centerSliceWidth, height: 256 })
            .toBuffer();

        // Target Dimensions
        // User said "too wide", so let's aim for a slightly less extreme aspect ratio than 4:1?
        // But we will control width in CSS. Let's make a standard 4:1 asset so it's versatile.
        // 256 height * 4 = 1024 width.
        const targetWidth = 1024;
        const targetCenterWidth = targetWidth - (capSize * 2);

        // Stretch the center slice to fill the gap
        const stretchedCenter = await sharp(centerSlice)
            .resize(targetCenterWidth, 256, { fit: 'fill' })
            .toBuffer();

        // Composite
        await sharp({
            create: {
                width: targetWidth,
                height: 256,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        })
            .composite([
                { input: leftCap, left: 0, top: 0 },
                { input: stretchedCenter, left: capSize, top: 0 },
                { input: rightCap, left: targetWidth - capSize, top: 0 }
            ])
            .png()
            .toFile(outputPath);

        console.log(`Generated wide button v3 at ${outputPath}`);

    } catch (error) {
        console.error('Error generating button:', error);
    }
}

generateWideButton();
