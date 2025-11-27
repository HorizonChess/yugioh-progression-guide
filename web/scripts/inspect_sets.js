
const https = require('https');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

https.get(`${BASE_URL}/cardsets.php`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const sets = JSON.parse(data);
            console.log('Total sets:', sets.length);

            // Print first few sets to see structure
            console.log('First set:', JSON.stringify(sets[0], null, 2));

            // Find a structure deck or tin to see its type
            const structureDeck = sets.find(s => s.set_name.includes('Structure Deck'));
            if (structureDeck) {
                console.log('Structure Deck example:', JSON.stringify(structureDeck, null, 2));
            }

            const tin = sets.find(s => s.set_name.includes('Tin'));
            if (tin) {
                console.log('Tin example:', JSON.stringify(tin, null, 2));
            }

            const booster = sets.find(s => s.set_code === 'LOB');
            if (booster) {
                console.log('LOB example:', JSON.stringify(booster, null, 2));
            }

        } catch (e) {
            console.error(e);
        }
    });
}).on('error', console.error);
