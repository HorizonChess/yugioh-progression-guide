
const https = require('https');

const url = 'https://yugioh.fandom.com/wiki/Special:FilePath/LOB-BoosterEN.png';

https.get(url, (res) => {
    console.log('StatusCode:', res.statusCode);
    console.log('Headers:', res.headers);
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        console.log('Redirect Location:', res.headers.location);
    }
}).on('error', (e) => {
    console.error(e);
});
