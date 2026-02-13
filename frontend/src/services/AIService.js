import axios from 'axios';

// AI Persona System Instructions
const KARION_SYSTEM_PROMPT = `
Sei Karion AI, un trading coach esperto e diretto.
Parli italiano in modo professionale ma "snappy", usando termini tecnici (RR, Liquidity, Bias, Delta, GEX, COT).
Analizzi i dati di mercato forniti e dai un bias chiaro: BULLISH, BEARISH o NEUTRAL.
Dai sempre un livello chiave di supporto e resistenza.
Non dare consigli finanziari, ma opinioni analitiche.
Stile: Breve, incisivo, con qualche emoji tattica.
`;

export const AIService = {
    // Analyze Market Condition
    analyzeMarket: async (marketData, apiKey) => {
        if (!apiKey) {
            return AIService.getSimulatedAnalysis(marketData);
        }

        try {
            let prompt = "";

            // Context Switching
            if (marketData.context === "Macro & Indices") {
                prompt = `
                Analizza questi dati Macro attuali:
                S&P 500: ${marketData.spx.price} (${marketData.spx.change}%)
                NASDAQ: ${marketData.ndx.price} (${marketData.ndx.change}%)
                GOLD: ${marketData.gold.price} (${marketData.gold.change}%)
                VIX: ${marketData.vix.price} (${marketData.vix.change}%)
                
                Dai un commento di 2 frasi sul sentiment Risk-On/Risk-Off e 1 livello chiave per SPX.
                `;
            } else {
                // Default Crypto Prompt
                const btc = marketData.bitcoin || { usd: 0, usd_24h_change: 0 };
                const eth = marketData.ethereum || { usd: 0, usd_24h_change: 0 };
                const sol = marketData.solana || { usd: 0, usd_24h_change: 0 };

                prompt = `
                Analizza questi dati crypto attuali:
                BTC: $${btc.usd} (${btc.usd_24h_change.toFixed(2)}%)
                ETH: $${eth.usd} (${eth.usd_24h_change.toFixed(2)}%)
                SOL: $${sol.usd} (${sol.usd_24h_change.toFixed(2)}%)
                
                Dai un breve commento di 2 frasi sul sentiment generale e 1 raccomandazione operativa generica.
                `;
            }

            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: KARION_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 150
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                text: response.data.choices[0].message.content,
                timestamp: new Date().toISOString(),
                source: 'OpenAI GPT-3.5'
            };
        } catch (error) {
            console.error('OpenAI API Error:', error);
            return AIService.getSimulatedAnalysis(marketData);
        }
    },

    // Fallback / Simulated Analysis if no key
    getSimulatedAnalysis: (marketData) => {
        // Macro Simulation
        if (marketData.context === "Macro & Indices") {
            const spxChange = marketData.spx?.change || 0;
            const vixChange = marketData.vix?.change || 0;

            let text = "";
            if (spxChange < -1 && vixChange > 5) {
                text = "🚨 Risk-Off aggressivo. VIX in esplosione e SPX perde livelli chiave. Proteggere i long o cercare short su rimbalzi deboli. Gold potrebbe fungere da hedge.";
            } else if (spxChange > 0.5 && vixChange < -2) {
                text = "🚀 Risk-On solido. Volatilità in compressione e Equity che spinge. Trend rialzista intatto, cercare entrate su dip. Tech (NDX) leader.";
            } else {
                text = "⚖️ Mercato misto/laterale. VIX stabile. Rotazione settoriale in corso, evitare posizioni pesanti su indici e cercare stock specifici.";
            }

            return {
                text,
                timestamp: new Date().toISOString(),
                source: 'Karion Simulation Engine'
            };
        }

        // Crypto Simulation
        const btcChange = marketData?.bitcoin?.usd_24h_change || 0;
        const isDump = btcChange < -3;
        const isPump = btcChange > 3;

        let text = "";
        if (isDump) {
            text = "🚨 Mercato in correzione aggressiva. BTC perde momentum. Focus su livelli di supporto HTF. Non cercare il bottom, aspetta conferme di inversione strutturale. Cash is a position.";
        } else if (isPump) {
            text = "🚀 Momentum rialzista confermato. BTC guida il mercato. Cerca pullback su zone di domanda H1/H4 per entries. Non shortare la forza!";
        } else {
            text = "⚖️ Mercato in consolidamento. Chop zone. Evita overtrading e attendi la rottura del range giornaliero. Focus su altcoin con catalizzatori specifici.";
        }

        return {
            text,
            timestamp: new Date().toISOString(),
            source: 'Karion Simulation Engine'
        };
    }
};
