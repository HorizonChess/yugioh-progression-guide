const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const files = ['yugi_neutral_v2.png', 'yugi_happy_v2.png', 'yugi_sad_v2.png'];

async function processImage(file) {
    const inputPath = path.join(publicDir, file);
    // We will overwrite the _transparent file if it exists, or create it
    const outputPath = path.join(publicDir, file.replace('.png', '_transparent.png'));

    try {
        console.log(`Processing ${file}...`);

        // Load image and ensure it has an alpha channel
        const image = sharp(inputPath).ensureAlpha();
        const { data, info } = await image
            .raw()
            .toBuffer({ resolveWithObject: true });

        const channels = 4; // ensureAlpha() makes it 4
        const width = info.width;
        const height = info.height;

        // Helper to get pixel index
        const getIdx = (x, y) => (y * width + x) * channels;

        // Helper to check if pixel is white-ish
        const isWhite = (x, y) => {
            const idx = getIdx(x, y);
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            return r > 230 && g > 230 && b > 230;
        };

        // Flood fill queue
        const queue = [];
        const visited = new Set();

        // Add corners to queue if they are white
        const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
        for (const [x, y] of corners) {
            if (isWhite(x, y)) {
                queue.push([x, y]);
                visited.add(`${x},${y}`);
            }
        }

        // Process queue
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const idx = getIdx(x, y);

            // Set alpha to 0
            data[idx + 3] = 0;

            // Check neighbors
            const neighbors = [
                [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
            ];

            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const key = `${nx},${ny}`;
                    if (!visited.has(key) && isWhite(nx, ny)) {
                        visited.add(key);
                        queue.push([nx, ny]);
                    }
                }
            }
        }

        // Save the modified image
        await sharp(data, {
            raw: {
                width: info.width,
                height: info.height,
                channels: channels
            }
        })
            .png()
            .toFile(outputPath);

        console.log(`Saved to ${outputPath}`);
    } catch (error) {
        console.error(`Error processing ${file}:`, error);
    }
}

async function main() {
    for (const file of files) {
        await processImage(file);
    }
}

main();
