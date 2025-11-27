
const https = require('https');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';
const CUTOFF_DATE = '2017-08-01';

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
    "Demo Deck",
    "Retro Pack", // Maybe?
    "Anniversary Pack",
    "Gold Series", // Usually reprints but special rarity
    "Premium Gold",
    "Number Hunters", // Side set
    "Dragons of Legend", // Side set
    "World Superstars",
    "Hidden Arsenal", // Terminal set, maybe exclude?
    "Duel Terminal",
    "Legendary Decks",
    "Box Set",
    "Special Edition",
];

// Core sets usually don't have "Pack" in the name, except maybe very old ones?
// Actually "Legend of Blue Eyes White Dragon" doesn't have "Pack".

https.get(`${BASE_URL}/cardsets.php`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const sets = JSON.parse(data);

            const filtered = sets
                .filter(set => {
                    if (!set.tcg_date) return false;
                    if (set.tcg_date >= CUTOFF_DATE) return false;
                    if (set.num_of_cards <= 20) return false;

                    const name = set.set_name;
                    for (const keyword of EXCLUDE_KEYWORDS) {
                        if (name.includes(keyword)) return false;
                    }
                    return true;
                })
                .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime());

            console.log(`Filtered ${sets.length} sets down to ${filtered.length} sets.`);
            filtered.forEach(s => console.log(`${s.set_code}: ${s.set_name} (${s.num_of_cards}) - ${s.tcg_date}`));

        } catch (e) {
            console.error(e);
        }
    });
}).on('error', console.error);
