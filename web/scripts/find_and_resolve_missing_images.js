const https = require('https');
const fs = require('fs');
const path = require('path');

const boosterImagesPath = path.join(__dirname, '../src/data/booster_images.json');
const boosterImages = require(boosterImagesPath);

const BASE_URL = 'https://db.ygoprodeck.com/api/v7/cardsets.php';
const CUTOFF_DATE = '2017-08-01';

const EXCLUDE_KEYWORDS = [
    "Structure Deck", "Starter Deck", "Tournament Pack", "Duelist Pack",
    "Battle Pack", "Star Pack", "Turbo Pack", "Astral Pack", "Champion Pack",
    "OTS Tournament Pack", "Premium Pack", "Movie Pack", "Super Starter",
    "Speed Duel", "Duel Terminal", "Legendary Decks", "Box Set",
    "Special Edition", "Magic Ruler"
];

function fetchSets() {
    return new Promise((resolve, reject) => {
        https.get(BASE_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
            res.on('error', reject);
        });
    });
}

function checkUrl(url) {
    return new Promise((resolve) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                checkUrl(res.headers.location).then(resolve);
            } else if (res.statusCode === 200) {
                resolve(url);
            } else {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

async function findImageForSet(code) {
    const variations = [
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.png`,
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.png`,
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.jpg`,
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.jpg`,
        // Try without region for some older/special sets
        `https://yugipedia.com/wiki/Special:FilePath/${code}-Booster.png`,
        `https://yugipedia.com/wiki/Special:FilePath/${code}-Booster.jpg`
    ];

    for (const url of variations) {
        const finalUrl = await checkUrl(url);
        if (finalUrl) {
            console.log(`[FOUND] ${code} -> ${finalUrl}`);
            return finalUrl;
        }
    }
    console.log(`[FAILED] Could not find image for ${code}`);
    return null;
}

async function main() {
    console.log("Fetching sets...");
    const sets = await fetchSets();

    const missingSets = sets.filter(set => {
        if (!set.tcg_date || set.tcg_date >= CUTOFF_DATE || set.num_of_cards <= 20) return false;
        if (EXCLUDE_KEYWORDS.some(k => set.set_name.includes(k))) return false;
        return !boosterImages[set.set_code];
    });

    console.log(`Found ${missingSets.length} missing sets:`, missingSets.map(s => s.set_code).join(', '));

    const foundImages = {};

    for (const set of missingSets) {
        const url = await findImageForSet(set.set_code);
        if (url) {
            foundImages[set.set_code] = url;
        }
    }

    fs.writeFileSync(path.join(__dirname, 'found_images.json'), JSON.stringify(foundImages, null, 2));
    console.log("Saved found images to found_images.json");
}

main();
