
const https = require('https');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

https.get(`${BASE_URL}/cardsets.php`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const sets = JSON.parse(data);
            const lcs = sets.filter(s => s.set_name.includes('Legendary Collection'));
            console.log('LC entries:', JSON.stringify(lcs.map(s => ({ name: s.set_name, count: s.num_of_cards })), null, 2));
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', console.error);
