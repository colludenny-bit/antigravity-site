import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL || ''}/api/market`;

// Cache to prevent rate limiting
let priceCache = {};
let lastFetchTime = 0;
const CACHE_DURATION = 60000; // 1 minute

export const MarketService = {
    // Get prices for Karion watchlist
    getPrices: async () => {
        const now = Date.now();
        if (now - lastFetchTime < CACHE_DURATION && Object.keys(priceCache).length > 0) {
            return priceCache;
        }

        try {
            const response = await axios.get(`${API_URL}/prices`);
            priceCache = response.data;
            lastFetchTime = now;
            return priceCache;
        } catch (error) {
            console.error('Market API Error:', error);
            return priceCache; // Return stale cache if error
        }
    },

    // Get trending coins
    getTrending: async () => {
        try {
            const response = await axios.get(`${API_URL}/trending`);
            return response.data.coins;
        } catch (error) {
            console.error('Market Trending Error:', error);
            return [];
        }
    },

    // Get detailed coin data
    getCoinDetails: async (id) => {
        try {
            const response = await axios.get(`${API_URL}/coin/${id}`);
            return response.data;
        } catch (error) {
            console.error(`Market Details Error (${id}):`, error);
            return null;
        }
    },

    // Get top 30 coins by market cap
    getTop30: async () => {
        try {
            const response = await axios.get(`${API_URL}/top30`);
            return response.data;
        } catch (error) {
            console.error('Market Top30 Error:', error);
            return [];
        }
    },

    // Get historical chart data
    getCoinChart: async (id, days = 7) => {
        try {
            const response = await axios.get(`${API_URL}/chart/${id}`, {
                params: { days }
            });
            return response.data;
        } catch (error) {
            console.error(`Market Chart Error (${id}):`, error);
            return null;
        }
    },

    // Get global market data
    getGlobalData: async () => {
        try {
            const response = await axios.get(`${API_URL}/global`);
            return response.data;
        } catch (error) {
            console.error('Market Global Error:', error);
            return null;
        }
    }
};
