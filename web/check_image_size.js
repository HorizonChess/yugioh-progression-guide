
const https = require('https');
const sizeOf = require('image-size');

const url = 'https://images.ygoprodeck.com/images/sets/YS15.jpg';

https.get(url, function (response) {
    const chunks = [];
    response.on('data', function (chunk) {
        chunks.push(chunk);
    });
    response.on('end', function () {
        const buffer = Buffer.concat(chunks);
        const dimensions = sizeOf(buffer);
        console.log(dimensions.width, dimensions.height);
    });
});
