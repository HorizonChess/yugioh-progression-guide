
const BASE_URL = 'https://db.ygoprodeck.com/api/v7';

async function checkSets() {
    try {
        const response = await fetch(`${BASE_URL}/cardsets.php`);
        const data = await response.json();
        console.log("Full Set Object:", JSON.stringify(data[0], null, 2));
    } catch (error) {
        console.error(error);
    }
}

checkSets();
