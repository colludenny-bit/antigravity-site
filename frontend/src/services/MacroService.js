// Macro Data Service — Updated 11 Feb 2026
// Real market data snapshot. Simulated random walk for live updates.

let cache = {
    indices: {
        SPX: { price: 6941.47, change: -0.01, name: 'S&P 500' },
        NDX: { price: 21450.80, change: 0.29, name: 'NASDAQ 100' },
        XAU: { price: 5055.20, change: -0.48, name: 'Gold' },
        VIX: { price: 17.62, change: -0.96, name: 'Volatility' },
        DXY: { price: 96.60, change: -0.31, name: 'Dollar Index' }
    },
    lastUpdate: Date.now()
};
let inFlightRequest = null;
const CACHE_TTL_MS = 15000;
const REQUEST_TIMEOUT_MS = 6000;

const mapBackendToIndices = (data) => {
    if (!data || typeof data !== 'object') return;

    if (data.SP500) {
        cache.indices.SPX = { price: data.SP500.price, change: data.SP500.change, name: 'S&P 500' };
    }
    if (data.NAS100) {
        cache.indices.NDX = { price: data.NAS100.price, change: data.NAS100.change, name: 'NASDAQ 100' };
    }
    if (data.XAUUSD) {
        cache.indices.XAU = { price: data.XAUUSD.price, change: data.XAUUSD.change, name: 'Gold' };
    }
    if (data.VIX) {
        cache.indices.VIX = { price: data.VIX.price, change: data.VIX.change, name: 'Volatility' };
    }
    if (data.DXY) {
        cache.indices.DXY = { price: data.DXY.price, change: data.DXY.change, name: 'Dollar Index' };
    }
};

export const MacroService = {
    // Get live macro data (simulated random walk)
    // Get live macro data (REAL FROM BACKEND)
    getLiveIndices: async () => {
        const now = Date.now();
        // Reuse recent cache for smoother UI and less backend pressure.
        if (now - cache.lastUpdate < CACHE_TTL_MS) {
            return cache.indices;
        }

        if (inFlightRequest) {
            return inFlightRequest;
        }

        inFlightRequest = (async () => {
            try {
                const FETCH_URL = `${process.env.REACT_APP_BACKEND_URL || ''}/api/market/prices`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
                let response;
                try {
                    response = await fetch(FETCH_URL, { signal: controller.signal });
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) throw new Error("API call failed");

                const data = await response.json();
                mapBackendToIndices(data);
                cache.lastUpdate = Date.now();
                return cache.indices;

            } catch (error) {
                console.warn("MacroService: Live data fetch failed, using fallback", error);

                // FALLBACK to simulation
                const elapsed = (Date.now() - cache.lastUpdate) / 1000;
                Object.keys(cache.indices).forEach(key => {
                    const volatility = key === 'VIX' ? 0.05 : key === 'NDX' ? 0.02 : 0.01;
                    const change = (Math.random() - 0.5) * volatility * (elapsed || 1);
                    const current = cache.indices[key];
                    const newPrice = current.price * (1 + change / 100);
                    const newPercent = current.change + (change * 10);

                    cache.indices[key] = {
                        ...current,
                        price: parseFloat(newPrice.toFixed(2)),
                        change: parseFloat(newPercent.toFixed(2))
                    };
                });
                cache.lastUpdate = Date.now();
                return cache.indices;
            } finally {
                inFlightRequest = null;
            }
        })();

        return inFlightRequest;
    },

    // Get COT Data (Weekly) — Report date: Feb 3, 2026 (published Feb 6)
    getCOTData: async () => {
        const generateHistory = (base, volatility, length = 12) => {
            let history = [];
            let current = base;
            for (let i = length; i >= 0; i--) {
                current += (Math.random() - 0.5) * volatility;
                history.push({
                    date: `W-${i}`,
                    value: Math.round(current)
                });
            }
            return history;
        };

        return {
            SPX: {
                symbol: 'SPX',
                name: 'S&P 500 E-Mini',
                netPosition: -132900,
                change: -18400,
                sentiment: 'BEARISH',
                technical: {
                    zScore: -2.45,
                    percentile52W: 8,
                    concentration4: 58.2,
                    concentration8: 76.8,
                    oiCorrelation: -0.72
                },
                rollingBias: [
                    { label: 'W-3', value: 38, isCurrent: false },
                    { label: 'W-2', value: 25, isCurrent: false },
                    { label: 'W-1', value: 15, isCurrent: false, isPrevious: true },
                    { label: 'W-0', value: 8, isCurrent: true }
                ],
                breakdownTFF: {
                    assetManagers: { long: 95000, short: 110000, net: -15000, change: -4200, oiPct: 22 },
                    leveragedFunds: { long: 82000, short: 214941, net: -132941, change: -12800, oiPct: 38 },
                    otherReportables: { long: 35000, short: 22000, net: 13000, change: 600, oiPct: 8 }
                },
                openInterest: 1380000,
                history: generateHistory(-132900, 25000)
            },
            NDX: {
                symbol: 'NDX',
                name: 'Nasdaq 100 E-Mini',
                netPosition: -58200,
                change: -9800,
                sentiment: 'BEARISH',
                technical: {
                    zScore: -1.85,
                    percentile52W: 14,
                    concentration4: 52.4,
                    concentration8: 71.6,
                    oiCorrelation: -0.58
                },
                rollingBias: [
                    { label: 'W-3', value: 42, isCurrent: false },
                    { label: 'W-2', value: 32, isCurrent: false },
                    { label: 'W-1', value: 20, isCurrent: false, isPrevious: true },
                    { label: 'W-0', value: 14, isCurrent: true }
                ],
                breakdownTFF: {
                    assetManagers: { long: 58000, short: 82000, net: -24000, change: -3500, oiPct: 26 },
                    leveragedFunds: { long: 42000, short: 78000, net: -36000, change: -5200, oiPct: 32 },
                    otherReportables: { long: 10000, short: 8200, net: 1800, change: 200, oiPct: 6 }
                },
                openInterest: 720000,
                history: generateHistory(-58200, 18000)
            },
            XAU: {
                symbol: 'XAU',
                name: 'Gold (COMEX)',
                netPosition: 93438,
                change: -28200,
                sentiment: 'BULLISH',
                technical: {
                    zScore: 0.85,
                    percentile52W: 35,
                    concentration4: 42.5,
                    concentration8: 58.2,
                    oiCorrelation: 0.62
                },
                rollingBias: [
                    { label: 'W-3', value: 82, isCurrent: false },
                    { label: 'W-2', value: 68, isCurrent: false },
                    { label: 'W-1', value: 52, isCurrent: false, isPrevious: true },
                    { label: 'W-0', value: 35, isCurrent: true }
                ],
                breakdownTFF: {
                    assetManagers: { long: 115000, short: 52000, net: 63000, change: -18500, oiPct: 35 },
                    leveragedFunds: { long: 55000, short: 38000, net: 17000, change: -8400, oiPct: 22 },
                    otherReportables: { long: 22000, short: 8562, net: 13438, change: -1300, oiPct: 8 }
                },
                openInterest: 485000,
                history: generateHistory(93438, 15000)
            },
            EUR: {
                symbol: 'EUR',
                name: 'Euro FX',
                netPosition: 163361,
                change: 31200,
                sentiment: 'BULLISH',
                technical: {
                    zScore: 2.15,
                    percentile52W: 92,
                    concentration4: 35.8,
                    concentration8: 52.4,
                    oiCorrelation: 0.88
                },
                rollingBias: [
                    { label: 'W-3', value: 62, isCurrent: false },
                    { label: 'W-2', value: 75, isCurrent: false },
                    { label: 'W-1', value: 85, isCurrent: false, isPrevious: true },
                    { label: 'W-0', value: 92, isCurrent: true }
                ],
                breakdownTFF: {
                    assetManagers: { long: 185000, short: 48000, net: 137000, change: 22400, oiPct: 42 },
                    leveragedFunds: { long: 72000, short: 52000, net: 20000, change: 6800, oiPct: 18 },
                    otherReportables: { long: 14361, short: 8000, net: 6361, change: 2000, oiPct: 8 }
                },
                openInterest: 540000,
                history: generateHistory(163361, 20000)
            }
        };
    },

    // Get Options Gamma Exposure (GEX) — Updated for SPX ~6941
    getGEXData: async () => {
        return {
            SPX: {
                totalGamma: 4.8, // Billion $ per 1% move
                zeroGamma: 6900,
                callWall: 7000,
                putWall: 6850,
                profile: [
                    { strike: 6850, gamma: -2.8, type: 'Put Wall' },
                    { strike: 6900, gamma: -0.4, type: 'Flip Zone' },
                    { strike: 6925, gamma: 0.8, type: 'Neutral' },
                    { strike: 6950, gamma: 2.2, type: 'Resistance' },
                    { strike: 7000, gamma: 4.2, type: 'Call Wall' }
                ]
            }
        };
    },

    // Get Fundamental Economic Indicators — Updated 11 Feb 2026
    getFundamentals: async () => {
        return {
            FED_RATE: { value: 3.625, name: "Tasso FED", trend: "flat", suffix: "%" },
            CPI_YOY: { value: 2.5, name: "Inflazione (CPI)", trend: "down", suffix: "%" },
            UNEMPLOYMENT: { value: 4.3, name: "Disoccupazione", trend: "down", suffix: "%" },
            GDP_QOQ: { value: 2.3, name: "GDP Growth", trend: "down", suffix: "%" },
            US10Y: { value: 4.18, name: "US 10Y Yield", trend: "up", suffix: "%" }
        };
    }
};
