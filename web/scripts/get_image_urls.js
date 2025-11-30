const https = require('https');

const codes = ['PGD', 'MFC'];

function getFinalUrl(url, code, ext) {
    https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // console.log(`${code} (${ext}): Redirecting to ${res.headers.location}`);
            getFinalUrl(res.headers.location, code, ext);
        } else if (res.statusCode === 200) {
            console.log(`FINAL URL for ${code} (${ext}): ${url}`);
        } else {
            console.log(`${code} (${ext}): Failed with ${res.statusCode}`);
        }
    }).on('error', (e) => {
        console.error(`${code} (${ext}): Error ${e.message}`);
    });
}

codes.forEach(code => {
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.png`, code, 'EN png');
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.jpg`, code, 'EN jpg');
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.png`, code, 'NA png');
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.jpg`, code, 'NA jpg');
});
