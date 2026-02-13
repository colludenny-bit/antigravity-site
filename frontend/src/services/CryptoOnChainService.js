/**
 * CryptoOnChainService — Simulated on-chain data
 * Ready to plug in real APIs: Dune Analytics, Whale Alert, Moralis, Helius
 */

// Seeded random for consistent fake data
const seededRandom = (seed) => {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
};

const symbolSeed = (symbol) => {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash);
};

const formatUSD = (n) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
};

const WHALE_LABELS = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Unknown Wallet', 'Jump Trading', 'Wintermute', 'Alameda Legacy', 'a]16z', 'Paradigm'];
const TX_TYPES = ['transfer', 'exchange_deposit', 'exchange_withdrawal'];

export const CryptoOnChainService = {

    // ===== TAB 2: WHALES =====
    getWhaleTransactions: (symbol, count = 15) => {
        const rng = seededRandom(symbolSeed(symbol) + Date.now() % 1000);
        const txs = [];
        for (let i = 0; i < count; i++) {
            const amount = 1e6 + rng() * 49e6; // $1M - $50M
            const type = TX_TYPES[Math.floor(rng() * TX_TYPES.length)];
            const from = WHALE_LABELS[Math.floor(rng() * WHALE_LABELS.length)];
            let to = WHALE_LABELS[Math.floor(rng() * WHALE_LABELS.length)];
            while (to === from) to = WHALE_LABELS[Math.floor(rng() * WHALE_LABELS.length)];
            txs.push({
                id: `tx-${symbol}-${i}`,
                hash: `0x${Array.from({ length: 8 }, () => Math.floor(rng() * 16).toString(16)).join('')}...`,
                amount,
                amountFormatted: formatUSD(amount),
                type,
                from,
                to,
                timestamp: new Date(Date.now() - rng() * 86400000 * 3).toISOString(),
                isAlert: amount > 10e6
            });
        }
        return txs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },

    getExchangeNetflow: (symbol, days = 14) => {
        const rng = seededRandom(symbolSeed(symbol) + 42);
        const data = [];
        for (let i = days; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000);
            const inflow = 50 + rng() * 200; // Millions
            const outflow = 50 + rng() * 200;
            data.push({
                date: date.toISOString().split('T')[0],
                inflow: Math.round(inflow),
                outflow: Math.round(outflow),
                netflow: Math.round(inflow - outflow)
            });
        }
        return data;
    },

    getTopWallets: (symbol, count = 10) => {
        const rng = seededRandom(symbolSeed(symbol) + 99);
        return Array.from({ length: count }, (_, i) => ({
            rank: i + 1,
            address: `0x${Array.from({ length: 6 }, () => Math.floor(rng() * 16).toString(16)).join('')}...${Array.from({ length: 4 }, () => Math.floor(rng() * 16).toString(16)).join('')}`,
            label: i < 3 ? WHALE_LABELS[Math.floor(rng() * WHALE_LABELS.length)] : null,
            balance: formatUSD(1e8 + rng() * 9e9),
            pnl: (rng() - 0.3) * 200, // -60% to +140%
            pnlFormatted: `${((rng() - 0.3) * 200).toFixed(1)}%`,
            lastActive: `${Math.floor(rng() * 24)}h ago`
        }));
    },

    // ===== TAB 3: ON-CHAIN FLOWS =====
    getExchangeFlows: (symbol, days = 30) => {
        const rng = seededRandom(symbolSeed(symbol) + 77);
        const data = [];
        for (let i = days; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000);
            data.push({
                date: date.toISOString().split('T')[0],
                inflow: Math.round(20 + rng() * 150),
                outflow: Math.round(20 + rng() * 150)
            });
        }
        return data;
    },

    getHolderDistribution: (symbol) => {
        const rng = seededRandom(symbolSeed(symbol) + 55);
        const longTerm = 35 + rng() * 25;
        const medTerm = 15 + rng() * 15;
        const shortTerm = 100 - longTerm - medTerm;
        return [
            { name: 'Long-term (>1y)', value: Math.round(longTerm), color: '#00D9A5' },
            { name: 'Medium (3-12m)', value: Math.round(medTerm), color: '#F59E0B' },
            { name: 'Short-term (<3m)', value: Math.round(shortTerm), color: '#EF4444' }
        ];
    },

    getMVRV: (symbol, timeframe = '1M') => {
        const rng = seededRandom(symbolSeed(symbol) + Date.now() % 10000);
        const value = 0.8 + rng() * 3.5;

        // Points and interval per timeframe
        const tfConfig = {
            '1D': { points: 24, intervalMs: 3600000, labelFmt: 'hour' },
            '1W': { points: 7 * 24, intervalMs: 3600000, labelFmt: 'day' },
            '1M': { points: 30, intervalMs: 86400000, labelFmt: 'day' },
            '1Y': { points: 52, intervalMs: 7 * 86400000, labelFmt: 'month' },
            'ALL': { points: 120, intervalMs: 30 * 86400000, labelFmt: 'month' }
        };
        const cfg = tfConfig[timeframe] || tfConfig['1M'];

        // Base price for simulation
        const basePrices = { BTC: 68000, ETH: 3800, SOL: 180, XRP: 0.55, ADA: 0.45 };
        const basePrice = basePrices[symbol] || 1000 + seededRandom(symbolSeed(symbol))() * 50000;

        const history = Array.from({ length: cfg.points }, (_, i) => {
            const ptRng = seededRandom(symbolSeed(symbol) + i * 7 + timeframe.charCodeAt(0));
            const mvrvVal = 0.6 + ptRng() * 4.0;
            // Price correlated with MVRV (higher MVRV = higher price relative to baseline)
            const priceNoise = (ptRng() - 0.5) * 0.15;
            const priceFactor = 0.5 + (mvrvVal / 4.5) + priceNoise;
            const price = basePrice * priceFactor;

            const ts = Date.now() - (cfg.points - i) * cfg.intervalMs;
            const d = new Date(ts);
            let dateLabel;
            if (cfg.labelFmt === 'hour') dateLabel = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            else if (cfg.labelFmt === 'month') dateLabel = d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
            else dateLabel = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

            return {
                date: dateLabel,
                value: parseFloat(mvrvVal.toFixed(2)),
                price: Math.round(price)
            };
        });

        return {
            value: parseFloat(value.toFixed(2)),
            signal: value > 3.5 ? 'overvalued' : value < 1 ? 'undervalued' : 'fair',
            history
        };
    },

    getSOPR: (symbol) => {
        const rng = seededRandom(symbolSeed(symbol) + 33);
        return Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
            value: parseFloat((0.85 + seededRandom(symbolSeed(symbol) + i + 100)() * 0.35).toFixed(3))
        }));
    },

    // ===== TAB 4: DEFI METRICS =====
    getDeFiMetrics: (symbol) => {
        const rng = seededRandom(symbolSeed(symbol) + 88);
        const tvl = 1e9 + rng() * 50e9;
        const dexVol = 1e8 + rng() * 5e9;

        const protocols = [
            { name: 'Uniswap', value: Math.round(rng() * 30 + 10), color: '#FF007A' },
            { name: 'Aave', value: Math.round(rng() * 20 + 5), color: '#B6509E' },
            { name: 'Lido', value: Math.round(rng() * 25 + 8), color: '#00A3FF' },
            { name: 'Maker', value: Math.round(rng() * 15 + 3), color: '#1AAB9B' },
            { name: 'Curve', value: Math.round(rng() * 10 + 2), color: '#FF4E00' },
            { name: 'Others', value: 0, color: '#6B7280' }
        ];
        protocols[5].value = 100 - protocols.slice(0, 5).reduce((s, p) => s + p.value, 0);

        const liquidations = Array.from({ length: 24 }, (_, h) => ({
            hour: `${h}:00`,
            longs: Math.round(rng() * 50),
            shorts: Math.round(rng() * 50)
        }));

        const tvlHistory = Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
            tvl: parseFloat(((tvl * (0.85 + seededRandom(symbolSeed(symbol) + i + 200)() * 0.3)) / 1e9).toFixed(2))
        }));

        return {
            tvl,
            tvlFormatted: formatUSD(tvl),
            tvlChange: parseFloat(((rng() - 0.4) * 20).toFixed(1)),
            dexVolume: dexVol,
            dexVolumeFormatted: formatUSD(dexVol),
            protocols,
            liquidations,
            tvlHistory,
            openInterest: formatUSD(5e8 + rng() * 20e9),
            fundingRate: parseFloat(((rng() - 0.5) * 0.1).toFixed(4))
        };
    },

    // ===== TAB 5: FUNDAMENTALS =====
    getProjectFundamentals: (symbol) => {
        const rng = seededRandom(symbolSeed(symbol) + 111);
        const totalSupply = symbol === 'BTC' ? 21e6 : symbol === 'ETH' ? 120e6 : 500e6 + rng() * 10e9;
        const circulating = totalSupply * (0.5 + rng() * 0.45);

        const devActivity = Array.from({ length: 12 }, (_, i) => ({
            month: new Date(Date.now() - (12 - i) * 30 * 86400000).toISOString().slice(0, 7),
            commits: Math.round(50 + rng() * 300),
            contributors: Math.round(10 + rng() * 100)
        }));

        const socialSentiment = {
            score: Math.round(30 + rng() * 70),
            twitter: Math.round(1e4 + rng() * 5e5),
            reddit: Math.round(1e3 + rng() * 1e5),
            telegram: Math.round(500 + rng() * 5e4)
        };

        return {
            totalSupply,
            circulatingSupply: circulating,
            circulatingRatio: parseFloat((circulating / totalSupply * 100).toFixed(1)),
            maxSupply: symbol === 'BTC' ? 21e6 : null,
            devActivity,
            socialSentiment
        };
    },

    // ===== BIAS SCORE ENGINE =====
    calculateBiasScore: (whaleData, flowData, holderData, mvrv) => {
        let score = 50; // Neutral baseline

        // Whale accumulation (netflow negative = accumulating = bullish)
        if (flowData && flowData.length > 0) {
            const recentNetflow = flowData.slice(-7).reduce((s, d) => s + d.netflow, 0);
            if (recentNetflow < -100) score += 15;
            else if (recentNetflow < 0) score += 8;
            else if (recentNetflow > 100) score -= 15;
            else if (recentNetflow > 0) score -= 5;
        }

        // Holder distribution (more long-term = bullish)
        if (holderData) {
            const longTerm = holderData.find(h => h.name.includes('Long'));
            if (longTerm && longTerm.value > 50) score += 10;
            else if (longTerm && longTerm.value > 40) score += 5;
        }

        // MVRV (< 1 = undervalued = bullish, > 3.5 = overvalued = bearish)
        if (mvrv) {
            if (mvrv.value < 1) score += 15;
            else if (mvrv.value < 1.5) score += 8;
            else if (mvrv.value > 3.5) score -= 20;
            else if (mvrv.value > 2.5) score -= 10;
        }

        // Whale alerts (big moves = volatility)
        if (whaleData) {
            const alertCount = whaleData.filter(tx => tx.isAlert).length;
            if (alertCount > 3) score -= 5; // High whale activity = uncertainty
        }

        return {
            score: Math.max(0, Math.min(100, Math.round(score))),
            signal: score >= 65 ? 'BULLISH' : score <= 35 ? 'BEARISH' : 'NEUTRAL',
            factors: {
                whaleAccumulation: score > 50 ? 'positive' : 'negative',
                holderGrowth: 'stable',
                exchangeFlow: flowData ? (flowData.slice(-7).reduce((s, d) => s + d.netflow, 0) < 0 ? 'outflow' : 'inflow') : 'neutral',
                mvrvSignal: mvrv ? mvrv.signal : 'unknown'
            }
        };
    }
};
