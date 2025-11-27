
const https = require('https');

const url = 'https://www.ygoprog.com/assets/sets/LOB.jpg';

https.get(url, (res) => {
    console.log('Headers:', res.headers);
    console.log('Content-Type:', res.headers['content-type']);

    // Read a bit of data
    res.once('data', (chunk) => {
        console.log('First bytes:', chunk.slice(0, 10));
        res.destroy();
    });
}).on('error', console.error);
