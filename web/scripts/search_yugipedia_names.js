const https = require('https');
const fs = require('fs');
const path = require('path');

const codes = ['CSOC', 'DL11', 'LODT', 'PRC1', 'WGRT', 'ZTIN'];

const BASE_URL = 'https://db.ygoprodeck.com/api/v7/cardsets.php';

function fetchSets() {
    return new Promise((resolve) => {
        https.get(BASE_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
    });
}

function searchWiki(query) {
    return new Promise((resolve) => {
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
    return new Promise((resolve) => {
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

function getFinalUrl(url) {
    return new Promise((resolve) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                getFinalUrl(res.headers.location).then(resolve);
            } else if (res.statusCode === 200) {
                if (res.headers['content-type'] && res.headers['content-type'].startsWith('image/')) {
                    resolve(url);
                } else {
                    // console.log(`[WARN] URL is not an image: ${url} (${res.headers['content-type']})`);
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

async function findImageForCode(code, name) {
    console.log(`\nSearching for ${code} (${name})...`);
    const searchRes = await searchWiki(name);
    if (!searchRes || !searchRes.query || !searchRes.query.search || searchRes.query.search.length === 0) {
        console.log(`[FAILED] No page found for ${name}`);
        return null;
    }

    const pageTitle = searchRes.query.search[0].title;
    console.log(`Found page: ${pageTitle}`);

    const imagesRes = await getImagesFromPage(pageTitle);
    if (!imagesRes || !imagesRes.parse || !imagesRes.parse.images) {
        console.log(`[FAILED] No images found on page ${pageTitle}`);
        return null;
    }

    const images = imagesRes.parse.images;
    const candidates = images.filter(img =>
        (img.endsWith('.png') || img.endsWith('.jpg')) &&
        !img.includes('Box')
    );

    if (candidates.length === 0) {
        console.log(`[FAILED] No candidate images found for ${code}`);
        return null;
    }

    // Heuristic: Look for "Booster" in filename
    // Also prefer "EN" or "NA"
    let bestCandidate = candidates.find(img => img.includes('Booster') && (img.includes('EN') || img.includes('NA')));
    if (!bestCandidate) bestCandidate = candidates.find(img => img.includes('Booster'));
    if (!bestCandidate) bestCandidate = candidates[0]; // Fallback

    console.log(`Best candidate: ${bestCandidate}`);

    const initialUrl = `https://yugipedia.com/wiki/Special:FilePath/${encodeURIComponent(bestCandidate)}`;
    const finalUrl = await getFinalUrl(initialUrl);

    if (finalUrl) {
        console.log(`FOUND: ${code} -> ${finalUrl}`);
        return finalUrl;
    } else {
        console.log(`[FAILED] Could not resolve URL for ${bestCandidate}`);
        return null;
    }
}

async function main() {
    console.log("Fetching sets...");
    const sets = await fetchSets();
    const found = {};

    for (const code of codes) {
        const set = sets.find(s => s.set_code === code);
        if (set) {
            const url = await findImageForCode(code, set.set_name);
            if (url) found[code] = url;
        } else {
            console.log(`[WARN] Set code ${code} not found in API`);
        }
    }

    fs.writeFileSync(path.join(__dirname, 'found_urls_final.json'), JSON.stringify(found, null, 2));
    console.log("Saved results to found_urls_final.json");
}

main();
