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

https.get(BASE_URL, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const sets = JSON.parse(data);
        const missingSets = sets.filter(set => {
            if (!set.tcg_date || set.tcg_date >= CUTOFF_DATE || set.num_of_cards <= 20) return false;
            if (EXCLUDE_KEYWORDS.some(k => set.set_name.includes(k))) return false;
            return !boosterImages[set.set_code];
        });

        if (missingSets.length > 0) {
            console.log("Missing Sets:", missingSets.map(s => s.set_code).join(', '));

            // Generate a script to check these codes
            const checkScript = `
const https = require('https');
const codes = ${JSON.stringify(missingSets.map(s => s.set_code))};

function getFinalUrl(url, code, ext) {
    https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            getFinalUrl(res.headers.location, code, ext);
        } else if (res.statusCode === 200) {
            console.log(\`"\${code}": "\${url}",\`);
        }
    }).on('error', () => {});
}

codes.forEach(code => {
    getFinalUrl(\`https://yugipedia.com/wiki/Special:FilePath/\${code}-BoosterEN.png\`, code, 'EN png');
    getFinalUrl(\`https://yugipedia.com/wiki/Special:FilePath/\${code}-BoosterNA.png\`, code, 'NA png');
    getFinalUrl(\`https://yugipedia.com/wiki/Special:FilePath/\${code}-BoosterEN.jpg\`, code, 'EN jpg');
    getFinalUrl(\`https://yugipedia.com/wiki/Special:FilePath/\${code}-BoosterNA.jpg\`, code, 'NA jpg');
});
`;
            fs.writeFileSync(path.join(__dirname, 'check_missing_sets.js'), checkScript);
            console.log("Created check_missing_sets.js to find URLs.");
        } else {
            console.log("No missing sets found!");
        }
    });
});
