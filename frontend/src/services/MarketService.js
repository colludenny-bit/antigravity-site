import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/api/market`;

// Cache to prevent rate limiting
let priceCache = {};
let lastFetchTime = 0;
const CACHE_DURATION = 60000; // 1 minute

const FALLBACK_COINS = [
    {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
        current_price: 63500,
        price_change_percentage_24h: 1.8,
        market_cap: 1245000000000,
        total_volume: 42000000000,
        circulating_supply: 18900000,
        ath: 69000,
        ath_change_percentage: -7.6,
        atl: 67,
        atl_change_percentage: 93000,
        max_supply: 21000000
    },
    {
        id: 'ethereum',
        symbol: 'eth',
        name: 'Ethereum',
        image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
        current_price: 3670,
        price_change_percentage_24h: -0.6,
        market_cap: 440000000000,
        total_volume: 18000000000,
        circulating_supply: 121000000,
        ath: 4878,
        ath_change_percentage: -24.7,
        atl: 0.43,
        atl_change_percentage: 850000,
        max_supply: null
    },
    {
        id: 'solana',
        symbol: 'sol',
        name: 'Solana',
        image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
        current_price: 178,
        price_change_percentage_24h: 2.4,
        market_cap: 78000000000,
        total_volume: 3200000000,
        circulating_supply: 420000000,
        ath: 260,
        ath_change_percentage: -31.5,
        atl: 0.505,
        atl_change_percentage: 35000,
        max_supply: null
    },
    {
        id: 'ripple',
        symbol: 'xrp',
        name: 'XRP',
        image: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
        current_price: 0.61,
        price_change_percentage_24h: 0.7,
        market_cap: 34000000000,
        total_volume: 1900000000,
        circulating_supply: 48000000000,
        ath: 3.84,
        ath_change_percentage: -84.1,
        atl: 0.0025,
        atl_change_percentage: 24000,
        max_supply: 100000000000
    },
    {
        id: 'cardano',
        symbol: 'ada',
        name: 'Cardano',
        image: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
        current_price: 0.45,
        price_change_percentage_24h: -1.2,
        market_cap: 15000000000,
        total_volume: 820000000,
        circulating_supply: 35000000000,
        ath: 3.1,
        ath_change_percentage: -85.5,
        atl: 0.017,
        atl_change_percentage: 2500,
        max_supply: 45000000000
    },
    {
        id: 'chainlink',
        symbol: 'link',
        name: 'Chainlink',
        image: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
        current_price: 18.2,
        price_change_percentage_24h: 0.2,
        market_cap: 9000000000,
        total_volume: 600000000,
        circulating_supply: 520000000,
        ath: 52.7,
        ath_change_percentage: -65.5,
        atl: 0.126,
        atl_change_percentage: 14000,
        max_supply: 1000000000
    }
];

const FALLBACK_GLOBAL_DATA = {
    total_market_cap: { usd: 1680000000000 },
    total_volume: { usd: 78000000000 },
    market_cap_percentage: { btc: 50.2, eth: 18.3 },
    active_cryptocurrencies: 12350
};

const BASE_PRICE_MAP = {
    bitcoin: 63500,
    ethereum: 3670,
    solana: 178,
    ripple: 0.61,
    cardano: 0.45,
    chainlink: 18.2
};

const buildFallbackChartData = (symbol, days) => {
    const now = Date.now();
    const basePrice = BASE_PRICE_MAP[symbol.toLowerCase()] || 3000;
    const interval = 24 * 60 * 60 * 1000;
    const data = [];
    const offset = symbol.charCodeAt(0) % 10;
    for (let i = days; i >= 0; i--) {
        const ts = now - i * interval;
        const wiggle = Math.sin((i + offset) / 2) * 0.03;
        const drift = Math.cos(i + offset) * 0.01;
        const price = basePrice * (1 + wiggle + drift);
        data.push([ts, parseFloat(price.toFixed(2))]);
    }

    return {
        prices: data,
        market_caps: data.map(([ts, price]) => [ts, parseFloat((price * 1.8e9).toFixed(2))]),
        total_volumes: data.map(([ts, price]) => [ts, parseFloat((price * 7.5e8).toFixed(2))])
    };
};

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
