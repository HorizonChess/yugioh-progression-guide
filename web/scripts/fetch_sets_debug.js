
const BASE_URL = 'https://db.ygoprodeck.com/api/v7';
const CUTOFF_DATE = '2017-08-01';

async function fetchAllSets() {
    try {
        const response = await fetch(`${BASE_URL}/cardsets.php`);
        if (!response.ok) {
            throw new Error('Failed to fetch card sets');
        }
        const data = await response.json();

        // Filter and sort by date
        return data
            .filter(set => {
                if (!set.tcg_date) return false;
                return set.tcg_date < CUTOFF_DATE && set.num_of_cards > 20;
            })
            .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime());
    } catch (error) {
        console.error('Error fetching sets:', error);
        return [];
    }
}

fetchAllSets().then(sets => {
    console.log(`Found ${sets.length} sets.`);
    sets.slice(0, 5).forEach(set => {
        console.log(`${set.set_code}: ${set.set_name} (Image: ${set.set_image})`);
    });
    // Also print some random ones to check codes
    console.log('...');
    sets.slice(20, 25).forEach(set => {
        console.log(`${set.set_code}: ${set.set_name}`);
    });
});
