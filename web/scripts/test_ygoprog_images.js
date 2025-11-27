
const https = require('https');

const patterns = [
    'https://images.ygoprog.com/sets/LOB.jpg',
    'https://images.ygoprog.com/sets/LOB.png',
    'https://images.ygoprog.com/packs/LOB.jpg',
    'https://images.ygoprog.com/packs/LOB.png',
    'https://images.ygoprog.com/assets/sets/LOB.jpg',
    'https://images.ygoprog.com/assets/packs/LOB.jpg',
    'https://www.ygoprog.com/assets/sets/LOB.jpg',
    'https://www.ygoprog.com/images/sets/LOB.jpg'
];

function checkUrl(url) {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
        console.log(`${url}: ${res.statusCode}`);
    });
    req.on('error', (e) => console.log(`${url}: Error ${e.message}`));
    req.end();
}

patterns.forEach(checkUrl);
