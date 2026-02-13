// Risk Analysis Service — Updated 11 Feb 2026
export const RiskService = {
    getRiskAnalysis: async () => {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Generate dynamic mock data
        const baseScore = 52;
        const randomFluctuation = Math.floor(Math.random() * 10) - 5;
        const riskScore = Math.max(0, Math.min(100, baseScore + randomFluctuation));

        let category = 'MEDIUM';
        if (riskScore < 40) category = 'SAFE';
        if (riskScore > 75) category = 'HIGH';

        return {
            risk_score: riskScore,
            risk_category: category,
            last_update: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            reasons: [
                { name: 'VIX Momentum', desc: 'Volatilità stabile', value: 12 },
                { name: 'Jobs Report', desc: 'NFP sopra attese (+130K)', value: 15 },
                { name: 'Market Breadth', desc: 'Indici in range', value: 10 }
            ],
            components: {
                vix_level: 14,
                vix_momentum: 8,
                event_risk: 18,
                market_stretch: 12
            },
            vix: {
                current: 17.62,
                change: -0.96,
                regime: 'neutral',
                yesterday: 17.79,
                high_5d: 18.45,
                low_5d: 16.80,
                source: 'CBOE'
            },
            expected_move: {
                percent: 0.72,
                sp500_points: 50
            },
            next_event: {
                event: 'CPI Data Release',
                hours_away: 48
            },
            macro_events: [
                { time: '14:30', event: 'NFP (Jan)', consensus: '65K', previous: '256K', impact: 'high' },
                { time: '14:30', event: 'Unemployment Rate', consensus: '4.4%', previous: '4.4%', impact: 'high' },
                { time: '16:00', event: 'Fed Speeches', consensus: '-', previous: '-', impact: 'medium' },
                { time: 'Ven 14:30', event: 'CPI (Jan)', consensus: '2.5%', previous: '2.9%', impact: 'high' }
            ],
            assets: {
                EURUSD: { current: 1.1870, weekly_high: 1.1920, weekly_low: 1.1770, distance_to_extreme: 0.42, nearest_extreme: 'Weekly Mid' },
                BTCUSD: { current: 67230, weekly_high: 72000, weekly_low: 65500, distance_to_extreme: 2.6, nearest_extreme: 'Weekly Low' },
                SPX: { current: 6941, weekly_high: 6970, weekly_low: 6880, distance_to_extreme: 0.4, nearest_extreme: 'Weekly Mid' }
            },
            asset_tilts: {
                EURUSD: { tilt: 'bullish', color: 'green', text: 'EUR forte, DXY debole' },
                BTCUSD: { tilt: 'bearish', color: 'red', text: 'Sell-off da $100K, test $65K' },
                SPX: { tilt: 'neutral', color: 'yellow', text: 'Range post-NFP, attesa CPI' }
            }
        };
    }
};
