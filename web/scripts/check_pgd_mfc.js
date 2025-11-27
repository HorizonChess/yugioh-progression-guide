
const https = require('https');

const codes = ['PGD', 'MFC'];

function check(code) {
    const url = `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.png`;
    https.get(url, (res) => {
        console.log(`${code} PNG: ${res.statusCode}`);
        if (res.statusCode === 404) {
            const url2 = `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.jpg`;
            https.get(url2, (res2) => {
                console.log(`${code} JPG: ${res2.statusCode}`);
            });
        }
    });
}

codes.forEach(check);
