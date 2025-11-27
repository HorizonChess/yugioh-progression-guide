
const https = require('https');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

https.get(`${BASE_URL}/cardsets.php`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const sets = JSON.parse(data);
            if (sets.length > 0) {
                console.log('Keys:', Object.keys(sets[0]));
            }
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', console.error);
