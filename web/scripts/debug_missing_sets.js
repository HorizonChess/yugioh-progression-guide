const https = require('https');

const codes = ['CSOC', 'DL11', 'LODT', 'PRC1', 'WGRT', 'ZTIN'];

function checkUrl(url) {
    return new Promise((resolve) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                checkUrl(res.headers.location).then(resolve);
            } else if (res.statusCode === 200) {
                resolve(url);
            } else {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

async function debugSet(code) {
    console.log(`\nDebugging ${code}...`);

    // Try some other variations
    const variations = [
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterEN.png`,
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterNA.png`,
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterUE.png`, // Unlimited Edition?
        `https://yugipedia.com/wiki/Special:FilePath/${code}-BoosterAE.png`, // Asian English?
        `https://yugipedia.com/wiki/Special:FilePath/${code}-Booster.png`,
        // Maybe full name?
        // Hard to guess full name without mapping.
    ];

    for (const url of variations) {
        const finalUrl = await checkUrl(url);
        if (finalUrl) {
            console.log(`[FOUND] ${code} -> ${finalUrl}`);
            return;
        } else {
            // console.log(`[404] ${url}`);
        }
    }
    console.log(`[FAILED] All variations failed for ${code}`);
}

async function main() {
    for (const code of codes) {
        await debugSet(code);
    }
}

main();
