
const https = require('https');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

https.get(`${BASE_URL}/cardsets.php`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const sets = JSON.parse(data);
            const rbgts = sets.filter(s => s.set_name.includes('Raging Battle'));
            console.log('Raging Battle entries:', JSON.stringify(rbgts, null, 2));
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', console.error);
