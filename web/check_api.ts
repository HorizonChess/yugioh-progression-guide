
const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

async function checkSets() {
    try {
        const response = await fetch(`${BASE_URL}/cardsets.php`);
        const data = await response.json();
        console.log("Sample Set Image URL:", data[0].set_image);
        console.log("Sample Set Image URL:", data[1].set_image);
        console.log("Sample Set Image URL:", data[10].set_image);
    } catch (error) {
        console.error(error);
    }
}

checkSets();
