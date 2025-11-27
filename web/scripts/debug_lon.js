
const https = require('https');

function resolveYugipediaUrl(setCode) {
    const initialUrl = `https://yugipedia.com/wiki/Special:FilePath/${setCode}-BoosterEN.png`;
    console.log(`Requesting: ${initialUrl}`);

    return new Promise((resolve) => {
        const req = https.request(initialUrl, { method: 'GET' }, (res) => {
            // Abort body download
            res.destroy();

            console.log(`Status 1: ${res.statusCode}`);
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // First redirect usually to Special:Redirect
                const redirectUrl = res.headers.location;
                console.log(`Redirect 1: ${redirectUrl}`);

                // Follow second redirect
                const req2 = https.request(redirectUrl, { method: 'GET' }, (res2) => {
                    res2.destroy();
                    console.log(`Status 2: ${res2.statusCode}`);
                    if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
                        console.log(`Redirect 2: ${res2.headers.location}`);
                        resolve(res2.headers.location);
                    } else if (res2.statusCode === 200) {
                        // Sometimes it might be direct?
                        console.log(`Direct 2: ${redirectUrl}`);
                        resolve(redirectUrl);
                    } else {
                        resolve(null);
                    }
                });
                req2.on('error', (e) => { console.error(e); resolve(null); });
                req2.end();
            } else {
                resolve(null);
            }
        });
        req.on('error', (e) => { console.error(e); resolve(null); });
        req.end();
    });
}

resolveYugipediaUrl('LON').then(url => console.log('Result:', url));
