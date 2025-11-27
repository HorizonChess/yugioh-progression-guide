
const https = require('https');

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

https.get(`${BASE_URL}/cardsets.php`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const sets = JSON.parse(data);
            const rgbt = sets.find(s => s.set_code === 'RGBT');
            console.log('RGBT:', rgbt);
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', console.error);
