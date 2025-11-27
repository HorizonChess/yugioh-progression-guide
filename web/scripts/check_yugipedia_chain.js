
const https = require('https');

function checkUrl(url) {
    console.log(`Checking: ${url}`);
    https.get(url, (res) => {
        console.log('StatusCode:', res.statusCode);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log('Redirect to:', res.headers.location);
            checkUrl(res.headers.location);
        } else {
            console.log('Final URL:', url);
        }
    }).on('error', (e) => {
        console.error(e);
    });
}

checkUrl('https://yugipedia.com/wiki/Special:FilePath/LOB-BoosterEN.png');
