
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';
const OUTPUT_FILE = path.join(__dirname, '../src/data/booster_images.json');

const EXCLUDE_KEYWORDS = [
    "Structure Deck",
    "Starter Deck",
    "Tournament Pack",
    "Duelist Pack",
    "Battle Pack",
    "Star Pack",
    "Turbo Pack",
    "Astral Pack",
    "Champion Pack",
    "OTS Tournament Pack",
    "Premium Pack",
    "Movie Pack",
    "Super Starter",
    "Speed Duel",
    "Duel Terminal",
    "Legendary Decks",
    "Box Set",
    "Special Edition",
];

// Helper to fetch sets
async function fetchSets() {
    return new Promise((resolve, reject) => {
        https.get(`${BASE_URL}/cardsets.php`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const filtered = parsed
                        .filter(set => {
                            if (!set.tcg_date) return false;
                            if (set.tcg_date >= '2017-08-01') return false;
                            if (set.num_of_cards <= 20) return false;

                            const name = set.set_name;
                            for (const keyword of EXCLUDE_KEYWORDS) {
                                if (name.includes(keyword)) return false;
                            }
                            return true;
                        })
                        .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime());
                    resolve(filtered);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Helper to resolve redirect
function resolveYugipediaUrl(setCode) {
    const tryUrl = (ext) => {
        const initialUrl = `https://yugipedia.com/wiki/Special:FilePath/${setCode}-BoosterEN.${ext}`;
        return new Promise((resolve) => {
            const req = https.request(initialUrl, { method: 'GET' }, (res) => {
                res.destroy();
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = res.headers.location;
                    const req2 = https.request(redirectUrl, { method: 'GET' }, (res2) => {
                        res2.destroy();
                        if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
                            resolve(res2.headers.location);
                        } else if (res2.statusCode === 200) {
                            resolve(redirectUrl);
                        } else {
                            resolve(null);
                        }
                    });
                    req2.on('error', () => resolve(null));
                    req2.end();
                } else {
                    resolve(null);
                }
            });
            req.on('error', () => resolve(null));
            req.end();
        });
    };

    return tryUrl('png').then(url => {
        if (url) return url;
        return tryUrl('jpg');
    });
}

async function main() {
    console.log('Fetching sets...');
    const sets = await fetchSets();
    console.log(`Found ${sets.length} sets.`);

    const imageMap = {};

    // Process in chunks
    const CHUNK_SIZE = 5;
    for (let i = 0; i < sets.length; i += CHUNK_SIZE) {
        const chunk = sets.slice(i, i + CHUNK_SIZE);
        console.log(`Processing ${i} to ${i + chunk.length}...`);

        const promises = chunk.map(async (set, idx) => {
            // Stagger requests
            await new Promise(r => setTimeout(r, idx * 200));

            console.log(`Checking ${set.set_code}...`);
            const url = await resolveYugipediaUrl(set.set_code);
            if (url && url.includes('ms.yugipedia.com')) {
                console.log(`Found: ${set.set_code}`);
                imageMap[set.set_code] = url;
            } else {
                console.log(`Failed: ${set.set_code}`);
            }
        });

        await Promise.all(promises);
        console.log(''); // Newline

        // Delay between chunks
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\nResolved ${Object.keys(imageMap).length} images.`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(imageMap, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
