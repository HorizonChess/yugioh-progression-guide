
const https = require('https');
const codes = ["CSOC", "DLG1", "DR04", "DL11", "LODT", "PRC1", "RP01", "WGRT", "BPW2", "ZTIN"];

function getFinalUrl(url, code, ext) {
    https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            getFinalUrl(res.headers.location, code, ext);
        } else if (res.statusCode === 200) {
            // console.log(`"${code}": "${url}",`);
            console.log(`FOUND: ${code} -> ${url}`);
        }
    }).on('error', () => { });
}

codes.forEach(code => {
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.png`, code, 'EN png');
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.png`, code, 'NA png');
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.jpg`, code, 'EN jpg');
    getFinalUrl(`https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.jpg`, code, 'NA jpg');
});
