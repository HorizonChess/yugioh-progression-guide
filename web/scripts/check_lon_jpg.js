
const https = require('https');

const url = 'https://yugipedia.com/wiki/Special:FilePath/LON-BoosterEN.jpg';

https.get(url, (res) => {
    console.log('StatusCode:', res.statusCode);
    res.destroy();
}).on('error', console.error);
