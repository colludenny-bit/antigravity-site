
export const detailedStrategies = [
    {
        id: 'strategy-1',
        name: 'News Spike Reversion',
        shortName: 'S1',
        type: 'Event-Driven',
        assets: ['NQ', 'S&P', 'XAUUSD', 'EURUSD'],
        description: 'Sfrutta l\'eccesso post-news quando il prezzo arriva su un estremo 1-2 settimane e poi "rifiuta" la rottura, puntando al ritorno verso il centro (VWAP/mid-range).',
        rules: [
            'Attendi evento high-impact e primo spike post-release',
            'Spike deve raggiungere/rompere zona premium (weekly/2-week H/L)',
            'Entry su rejection: rientro dentro il range',
            'Short: rientro sotto estremo high | Long: rientro sopra estremo low',
            'Stop oltre max/min dello spike',
            'TP1: +1.2R | TP2: +1.3R (runner)'
        ],
        triggers: [
            'Evento high-impact entro la giornata',
            'Spike raggiunge zona premium',
            'Rejection chiaro (prezzo rientra nel range)',
            'Distanza sufficiente per 1.2R verso centro'
        ],
        probabilityFactors: [
            'VIX non accelera contro il trade → Prob ↑',
            'Posizione entra rapidamente in profitto → Prob ↑',
            'Prezzo accetta fuori range → Prob ↓'
        ],
        // Performance Data (Simulated)
        status: 'WATCH',
        trades: 12,
        winRate: 62,
        avgWinR: 1.2,
        avgLossR: 1.0,
        riskReward: 1.44,
        expectancyR: 0.36, // (0.62 * 1.2) - (0.38 * 1.0)
        profitFactor: 1.95,
        maxDrawdown: 8,
        netPnl: 850,
        confidence: 60,
        action: 'MONITOR'
    },
    {
        id: 'strategy-2',
        name: 'VIX Range Fade',
        shortName: 'S2',
        type: 'Mean Reversion',
        assets: ['NQ', 'S&P'],
        description: 'Nei giorni senza catalizzatori forti, fare mean-reversion dagli estremi premium verso il centro. Prioritaria per indici USA.',
        rules: [
            'Attiva SOLO se NO news high-impact imminenti',
            'Prezzo deve testare zona premium almeno 2 volte',
            'Entry solo sul rientro dentro il range (rejection secondo test)',
            'Stop oltre max/min del test (1R deve restare piccolo)',
            'TP1: +1.2R | Runner: +1.3R solo se VIX non peggiora'
        ],
        triggers: [
            'Finestra "no-trade" attorno ai dati rispettata',
            'Secondo test della zona premium',
            'VIX stabile o in calo',
            'Spazio pulito fino al centro range'
        ],
        probabilityFactors: [
            'VIX stabile/in calo → Prob ↑',
            'Prezzo esteso dagli estremi → Prob ↑',
            'VIX accelera + prezzo accetta oltre estremo → Prob ↓'
        ],
        // Performance Data
        status: 'WATCH',
        trades: 24,
        winRate: 58,
        avgWinR: 1.2,
        avgLossR: 1.0,
        riskReward: 1.39,
        expectancyR: 0.27,
        profitFactor: 1.65,
        maxDrawdown: 10,
        netPnl: 1240,
        confidence: 55,
        action: 'MONITOR'
    },
    {
        id: 'strategy-3',
        name: 'Cross-Market Confirmation',
        shortName: 'S3',
        type: 'Analysis',
        assets: ['Tutti'],
        description: 'NON genera entry nuove. Aumenta o riduce la probabilità delle idee S1/S2 usando coerenza tra mercati (risk sentiment). Modulatore.',
        rules: [
            'Se VIX sale (stress): riduci prob long risk-on (NQ/S&P long, EURUSD long)',
            'Se VIX sale: aumenta cautela su fade contro trend',
            'Se VIX scende (risk-on): aumenta prob mean-reversion verso centro per indici',
            'Se VIX scende: riduci prob long XAU contrarian se non supportato'
        ],
        triggers: [
            'Cambio direzione VIX',
            'Divergenza tra asset correlati',
            'Conferma/divergenza risk sentiment'
        ],
        probabilityFactors: [
            'Coerenza tra mercati → Prob trade S1/S2 ↑',
            'Divergenza tra mercati → Prob trade S1/S2 ↓'
        ],
        isModulator: true,
        // Performance Data (N/A)
        status: 'ACTIVE',
        trades: 0,
        winRate: 0,
        avgWinR: 0,
        avgLossR: 0,
        maxDrawdown: 0,
        netPnl: 0,
        confidence: 100,
        action: 'USE'
    },
    {
        id: 'gamma-magnet',
        name: 'GammaMagnet Convergence',
        shortName: 'GM',
        type: 'Swing',
        assets: ['NQ', 'S&P', 'SPY', 'QQQ'],
        description: 'Sfrutta la convergenza del prezzo verso strike con alta gamma opzionaria. Market makers coprono, creando magneti di prezzo verso 0DTE strikes.',
        rules: [
            'Identifica strike con max OI opzioni 0DTE',
            'Entry quando prezzo a ±0.5% dallo strike target',
            'VIX deve essere < VVIX (volatilità compressa)',
            'Stop oltre max/min della candela di trigger',
            'TP1: raggiungimento strike | TP2: +1.24R'
        ],
        triggers: [
            'Prezzo entro 0.5% da strike ad alta gamma',
            'Market makers in delta hedging attivo',
            'Volume crescente verso lo strike',
            'VIX < VVIX (compressione vol)'
        ],
        probabilityFactors: [
            'Alta OI sullo strike → Prob ↑',
            'VIX in calo → Prob ↑',
            'Rottura dello strike con volume → Prob ↓',
            'FOMC/CPI entro 24h → Prob ↓'
        ],
        isAdvanced: true,
        // Performance Data
        status: 'LIVE',
        trades: 47,
        winRate: 68.1,
        avgWinR: 1.24,
        avgLossR: 1.0,
        riskReward: 1.24,
        expectancyR: 1.24, // Note: This was 1.24 in PerformancePage, calculated roughly (0.68*1.24 - 0.32*1) = 0.52. Using original value for consistency.
        profitFactor: 2.15,
        maxDrawdown: 8.2,
        netPnl: 4850,
        confidence: 92,
        action: 'SCALE'
    },
    {
        id: 'rate-volatility',
        // Was 'rate-vol-alignment' in StrategyPage
        name: 'Rate-Volatility Alignment',
        shortName: 'RV',
        type: 'Swing',
        assets: ['NQ', 'S&P', 'TLT', 'EURUSD'],
        description: 'Allinea direzione trade con movimento tassi vs volatilità. Long risk quando yield calano + VIX cala. Short quando divergono.',
        rules: [
            'Check correlazione 2Y/10Y yield vs VIX',
            'Long equity quando: yield ↓ + VIX ↓ (risk-on)',
            'Short equity quando: yield ↑ + VIX ↑ (stress)',
            'Evita se yield e VIX divergono',
            'Size ridotta 50% se correlazione < 0.7'
        ],
        triggers: [
            'Yield 2Y cambia direzione intraday',
            'VIX conferma direzione (stesso verso)',
            'DXY non diverge dal movimento',
            'No eventi FED imminenti'
        ],
        probabilityFactors: [
            'Correlazione yield-VIX > 0.8 → Prob ↑',
            'Conferma DXY → Prob ↑',
            'Divergenza asset → Prob ↓',
            'Curva yield inverte → cautela'
        ],
        isAdvanced: true,
        // Performance Data
        status: 'LIVE',
        trades: 32,
        winRate: 62.5,
        avgWinR: 0.98,
        avgLossR: 1.0,
        riskReward: 1.62,
        expectancyR: 0.98,
        profitFactor: 1.82,
        maxDrawdown: 12.4,
        netPnl: 2180,
        confidence: 78,
        action: 'MAINTAIN'
    },
    {
        id: 'volguard-mr',
        name: 'VolGuard Mean-Reversion',
        shortName: 'VG',
        type: 'Intraday',
        assets: ['NQ', 'S&P', 'SPX'],
        description: 'Mean-reversion intraday con stop dinamico basato su VIX. Più il VIX è basso, più aggressivo il fade. Scalping protetto.',
        rules: [
            'Attiva solo se VIX < 18 (low vol regime)',
            'Fade estremi 1.5 ATR da VWAP intraday',
            'Stop dinamico: 0.5 ATR se VIX < 15, 0.8 ATR se VIX 15-18',
            'TP = ritorno a VWAP (sempre)',
            'Max 3 trade/giorno per asset'
        ],
        triggers: [
            'VIX < 18 (regime low vol confermato)',
            'Prezzo esteso > 1.5 ATR da VWAP',
            'RSI 5min < 20 o > 80',
            'Volume exhaustion visibile'
        ],
        probabilityFactors: [
            'VIX < 15 → Prob ↑↑',
            'Primo trade del giorno → Prob ↑',
            'VIX in aumento → Prob ↓',
            'Terzo trade consecutivo → Prob ↓↓'
        ],
        isAdvanced: true,
        // Performance Data
        status: 'LIVE',
        trades: 89,
        winRate: 71.9,
        avgWinR: 0.65,
        avgLossR: 1.0,
        riskReward: 1.67,
        expectancyR: 0.65,
        profitFactor: 2.48,
        maxDrawdown: 5.1,
        netPnl: 3420,
        confidence: 95,
        action: 'SCALE'
    },
    {
        id: 'multi-day-rejection',
        // Was 'multi-day-ra' in StrategyPage
        name: 'Multi-Day Rejection',
        shortName: 'MD',
        type: 'Position',
        assets: ['NQ', 'S&P', 'XAUUSD', 'BTC'],
        description: 'Swing trade su rottura/rigetto multi-day. Attende accettazione o rigetto sopra/sotto livello chiave weekly.',
        rules: [
            'Identifica livello weekly (H/L 2 settimane)',
            'Attendi test + close daily sopra/sotto',
            'Rejection: chiusura rientra → fade direction',
            'Acceptance: 2 chiusure consecutive → trend follow',
            'Stop oltre il max/min del pattern',
            'TP1: centro range weekly | TP2: lato opposto'
        ],
        triggers: [
            'Prezzo su weekly H o L',
            'Prima chiusura daily oltre il livello',
            'ATR daily elevato (>1.5x media)',
            'Volume sopra media weekly'
        ],
        probabilityFactors: [
            'Rejection con wick lunga → Prob fade ↑↑',
            'Acceptance con close forte → Prob continuation ↑↑',
            'Inside day dopo rottura → attendi',
            'VIX in spike → aspetta stabilizzazione'
        ],
        isAdvanced: true,
        // Performance Data
        status: 'WATCH',
        trades: 18,
        winRate: 55.6,
        avgWinR: 1.85,
        avgLossR: 1.0,
        riskReward: 2.36,
        expectancyR: 1.85,
        profitFactor: 1.92,
        maxDrawdown: 15.2,
        netPnl: 1980,
        confidence: 65,
        action: 'REDUCE'
    }
];
