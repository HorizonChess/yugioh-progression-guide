
const https = require('https');

const variations = [
    'LON-BoosterEN.jpg',
    'LON-BoosterEN.png', // Already checked
    'LON-Booster.png',
    'LON-Booster.jpg',
    'LabyrinthofNightmare-BoosterEN.png',
    'LabyrinthofNightmare-BoosterEN.jpg',
    'LON-EN-Booster.png',
    'LON-NA-Booster.png'
];

function checkUrl(filename) {
    const url = `https://yugipedia.com/wiki/Special:FilePath/${filename}`;
    const req = https.request(url, { method: 'HEAD' }, (res) => {
        console.log(`${filename}: ${res.statusCode}`);
        if (res.statusCode >= 300 && res.statusCode < 400) {
            console.log(`${filename} redirects to ${res.headers.location}`);
        }
    });
    req.on('error', (e) => console.log(`${filename}: Error`));
    req.end();
}

variations.forEach(checkUrl);
