const sharp = require('sharp');
const path = require('path');

// Input is the generated file in the artifacts folder (simulated by copying it first or reading directly if possible, but tool output said it's at a specific path. 
// Since I can't access the artifact path directly in the script easily without knowing it, I'll assume I copy it first or the user provides it.
// Wait, I can copy it using run_command first.

const inputPath = path.join(__dirname, '../../public/ui/temp_button_v5.png');
const outputPath = path.join(__dirname, '../../public/ui/button_gold_wide_v5.png');

async function processButton() {
    try {
        console.log('Processing button transparency...');
        const image = sharp(inputPath).ensureAlpha();
        const { data, info } = await image
            .raw()
            .toBuffer({ resolveWithObject: true });

        const width = info.width;
        const height = info.height;
        const channels = 4;

        // Simple flood fill from corners if they are uniform color
        // Or just replace specific background color. 
        // Let's assume the background is black (0,0,0) or white (255,255,255) based on the prompt "No background" usually giving black or white.
        // Let's check the top-left pixel.

        const r = data[0];
        const g = data[1];
        const b = data[2];

        console.log(`Corner color: ${r}, ${g}, ${b}`);

        const isBackground = (idx) => {
            // Tolerance
            const tr = data[idx];
            const tg = data[idx + 1];
            const tb = data[idx + 2];
            return Math.abs(tr - r) < 10 && Math.abs(tg - g) < 10 && Math.abs(tb - b) < 10;
        };

        // Flood fill logic
        const queue = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
        const visited = new Set();

        // Initialize queue with corners if they match background
        const validQueue = [];
        for (let [x, y] of queue) {
            const idx = (y * width + x) * channels;
            if (isBackground(idx)) {
                validQueue.push([x, y]);
                visited.add(`${x},${y}`);
            }
        }

        while (validQueue.length > 0) {
            const [x, y] = validQueue.shift();
            const idx = (y * width + x) * channels;

            data[idx + 3] = 0; // Set alpha to 0

            const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
            for (let [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const key = `${nx},${ny}`;
                    const nIdx = (ny * width + nx) * channels;
                    if (!visited.has(key) && isBackground(nIdx)) {
                        visited.add(key);
                        validQueue.push([nx, ny]);
                    }
                }
            }
        }

        await sharp(data, { raw: { width, height, channels } })
            .png()
            .toFile(outputPath);

        console.log(`Saved transparent button to ${outputPath}`);

    } catch (error) {
        console.error('Error processing button:', error);
    }
}

processButton();
