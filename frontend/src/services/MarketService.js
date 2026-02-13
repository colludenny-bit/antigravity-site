import axios from 'axios';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

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
            const response = await axios.get(`${COINGECKO_API}/simple/price`, {
                params: {
                    ids: 'bitcoin,ethereum,solana,ripple,cardano',
                    vs_currencies: 'usd',
                    include_24hr_change: 'true',
                    include_24hr_vol: 'true',
                    include_market_cap: 'true'
                }
            });

            priceCache = response.data;
            lastFetchTime = now;
            return priceCache;
        } catch (error) {
            console.error('CoinGecko API Error:', error);
            return priceCache; // Return stale cache if error
        }
    },

    // Get trending coins
    getTrending: async () => {
        try {
            const response = await axios.get(`${COINGECKO_API}/search/trending`);
            return response.data.coins;
        } catch (error) {
            console.error('CoinGecko Trending Error:', error);
            return [];
        }
    },

    // Get detailed coin data
    getCoinDetails: async (id) => {
        try {
            const response = await axios.get(`${COINGECKO_API}/coins/${id}`, {
                params: {
                    localization: false,
                    tickers: false,
                    market_data: true,
                    community_data: true,
                    developer_data: true,
                    sparkline: true
                }
            });
            return response.data;
        } catch (error) {
            console.error(`CoinGecko Details Error (${id}):`, error);
            return null;
        }
    },

    // Get top 30 coins by market cap
    getTop30: async () => {
        try {
            const response = await axios.get(`${COINGECKO_API}/coins/markets`, {
                params: {
                    vs_currency: 'usd',
                    order: 'market_cap_desc',
                    per_page: 30,
                    page: 1,
                    sparkline: true,
                    price_change_percentage: '1h,24h,7d'
                }
            });
            return response.data;
        } catch (error) {
            console.error('CoinGecko Top30 Error:', error);
            return [];
        }
    },

    // Get historical chart data
    getCoinChart: async (id, days = 7) => {
        try {
            const response = await axios.get(`${COINGECKO_API}/coins/${id}/market_chart`, {
                params: {
                    vs_currency: 'usd',
                    days: days
                }
            });
            return response.data;
        } catch (error) {
            console.error(`CoinGecko Chart Error (${id}):`, error);
            return null;
        }
    },

    // Get global market data
    getGlobalData: async () => {
        try {
            const response = await axios.get(`${COINGECKO_API}/global`);
            return response.data.data;
        } catch (error) {
            console.error('CoinGecko Global Error:', error);
            return null;
        }
    }
};
