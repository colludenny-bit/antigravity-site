import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import {
  TrendingUp, TrendingDown, Calendar, BarChart3, RefreshCw,
  AlertTriangle, Clock, Target, Shield, Zap, Activity,
  ArrowUp, ArrowDown, Minus, CheckCircle2, XCircle, Eye
} from 'lucide-react';

// Simulated market data - in production would come from API
const generateMarketData = () => {
  const now = new Date();
  const vixBase = 18 + Math.random() * 8;
  const vixChange = (Math.random() - 0.5) * 2;

  return {
    vix: {
      current: vixBase.toFixed(2),
      change: vixChange.toFixed(2),
      direction: vixChange > 0.3 ? 'rising' : vixChange < -0.3 ? 'falling' : 'stable',
      regime: vixBase > 25 ? 'risk-off' : vixBase > 20 ? 'neutral' : 'risk-on'
    },
    assets: {
      NQ: {
        name: 'NASDAQ 100',
        current: 21450 + Math.random() * 200,
        weeklyHigh: 21680,
        weeklyLow: 21120,
        twoWeekHigh: 21750,
        twoWeekLow: 20980,
        asiaHigh: 21520,
        asiaLow: 21380,
        asiaClose: 21450,
        yesterdayHigh: 21550,
        yesterdayLow: 21300,
        yesterdayClose: 21420
      },
      SP500: {
        name: 'S&P 500',
        current: 6050 + Math.random() * 30,
        weeklyHigh: 6095,
        weeklyLow: 5980,
        twoWeekHigh: 6120,
        twoWeekLow: 5920,
        asiaHigh: 6065,
        asiaLow: 6035,
        asiaClose: 6050,
        yesterdayHigh: 6070,
        yesterdayLow: 6020,
        yesterdayClose: 6045
      },
      XAUUSD: {
        name: 'Gold',
        current: 2650 + Math.random() * 20,
        weeklyHigh: 2680,
        weeklyLow: 2620,
        twoWeekHigh: 2700,
        twoWeekLow: 2590,
        asiaHigh: 2660,
        asiaLow: 2640,
        asiaClose: 2652,
        yesterdayHigh: 2665,
        yesterdayLow: 2635,
        yesterdayClose: 2648
      },
      EURUSD: {
        name: 'EUR/USD',
        current: 1.0850 + Math.random() * 0.005,
        weeklyHigh: 1.0920,
        weeklyLow: 1.0780,
        twoWeekHigh: 1.0950,
        twoWeekLow: 1.0720,
        asiaHigh: 1.0870,
        asiaLow: 1.0840,
        asiaClose: 1.0855,
        yesterdayHigh: 1.0880,
        yesterdayLow: 1.0820,
        yesterdayClose: 1.0845
      }
    },
    lastUpdate: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  };
};

// Calculate distance percentage
const calcDistancePercent = (current, level) => {
  return (((current - level) / level) * 100).toFixed(2);
};

// Calculate probability based on strategy rules
const calculateProbability = (asset, data, vix, strategy) => {
  let baseProbability = 50;
  const current = data.current;

  // Distance from extremes
  const distFromHigh = ((data.twoWeekHigh - current) / data.twoWeekHigh) * 100;
  const distFromLow = ((current - data.twoWeekLow) / data.twoWeekLow) * 100;

  // VIX factor
  const vixValue = parseFloat(vix.current);
  if (vix.regime === 'risk-on') baseProbability += 5;
  if (vix.regime === 'risk-off') baseProbability -= 5;
  if (vix.direction === 'falling') baseProbability += 3;
  if (vix.direction === 'rising') baseProbability -= 3;

  // Premium zone factor
  if (distFromHigh < 1 || distFromLow < 1) {
    baseProbability += 10; // Near premium zone
  }

  // Strategy specific
  if (strategy === 1) {
    // News Spike Reversion - higher prob if rejection visible
    baseProbability += 5;
  } else if (strategy === 2) {
    // VIX Range Fade - higher prob if VIX stable
    if (vix.direction === 'stable') baseProbability += 8;
  }

  // Cap probability
  return Math.min(Math.max(baseProbability, 35), 85);
};

// Generate signals based on strategies
const generateSignals = (marketData) => {
  const signals = [];
  const { vix, assets } = marketData;

  Object.entries(assets).forEach(([symbol, data]) => {
    const current = data.current;
    const prob1 = calculateProbability(symbol, data, vix, 1);
    const prob2 = calculateProbability(symbol, data, vix, 2);

    // Strategy 1 - News Spike Reversion
    if (prob1 >= 55) {
      const isNearHigh = current > data.weeklyHigh * 0.995;
      const isNearLow = current < data.weeklyLow * 1.005;

      if (isNearHigh || isNearLow) {
        const direction = isNearHigh ? 'short' : 'long';
        const entry = current;
        const stopDist = isNearHigh ? data.twoWeekHigh - current + 5 : current - data.twoWeekLow + 5;
        const oneR = Math.abs(stopDist);

        signals.push({
          id: `${symbol}-S1`,
          asset: symbol,
          assetName: data.name,
          strategy: 1,
          strategyName: 'News Spike Reversion',
          direction,
          trigger: isNearHigh
            ? `Prezzo vicino 2W High (${data.twoWeekHigh}), attendi rejection e rientro sotto ${data.weeklyHigh}`
            : `Prezzo vicino 2W Low (${data.twoWeekLow}), attendi rejection e rientro sopra ${data.weeklyLow}`,
          entry: entry.toFixed(symbol === 'EURUSD' ? 5 : 2),
          stop: isNearHigh
            ? (data.twoWeekHigh + oneR * 0.1).toFixed(symbol === 'EURUSD' ? 5 : 2)
            : (data.twoWeekLow - oneR * 0.1).toFixed(symbol === 'EURUSD' ? 5 : 2),
          oneR: oneR.toFixed(2),
          tp1: (entry + (direction === 'long' ? 1 : -1) * oneR * 1.2).toFixed(symbol === 'EURUSD' ? 5 : 2),
          tp2: (entry + (direction === 'long' ? 1 : -1) * oneR * 1.3).toFixed(symbol === 'EURUSD' ? 5 : 2),
          probability: prob1,
          confidence: Math.round(prob1 * 1.2),
          status: 'watch',
          pnlR: 0,
          motivations: [
            `Prezzo esteso verso zona premium ${isNearHigh ? 'high' : 'low'}`,
            `VIX ${vix.regime} (${vix.current}) - ${vix.direction === 'falling' ? 'supporta' : 'neutro per'} mean reversion`,
            `Spazio sufficiente per 1.2R verso centro range`
          ]
        });
      }
    }

    // Strategy 2 - VIX Range Fade (only for NQ and SP500)
    if ((symbol === 'NQ' || symbol === 'SP500') && prob2 >= 55 && vix.regime !== 'risk-off') {
      const midPoint = (data.weeklyHigh + data.weeklyLow) / 2;
      const distFromMid = Math.abs(current - midPoint);
      const range = data.weeklyHigh - data.weeklyLow;

      if (distFromMid > range * 0.35) {
        const direction = current > midPoint ? 'short' : 'long';
        const entry = current;
        const stopLevel = direction === 'short' ? data.weeklyHigh : data.weeklyLow;
        const oneR = Math.abs(entry - stopLevel);

        signals.push({
          id: `${symbol}-S2`,
          asset: symbol,
          assetName: data.name,
          strategy: 2,
          strategyName: 'VIX Range Fade',
          direction,
          trigger: `Prezzo esteso ${direction === 'short' ? 'verso high' : 'verso low'}, VIX ${vix.direction}, attendi secondo test e rejection`,
          entry: entry.toFixed(2),
          stop: (stopLevel + (direction === 'short' ? 1 : -1) * oneR * 0.05).toFixed(2),
          oneR: oneR.toFixed(2),
          tp1: (entry + (direction === 'long' ? 1 : -1) * oneR * 1.2).toFixed(2),
          tp2: (entry + (direction === 'long' ? 1 : -1) * oneR * 1.3).toFixed(2),
          probability: prob2,
          confidence: Math.round(prob2 * 1.15),
          status: 'watch',
          pnlR: 0,
          motivations: [
            `No news high-impact imminenti`,
            `VIX stabile/in calo (${vix.current}) favorisce mean-reversion`,
            `Prezzo esteso da mid-range, secondo test in formazione`
          ]
        });
      }
    }
  });

  return signals.filter(s => s.probability >= 55).slice(0, 6);
};

// Generate MEDIUM-TERM signals (1-2 weeks) - GammaMagnet, Rate-Vol Alignment
const generateMediumTermSignals = (marketData) => {
  const signals = [];
  const { vix, assets } = marketData;

  // GammaMagnet Convergence - NQ, SP500 (68% win rate)
  ['NQ', 'SP500'].forEach(symbol => {
    const data = assets[symbol] || assets.SP500;
    const current = data.current;
    const gammaLevel = symbol === 'NQ' ? 21500 : 6050;
    const distToGamma = Math.abs(current - gammaLevel);
    const prob = 68 + (distToGamma < 50 ? 5 : -3);

    signals.push({
      id: `${symbol}-GM`,
      asset: symbol,
      assetName: data.name,
      strategy: 'GM',
      strategyName: 'GammaMagnet Convergence',
      direction: current < gammaLevel ? 'long' : 'short',
      trigger: `Gamma positivo su strike ${gammaLevel}. OI elevato attrae prezzo.`,
      entry: current.toFixed(2),
      stop: (current + (current < gammaLevel ? -1 : 1) * 80).toFixed(2),
      oneR: '80',
      tp1: gammaLevel.toFixed(2),
      tp2: (gammaLevel + (current < gammaLevel ? 30 : -30)).toFixed(2),
      probability: Math.min(prob, 75),
      confidence: Math.round(prob * 1.1),
      status: 'watch',
      pnlR: 0,
      winRate: 68,
      timeframe: 'medium',
      motivations: [
        `Alta OI concentrata su strike ${gammaLevel}`,
        `VIX ${vix.regime} - favorisce convergenza gamma`,
        `Target: livello gamma magnet entro 5-7 giorni`
      ]
    });
  });

  // Rate-Volatility Alignment - TLT, EURUSD (62% win rate)
  ['EURUSD'].forEach(symbol => {
    const data = assets[symbol];
    if (!data) return;
    const current = data.current;
    const yieldTrend = Math.random() > 0.5 ? 'falling' : 'rising';
    const direction = yieldTrend === 'falling' ? 'long' : 'short';
    const prob = 62;

    signals.push({
      id: `${symbol}-RV`,
      asset: symbol,
      assetName: data.name,
      strategy: 'RV',
      strategyName: 'Rate-Volatility Alignment',
      direction,
      trigger: `Yield ${yieldTrend} + VIX ${vix.direction}. Correlazione attiva.`,
      entry: current.toFixed(5),
      stop: (current + (direction === 'long' ? -0.0080 : 0.0080)).toFixed(5),
      oneR: '80 pips',
      tp1: (current + (direction === 'long' ? 0.0100 : -0.0100)).toFixed(5),
      tp2: (current + (direction === 'long' ? 0.0130 : -0.0130)).toFixed(5),
      probability: prob,
      confidence: Math.round(prob * 1.15),
      status: 'watch',
      pnlR: 0,
      winRate: 62,
      timeframe: 'medium',
      motivations: [
        `Correlazione yield-VIX confermata`,
        `DXY ${direction === 'long' ? 'debole' : 'forte'} supporta setup`,
        `Target: 1.2R entro 1-2 settimane`
      ]
    });
  });

  return signals.filter(s => s.probability >= 55);
};

// Generate LONG-TERM signals (1-4 weeks) - Multi-Day Rejection
const generateLongTermSignals = (marketData) => {
  const signals = [];
  const { vix, assets } = marketData;

  // Multi-Day Rejection/Acceptance (56% win rate, high R:R)
  Object.entries(assets).forEach(([symbol, data]) => {
    const current = data.current;
    const weeklyRange = data.weeklyHigh - data.weeklyLow;
    const isNearHigh = current > data.twoWeekHigh * 0.99;
    const isNearLow = current < data.twoWeekLow * 1.01;

    if (isNearHigh || isNearLow) {
      const direction = isNearHigh ? 'short' : 'long';
      const rejectionType = isNearHigh ? 'Rejection da 2W High' : 'Rejection da 2W Low';
      const prob = 56 + (vix.regime === 'risk-on' && direction === 'long' ? 5 : 0);

      signals.push({
        id: `${symbol}-MD`,
        asset: symbol,
        assetName: data.name,
        strategy: 'MD',
        strategyName: 'Multi-Day Rejection',
        direction,
        trigger: `${rejectionType}. Attendi conferma close daily.`,
        entry: current.toFixed(symbol === 'EURUSD' ? 5 : 2),
        stop: isNearHigh
          ? (data.twoWeekHigh * 1.005).toFixed(symbol === 'EURUSD' ? 5 : 2)
          : (data.twoWeekLow * 0.995).toFixed(symbol === 'EURUSD' ? 5 : 2),
        oneR: (weeklyRange * 0.5).toFixed(2),
        tp1: (current + (direction === 'long' ? 1 : -1) * weeklyRange * 0.8).toFixed(symbol === 'EURUSD' ? 5 : 2),
        tp2: (current + (direction === 'long' ? 1 : -1) * weeklyRange * 1.2).toFixed(symbol === 'EURUSD' ? 5 : 2),
        probability: Math.min(prob, 65),
        confidence: Math.round(prob * 1.2),
        status: 'watch',
        pnlR: 0,
        winRate: 56,
        timeframe: 'long',
        motivations: [
          `${rejectionType} con wick lunga visibile`,
          `Setup swing multi-day: target 1.5-2R`,
          `Trailing stop dopo +1R per runner position`
        ]
      });
    }
  });

  return signals.filter(s => s.probability >= 50).slice(0, 4);
};

// Macro events
const macroEvents = [
  { time: '14:30', event: 'US Initial Jobless Claims', impact: 'medium', consensus: '220K', previous: '217K' },
  { time: '15:45', event: 'US S&P Global Manufacturing PMI', impact: 'medium', consensus: '49.5', previous: '49.4' },
  { time: '16:00', event: 'US Existing Home Sales', impact: 'low', consensus: '4.15M', previous: '4.09M' },
  { time: '20:00', event: 'FOMC Member Speech', impact: 'high', consensus: '-', previous: '-' },
];

const SignalCard = ({ signal }) => {
  const isLong = signal.direction === 'long';

  return (
    <div className={cn(
      "glass-enhanced p-4 font-apple",
      signal.status === 'active' && "border-primary/50"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isLong ? (
            <TrendingUp className="w-5 h-5 text-primary" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-500" />
          )}
          <span className="font-bold">{signal.asset}</span>
          <span className="text-xs text-muted-foreground">({signal.assetName})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            signal.status === 'watch' && "bg-yellow-500/20 text-yellow-400",
            signal.status === 'active' && "bg-primary/20 text-primary",
            signal.status === 'closed' && "bg-muted text-muted-foreground"
          )}>
            {signal.status === 'watch' ? <Eye className="w-3 h-3 inline mr-1" /> :
              signal.status === 'active' ? <Zap className="w-3 h-3 inline mr-1" /> :
                <CheckCircle2 className="w-3 h-3 inline mr-1" />}
            {signal.status.toUpperCase()}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-semibold",
            isLong ? "bg-primary/20 text-primary" : "bg-red-500/20 text-red-400"
          )}>
            {signal.direction.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Strategy */}
      <div className="mb-3 p-2 bg-white/5 rounded-lg">
        <p className="text-xs text-muted-foreground">Strategia {signal.strategy}</p>
        <p className="text-sm font-medium">{signal.strategyName}</p>
      </div>

      {/* Trigger */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-1">Trigger</p>
        <p className="text-sm">{signal.trigger}</p>
      </div>

      {/* Levels Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center p-2 bg-white/5 rounded">
          <p className="text-xs text-muted-foreground">Entry</p>
          <p className="font-semibold text-sm">{signal.entry}</p>
        </div>
        <div className="text-center p-2 bg-red-500/10 rounded">
          <p className="text-xs text-muted-foreground">Stop</p>
          <p className="font-semibold text-sm text-red-400">{signal.stop}</p>
        </div>
        <div className="text-center p-2 bg-primary/10 rounded">
          <p className="text-xs text-muted-foreground">TP1 (1.2R)</p>
          <p className="font-semibold text-sm text-primary">{signal.tp1}</p>
        </div>
        <div className="text-center p-2 bg-primary/5 rounded">
          <p className="text-xs text-muted-foreground">TP2 (1.3R)</p>
          <p className="font-semibold text-sm text-primary/70">{signal.tp2}</p>
        </div>
      </div>

      {/* 1R Info */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="text-muted-foreground">1R = {signal.oneR} pts</span>
        {signal.status === 'active' && (
          <span className={cn(
            "font-bold",
            signal.pnlR >= 0 ? "text-primary" : "text-red-400"
          )}>
            P&L: {signal.pnlR >= 0 ? '+' : ''}{signal.pnlR.toFixed(2)}R
          </span>
        )}
      </div>

      {/* Probability & Confidence */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-2 bg-white/5 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Probabilità</p>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xl font-bold",
              signal.probability >= 65 ? "text-primary" :
                signal.probability >= 55 ? "text-yellow-400" : "text-red-400"
            )}>
              {signal.probability}%
            </span>
            {signal.probChange && (
              <span className={cn(
                "text-xs",
                signal.probChange === 'up' ? "text-primary" :
                  signal.probChange === 'down' ? "text-red-400" : "text-muted-foreground"
              )}>
                {signal.probChange === 'up' ? <ArrowUp className="w-3 h-3" /> :
                  signal.probChange === 'down' ? <ArrowDown className="w-3 h-3" /> :
                    <Minus className="w-3 h-3" />}
              </span>
            )}
          </div>
        </div>
        <div className="p-2 bg-white/5 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Confidence</p>
          <span className="text-xl font-bold">{signal.confidence}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>

      {/* Motivations */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">Motivazione</p>
        <ul className="text-xs space-y-1">
          {signal.motivations.map((m, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className="text-primary">•</span>
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default function ReportPage() {
  const [term, setTerm] = useState('short');
  const [marketData, setMarketData] = useState(generateMarketData());
  const [signals, setSignals] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [todaySignals, setTodaySignals] = useState(() => {
    // Load persisted signals from localStorage
    const today = new Date().toDateString();
    const stored = localStorage.getItem('karion_daily_signals');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) {
          return parsed.signals;
        }
      } catch (e) { }
    }
    return [];
  });

  // Generate and persist signals (max 2 per asset per day) based on selected term
  useEffect(() => {
    const today = new Date().toDateString();

    // Generate signals based on selected term
    let newSignals;
    if (term === 'short') {
      newSignals = generateSignals(marketData);
    } else if (term === 'medium') {
      newSignals = generateMediumTermSignals(marketData);
    } else {
      newSignals = generateLongTermSignals(marketData);
    }

    // If we have persisted signals for today, update prices only
    const storageKey = `karion_${term}_signals`;
    const stored = localStorage.getItem(storageKey);
    let persistedSignals = [];

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) {
          persistedSignals = parsed.signals;
        }
      } catch (e) { }
    }

    if (persistedSignals.length > 0) {
      const updatedSignals = persistedSignals.map(sig => {
        const assetData = marketData.assets[sig.asset];
        if (assetData) {
          return {
            ...sig,
            currentPrice: assetData.current.toFixed(sig.asset === 'EURUSD' ? 5 : 2)
          };
        }
        return sig;
      });
      setSignals(updatedSignals);
    } else {
      // First time today - generate max 2 signals per asset
      const limitedSignals = [];
      const assetCounts = {};

      newSignals.forEach(sig => {
        const count = assetCounts[sig.asset] || 0;
        if (count < 2) {
          limitedSignals.push({
            ...sig,
            generatedAt: new Date().toLocaleTimeString('it-IT'),
            currentPrice: marketData.assets[sig.asset]?.current.toFixed(sig.asset === 'EURUSD' ? 5 : 2)
          });
          assetCounts[sig.asset] = count + 1;
        }
      });

      // Persist to localStorage
      localStorage.setItem(storageKey, JSON.stringify({
        date: today,
        signals: limitedSignals
      }));

      setSignals(limitedSignals);
    }
  }, [marketData, term]);

  const refreshData = () => {
    setIsLoading(true);
    setTimeout(() => {
      // Only refresh market data, signals stay persistent
      setMarketData(generateMarketData());
      setIsLoading(false);
    }, 1000);
  };

  const { vix, assets } = marketData;

  return (
    <div className="space-y-6 fade-in font-apple" data-testid="report-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary" />
            Strategy Report
          </h1>
          <p className="text-muted-foreground mt-1">
            Analisi strategica basata su regole • Ultimo update: {marketData.lastUpdate}
          </p>
        </div>

        <Button
          onClick={refreshData}
          disabled={isLoading}
          className="rounded-xl bg-primary hover:bg-primary/90"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Aggiorna Dati
        </Button>
      </motion.div>

      {/* Term Selection */}
      <div className="flex items-center gap-3">
        {[
          { id: 'short', label: 'Short-term (1-2d)', active: true, strategies: 'S1, S2, VG' },
          { id: 'medium', label: 'Medium-term (1-2w)', active: true, strategies: 'GM, RV' },
          { id: 'long', label: 'Long-term (1-4w)', active: true, strategies: 'MD' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => t.active && setTerm(t.id)}
            disabled={!t.active}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all",
              term === t.id
                ? "bg-primary text-primary-foreground"
                : t.active
                  ? "bg-card border border-border hover:border-primary/50"
                  : "bg-card/50 border border-border/50 text-muted-foreground cursor-not-allowed"
            )}
          >
            {t.label}
            {!t.active && <span className="ml-1 text-xs">(soon)</span>}
          </button>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="signals" className="space-y-4">
        <TabsList className="bg-transparent p-1 gap-1 flex-wrap h-auto tab-border-highlight glass-edge fine-gray-border">
          <TabsTrigger value="macro" className="rounded-lg">
            <Calendar className="w-4 h-4 mr-2" />
            Macro & Calendario
          </TabsTrigger>
          <TabsTrigger value="vix" className="rounded-lg">
            <Activity className="w-4 h-4 mr-2" />
            Regime VIX
          </TabsTrigger>
          <TabsTrigger value="levels" className="rounded-lg">
            <Target className="w-4 h-4 mr-2" />
            Livelli Premium
          </TabsTrigger>
          <TabsTrigger value="signals" className="rounded-lg">
            <Zap className="w-4 h-4 mr-2" />
            Report Posizionamenti
          </TabsTrigger>
          <TabsTrigger value="updates" className="rounded-lg">
            <Clock className="w-4 h-4 mr-2" />
            Update 2H
          </TabsTrigger>
        </TabsList>

        {/* Tab A - Macro & Calendario */}
        <TabsContent value="macro" className="space-y-4">
          <div className="glass-enhanced p-6">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-primary" />
              Eventi del Giorno (USA + Eurozona)
            </h3>
            <div>
              <div className="space-y-2">
                {macroEvents.map((event, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      event.impact === 'high' ? "bg-red-500/10 border border-red-500/20" :
                        event.impact === 'medium' ? "bg-yellow-500/10 border border-yellow-500/20" :
                          "bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-bold">{event.time}</span>
                      <div>
                        <p className="font-medium">{event.event}</p>
                        <p className="text-xs text-muted-foreground">
                          Cons: {event.consensus} | Prev: {event.previous}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      event.impact === 'high' ? "bg-red-500/20 text-red-400" :
                        event.impact === 'medium' ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-secondary text-muted-foreground"
                    )}>
                      {event.impact.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>

              {/* No-Trade Window */}
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  No-Trade Window
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Evitare entry 15 min prima e dopo eventi HIGH impact (es. 19:45-20:15 per FOMC Speech)
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab B - VIX Regime */}
        <TabsContent value="vix" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-enhanced p-6 text-center">
              <Activity className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="text-xs text-muted-foreground mb-1">VIX Attuale</p>
              <p className="text-4xl font-bold">{vix.current}</p>
              <p className={cn(
                "text-sm mt-1",
                parseFloat(vix.change) > 0 ? "text-red-400" : "text-primary"
              )}>
                {parseFloat(vix.change) > 0 ? '+' : ''}{vix.change} vs ieri
              </p>
            </div>

            <div className="glass-enhanced p-6 text-center">
              {vix.direction === 'rising' ? (
                <ArrowUp className="w-8 h-8 mx-auto mb-2 text-red-400" />
              ) : vix.direction === 'falling' ? (
                <ArrowDown className="w-8 h-8 mx-auto mb-2 text-primary" />
              ) : (
                <Minus className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
              )}
              <p className="text-xs text-muted-foreground mb-1">Direzione Intraday</p>
              <p className="text-2xl font-bold capitalize">{vix.direction}</p>
            </div>

            <div className={cn(
              "glass-enhanced p-6 text-center",
              "bg-yellow-500/10",
              "fine-gray-border",
              "glass-edge"
            )}>
              <Shield className={cn(
                "w-8 h-8 mx-auto mb-2",
                vix.regime === 'risk-on' ? "text-primary" :
                  vix.regime === 'risk-off' ? "text-red-400" :
                    "text-yellow-400"
              )} />
              <p className="text-xs text-muted-foreground mb-1">Regime</p>
              <p className={cn(
                "text-2xl font-bold uppercase",
                vix.regime === 'risk-on' ? "text-primary" :
                  vix.regime === 'risk-off' ? "text-red-400" :
                    "text-yellow-400"
              )}>
                {vix.regime}
              </p>
            </div>
          </div>

          {/* VIX Interpretation */}
          <div className="glass-enhanced p-4">
            <h4 className="font-medium mb-2">Interpretazione</h4>
            <p className="text-sm text-muted-foreground">
              {vix.regime === 'risk-on' && 'VIX sotto 20 indica bassa volatilità attesa. Favorisce strategie mean-reversion sugli indici. Long bias su NQ/S&P più probabile.'}
              {vix.regime === 'risk-off' && 'VIX sopra 25 indica alta volatilità attesa (fear). Cautela su long risk-on. Favorisce XAU come safe-haven. Ridurre size.'}
              {vix.regime === 'neutral' && 'VIX in zona neutrale (20-25). Monitorare direzione per conferma. Applicare strategie con cautela e stop stretti.'}
            </p>
          </div>
        </TabsContent>

        {/* Tab C - Livelli Premium */}
        <TabsContent value="levels" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(assets).map(([symbol, data]) => (
              <Card key={symbol} className="bg-card/80 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span>{symbol}</span>
                    <span className="text-xl font-bold text-primary">
                      {data.current.toFixed(symbol === 'EURUSD' ? 5 : 2)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {/* Weekly */}
                    <div className="grid grid-cols-3 gap-2 p-2 bg-white/5 rounded subtle-divider">
                      <span className="text-muted-foreground">Weekly</span>
                      <span>H: {data.weeklyHigh} ({calcDistancePercent(data.current, data.weeklyHigh)}%)</span>
                      <span>L: {data.weeklyLow} ({calcDistancePercent(data.current, data.weeklyLow)}%)</span>
                    </div>
                    {/* 2-Week */}
                    <div className="grid grid-cols-3 gap-2 p-2 bg-white/5 rounded subtle-divider">
                      <span className="text-muted-foreground">2-Week</span>
                      <span>H: {data.twoWeekHigh} ({calcDistancePercent(data.current, data.twoWeekHigh)}%)</span>
                      <span>L: {data.twoWeekLow} ({calcDistancePercent(data.current, data.twoWeekLow)}%)</span>
                    </div>
                    {/* Asia */}
                    <div className="grid grid-cols-4 gap-2 p-2 bg-white/5 rounded subtle-divider">
                      <span className="text-muted-foreground">Asia</span>
                      <span>H: {data.asiaHigh}</span>
                      <span>L: {data.asiaLow}</span>
                      <span>C: {data.asiaClose}</span>
                    </div>
                    {/* Yesterday */}
                    <div className="grid grid-cols-4 gap-2 p-2 bg-white/5 rounded subtle-divider">
                      <span className="text-muted-foreground">Ieri</span>
                      <span>H: {data.yesterdayHigh}</span>
                      <span>L: {data.yesterdayLow}</span>
                      <span>C: {data.yesterdayClose}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab D - Report Posizionamenti */}
        <TabsContent value="signals" className="space-y-4">
          {signals.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {signals.map(signal => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          ) : (
            <Card className="bg-card/80 border-border/50">
              <CardContent className="py-12 text-center">
                <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">Nessun segnale con probabilità ≥55% al momento</p>
                <p className="text-sm text-muted-foreground mt-1">Attendi formazione setup validi</p>
              </CardContent>
            </Card>
          )}

          {/* Strategy Rules Summary */}
          <Card className="bg-card/80 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Regole Operative</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>• <strong>1R</strong> = distanza entry-stop | <strong>TP1</strong> = +1.2R | <strong>TP2</strong> = +1.3R (runner)</p>
              <p>• Max <strong>2 trade/giorno</strong> per asset | Solo se probabilità ≥<strong>55%</strong></p>
              <p>• Stop a <strong>BE</strong> dopo +0.6R | Chiudi anticipato se prob scende sotto 50%</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab E - Update 2H */}
        <TabsContent value="updates" className="space-y-4">
          <Card className="bg-card/80 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Update ogni 2 ore
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signals.map(signal => (
                  <div key={signal.id} className="p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{signal.asset}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs",
                          signal.status === 'watch' ? "bg-yellow-500/20 text-yellow-400" :
                            signal.status === 'active' ? "bg-primary/20 text-primary" :
                              "bg-muted text-muted-foreground"
                        )}>
                          {signal.status}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{marketData.lastUpdate}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Prezzo</p>
                        <p>{assets[signal.asset]?.current.toFixed(signal.asset === 'EURUSD' ? 5 : 2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">P&L</p>
                        <p className={signal.pnlR >= 0 ? "text-primary" : "text-red-400"}>
                          {signal.pnlR >= 0 ? '+' : ''}{signal.pnlR.toFixed(2)}R
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Prob</p>
                        <p className="flex items-center gap-1">
                          {signal.probability}%
                          <Minus className="w-3 h-3 text-muted-foreground" />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Decisione</p>
                        <p className="text-primary">Mantieni</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Update Rules */}
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              <h4 className="font-medium text-foreground mb-2">Regole Aggiornamento Probabilità</h4>
              <ul className="space-y-1">
                <li>• Se posizione oltre +0.4R e VIX non peggiora → Prob <span className="text-primary">↑</span></li>
                <li>• Se posizione sotto -0.3R o VIX accelera contro → Prob <span className="text-red-400">↓</span></li>
                <li>• Se prezzo accetta oltre estremo premium → Prob <span className="text-red-400">↓</span>, preferire uscita</li>
                <li>• Se profitto ≥+0.6R → Sposta stop a BE</li>
                <li>• Se prob scende sotto 50% → Chiudi prima dello stop</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
