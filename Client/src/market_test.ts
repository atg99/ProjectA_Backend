
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = 'http://localhost:3000';

async function main() {
    console.log('--- Starting Market System Test (Account: 11 / 11) ---');

    const username = '11';
    const password = '11';

    try {
        // 1. Login
        console.log(`1. Logging in as ${username}...`);
        const loginRes = await axios.post(`${API_URL}/auth/login`, { username, password });
        const token = loginRes.data.token;
        console.log('   Login successful. Token acquired.');

        // 2. Load Inventory to find an item to sell
        console.log('2. Loading Inventory...');
        const loadRes = await axios.post(`${API_URL}/inventory/load`, { token });
        const items = loadRes.data.saved_entries;

        if (!items || items.length === 0) {
            console.log('   No items found in inventory. Please make sure account 11 has items.');
            return;
        }

        const itemToSell = items[0];
        console.log(`   Found item: ${itemToSell.primary_asset_id} (ID: ${itemToSell.item_entry_id})`);

        // 3. List Item on Market
        console.log('3. Listing item on market...');
        const price = 500;
        const qty = 1;
        const listRes = await axios.post(`${API_URL}/api/v1/market/listings`, {
            token,
            item_entry_id: itemToSell.item_entry_id,
            qty,
            price
        });
        const listingId = listRes.data.listing_id;
        console.log(`   Item listed successfully. Listing ID: ${listingId}, Price: ${price}`);

        // 4. Search Market to confirm
        console.log('4. Confirming listing via search...');
        const searchRes = await axios.get(`${API_URL}/api/v1/market/listings?keyword=${itemToSell.primary_asset_id}`);
        const found = searchRes.data.data.find((l: any) => l.listing_id === listingId);
        if (found) {
            console.log('   Confirmed: Listing found in market search.');
        } else {
            console.warn('   Warning: Listing not found in search results.');
        }

        // 5. Check My Listings
        console.log('5. Checking my listings...');
        const myRes = await axios.get(`${API_URL}/api/v1/market/my-listings?status=active`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (myRes.data.find((l: any) => l.listing_id === listingId)) {
            console.log('   Confirmed: Listing found in my-listings.');
        }

        // 6. Cancel Listing
        console.log('6. Cancelling listing...');
        await axios.post(`${API_URL}/api/v1/market/listings/${listingId}/cancel`, { token });
        console.log('   Listing cancelled. Item should be returned to stash.');

        console.log('--- Test Completed Successfully ---');

    } catch (e: any) {
        console.error('Test Failed:', e.response?.data || e.message);
    }
}

main();
