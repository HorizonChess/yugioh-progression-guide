const https = require('https');

const codes = ['CSOC', 'DL11', 'LODT', 'PRC1', 'WGRT', 'ZTIN'];

function searchWiki(query) {
    return new Promise((resolve, reject) => {
        const url = `https://yugipedia.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
            res.on('error', () => resolve(null));
        });
    });
}

function getImagesFromPage(pageTitle) {
    return new Promise((resolve, reject) => {
        const url = `https://yugipedia.com/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=images&format=json`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
            res.on('error', () => resolve(null));
        });
    });
}

function getImageUrl(filename) {
    return new Promise((resolve) => {
        // Special:FilePath handles redirects
        const url = `https://yugipedia.com/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(res.headers.location);
            } else if (res.statusCode === 200) {
                resolve(url);
            } else {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

async function findImageForCode(code) {
    console.log(`\nSearching for ${code}...`);
    // Search for the set page
    const searchRes = await searchWiki(`${code} Booster Pack`);
    if (!searchRes || !searchRes.query || !searchRes.query.search || searchRes.query.search.length === 0) {
        console.log(`[FAILED] No page found for ${code}`);
        return;
    }

    const pageTitle = searchRes.query.search[0].title;
    console.log(`Found page: ${pageTitle}`);

    const imagesRes = await getImagesFromPage(pageTitle);
    if (!imagesRes || !imagesRes.parse || !imagesRes.parse.images) {
        console.log(`[FAILED] No images found on page ${pageTitle}`);
        return;
    }

    const images = imagesRes.parse.images;
    // Look for likely booster images
    const candidates = images.filter(img =>
        (img.includes(code) || img.includes('Booster')) &&
        (img.endsWith('.png') || img.endsWith('.jpg')) &&
        !img.includes('Box') // Avoid box images if possible
    );

    if (candidates.length === 0) {
        console.log(`[FAILED] No candidate images found for ${code}`);
        return;
    }

    // Prioritize EN/NA
    const bestCandidate = candidates.find(img => img.includes('BoosterEN') || img.includes('BoosterNA')) || candidates[0];

    console.log(`Best candidate: ${bestCandidate}`);
    const url = await getImageUrl(bestCandidate);
    if (url) {
        console.log(`[FOUND] ${code} -> ${url}`);
    } else {
        console.log(`[FAILED] Could not resolve URL for ${bestCandidate}`);
    }
}

async function main() {
    for (const code of codes) {
        await findImageForCode(code);
    }
}

main();
