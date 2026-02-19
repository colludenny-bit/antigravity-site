import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import {
  Target, Plus, Zap, TrendingUp, TrendingDown,
  Percent, Shield, AlertTriangle, ArrowRight, Download,
  Play, BarChart3, Activity, Layers, Settings2, DollarSign,
  ChevronDown, ChevronUp, Trophy, Pause, Ban,
  CheckCircle, Minus, ArrowUp, ArrowDown, BookOpen, Upload, Loader2, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

import { detailedStrategies } from '../../data/strategies';
import api from '../../services/api';

const dataQualityMetrics = {
  completeness: 94,
  validity: 98,
  consistency: 91,
  timeliness: 100
};

const portfolioMetrics = {
  totalTrades: detailedStrategies.reduce((acc, s) => acc + (s.trades || 0), 0),
  overallWinRate: (detailedStrategies.reduce((acc, s) => acc + (s.winRate || 0) * (s.trades || 0), 0) / detailedStrategies.reduce((acc, s) => acc + (s.trades || 0), 1)).toFixed(1),
  avgExpectancy: (detailedStrategies.reduce((acc, s) => acc + (s.expectancyR || 0) * (s.trades || 0), 0) / detailedStrategies.reduce((acc, s) => acc + (s.trades || 0), 1)).toFixed(2),
  avgProfitFactor: (detailedStrategies.reduce((acc, s) => acc + (s.profitFactor || 0) * (s.trades || 0), 0) / detailedStrategies.reduce((acc, s) => acc + (s.trades || 0), 1)).toFixed(2),
  portfolioDrawdown: Math.max(...detailedStrategies.map(s => s.maxDrawdown || 0)),
  sharpeRatio: 1.85,
  netPnl: detailedStrategies.reduce((acc, s) => acc + (s.netPnl || 0), 0)
};

const getDefaultTradeDateTime = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const formatTradeDate = (rawValue) => {
  if (!rawValue) return '-';
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? rawValue : parsed.toLocaleString('it-IT');
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toNullableNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatFixed = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/D';
  return Number(value).toFixed(digits);
};

const formatSignedFixed = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/D';
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
};

const inferTradeSide = (trade) => {
  const normalized = (trade?.side || '').toLowerCase();
  if (normalized === 'long' || normalized === 'buy') return 'long';
  if (normalized === 'short' || normalized === 'sell') return 'short';

  const entry = toNumber(trade?.entry_price);
  const exit = toNumber(trade?.exit_price);
  const pnl = toNumber(trade?.profit_loss);

  if (entry === exit) return 'unknown';
  const movedUp = exit > entry;

  if (pnl > 0) return movedUp ? 'long' : 'short';
  if (pnl < 0) return movedUp ? 'short' : 'long';
  return movedUp ? 'long' : 'short';
};

const StrategyCard = ({ strategy, onExportToMonteCarlo }) => {
  const navigate = useNavigate();

  const handleExport = () => {
    const monteCarloParams = {
      name: strategy.name,
      winRate: strategy.winRate,
      avgWin: strategy.avgWinR,
      avgLoss: strategy.avgLossR
    };
    localStorage.setItem('monteCarloStrategy', JSON.stringify(monteCarloParams));
    toast.success(`${strategy.name} esportata! Vai a Monte Carlo per simulare.`);
    navigate('/montecarlo');
  };

  return (
    <div className="glass-enhanced p-0 font-apple">
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
              {strategy.shortName}
            </span>
            <div>
              <h3 className="font-bold">{strategy.name}</h3>
              <p className="text-xs text-muted-foreground">
                Asset: {strategy.assets.join(', ')}
              </p>
            </div>
          </div>
          {strategy.isModulator && (
            <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs">
              MODULATORE
            </span>
          )}
        </div>
      </div>
      <div className="p-4 pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">{strategy.description}</p>

        {!strategy.isModulator && (
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 bg-white/5 rounded-lg text-center">
              <Percent className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold text-primary">{strategy.winRate}%</p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg text-center">
              <TrendingUp className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Avg Win</p>
              <p className="text-xl font-bold">{strategy.avgWinR}R</p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg text-center">
              <TrendingDown className="w-4 h-4 mx-auto mb-1 text-red-400" />
              <p className="text-xs text-muted-foreground">Avg Loss</p>
              <p className="text-xl font-bold">{strategy.avgLossR}R</p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg text-center">
              <Shield className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
              <p className="text-xs text-muted-foreground">Max DD</p>
              <p className="text-xl font-bold">{strategy.maxDD}%</p>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Regole
          </h4>
          <ul className="space-y-1">
            {strategy.rules.map((rule, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Trigger
          </h4>
          <div className="flex flex-wrap gap-1">
            {strategy.triggers.map((trigger, i) => (
              <span key={i} className="px-2 py-1 bg-white/5 rounded text-xs">
                {trigger}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Fattori Probabilità
          </h4>
          <ul className="space-y-1">
            {strategy.probabilityFactors.map((factor, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span className="text-purple-400 mt-0.5">→</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>

        {!strategy.isModulator && (
          <Button
            onClick={handleExport}
            className="w-full rounded-xl bg-primary hover:bg-primary/90"
          >
            <Play className="w-4 h-4 mr-2" />
            Esporta in Monte Carlo
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div >
  );
};

const StrategyDetailTab = ({ strategy }) => {
  const [segmentMode, setSegmentMode] = useState('guided');

  if (!strategy) return null;

  const segmentationFilters = [
    { label: 'Setup Quality', values: ['A+', 'A', 'B', 'C'], active: 'A+' },
    { label: 'Session', values: ['London', 'New York', 'Asia', 'Overlap'], active: 'New York' },
    { label: 'Planned vs Unplanned', values: ['Planned', 'Unplanned'], active: 'Planned' },
    { label: 'Market Regime', values: ['Trending', 'Ranging', 'Volatile'], active: 'Trending' },
    { label: 'Direction', values: ['Long', 'Short'], active: 'Long' },
  ];

  return (
    <div className="space-y-6">
      <div className="glass-enhanced p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">DNA Strategia</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${strategy.status === 'LIVE' ? 'text-emerald-400' :
              strategy.status === 'WATCH' ? 'text-yellow-400' : 'text-gray-400'
              }`}>
              ● {strategy.status}
            </span>
            <span className="text-sm text-muted-foreground">| {strategy.trades} trades | Confidence: {strategy.confidence}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="glass-tab p-4 text-center">
            <span className="text-sm text-muted-foreground block mb-1">Win Rate</span>
            <span className="stat-number text-emerald-400">{strategy.winRate}%</span>
          </div>
          <div className="glass-tab p-4 text-center">
            <span className="text-sm text-muted-foreground block mb-1">Expectancy (R)</span>
            <span className="stat-number">{strategy.expectancyR}</span>
          </div>
          <div className="glass-tab p-4 text-center">
            <span className="text-sm text-muted-foreground block mb-1">Profit Factor</span>
            <span className="stat-number">{strategy.profitFactor}</span>
          </div>
          <div className="glass-tab p-4 text-center">
            <span className="text-sm text-muted-foreground block mb-1">Max Drawdown</span>
            <span className="stat-number text-red-400">{strategy.maxDrawdown}%</span>
          </div>
          <div className="glass-tab p-4 text-center">
            <span className="text-sm text-muted-foreground block mb-1">Net P&L</span>
            <span className="stat-number text-emerald-400">${strategy.netPnl.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Segmentazione:</span>
        <div className="flex gap-2">
          <button
            onClick={() => setSegmentMode('guided')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${segmentMode === 'guided'
              ? 'bg-primary text-white'
              : 'bg-white/5 text-muted-foreground hover:bg-secondary'
              }`}
          >
            Guidata
          </button>
          <button
            onClick={() => setSegmentMode('discovery')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${segmentMode === 'discovery'
              ? 'bg-primary text-white'
              : 'bg-white/5 text-muted-foreground hover:bg-secondary'
              }`}
          >
            Discovery
          </button>
        </div>
      </div>

      {segmentMode === 'guided' && (
        <div className="glass-enhanced p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Segmentazione Guidata
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {segmentationFilters.map((filter) => (
              <div key={filter.label} className="glass-tab p-4">
                <span className="text-sm text-muted-foreground block mb-2">{filter.label}</span>
                <div className="flex flex-wrap gap-1">
                  {filter.values.map((value) => (
                    <button
                      key={value}
                      className={`px-2 py-1 rounded text-xs font-medium transition-all ${filter.active === value
                        ? 'bg-primary text-white'
                        : 'bg-white/5 text-muted-foreground hover:bg-secondary'
                        }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-enhanced p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h3 className="font-semibold">3 Priorità di Ottimizzazione</h3>
        </div>

        <div className="space-y-3">
          <div className="glass-tab p-4 border-l-4 border-emerald-500 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">1</span>
              <div>
                <p className="font-medium">Aumenta size su setup A+</p>
                <p className="text-sm text-muted-foreground">+23% win rate su A+ vs media</p>
              </div>
            </div>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">ALTO IMPATTO</span>
          </div>

          <div className="glass-tab p-4 border-l-4 border-yellow-500 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold">2</span>
              <div>
                <p className="font-medium">Evita ingressi sessione Asiatica</p>
                <p className="text-sm text-muted-foreground">-15% win rate durante Asia</p>
              </div>
            </div>
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">MEDIO IMPATTO</span>
          </div>

          <div className="glass-tab p-4 border-l-4 border-blue-500 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">3</span>
              <div>
                <p className="font-medium">Revisione short in trend forte</p>
                <p className="text-sm text-muted-foreground">Short contro-trend sottoperformano</p>
              </div>
            </div>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">REVISIONE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function StrategyPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('strategies');
  // Performance sub-state
  const [performanceTab, setPerformanceTab] = useState('portfolio');
  const [expandedStrategy, setExpandedStrategy] = useState(null);

  const [newStrategy, setNewStrategy] = useState({
    name: '',
    assets: '',
    description: '',
    winRate: 55,
    avgWinR: 1.2,
    avgLossR: 1.0,
    maxDD: 10,
    rules: '',
    triggers: ''
  });

  const handleSaveStrategy = () => {
    if (!newStrategy.name || !newStrategy.description) {
      toast.error('Compila nome e descrizione');
      return;
    }

    const savedStrategies = JSON.parse(localStorage.getItem('customStrategies') || '[]');
    savedStrategies.push({
      ...newStrategy,
      id: `custom-${Date.now()}`,
      shortName: `C${savedStrategies.length + 1}`,
      rules: newStrategy.rules.split('\n').filter(r => r.trim()),
      triggers: newStrategy.triggers.split('\n').filter(t => t.trim()),
      assets: newStrategy.assets.split(',').map(a => a.trim()),
      riskReward: (newStrategy.winRate / 100 * newStrategy.avgWinR) / ((1 - newStrategy.winRate / 100) * newStrategy.avgLossR)
    });
    localStorage.setItem('customStrategies', JSON.stringify(savedStrategies));

    toast.success('Strategia salvata!');
    setNewStrategy({
      name: '',
      assets: '',
      description: '',
      winRate: 55,
      avgWinR: 1.2,
      avgLossR: 1.0,
      maxDD: 10,
      rules: '',
      triggers: ''
    });
    setActiveTab('strategies');
  };

  const handleExportAndRun = (strategy) => {
    const monteCarloParams = {
      name: strategy.name,
      winRate: strategy.winRate,
      avgWin: strategy.avgWinR,
      avgLoss: strategy.avgLossR
    };
    localStorage.setItem('monteCarloStrategy', JSON.stringify(monteCarloParams));
    navigate('/montecarlo');
  };

  const customStrategies = JSON.parse(localStorage.getItem('customStrategies') || '[]');
  const allStrategies = [...detailedStrategies, ...customStrategies.map(s => ({
    ...s,
    probabilityFactors: ['Definiti dall\'utente']
  }))];
  const selectableStrategies = allStrategies.filter((s) => !s.isModulator).map((s) => s.name);
  const fileInputRef = useRef(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [selectedJournalStrategy, setSelectedJournalStrategy] = useState('');
  const [journalStatsTab, setJournalStatsTab] = useState('summary');
  const [tradeRows, setTradeRows] = useState([]);
  const [pdfReportSummary, setPdfReportSummary] = useState(null);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedTradeIds, setSelectedTradeIds] = useState([]);
  const [isTradesLoading, setIsTradesLoading] = useState(false);
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [isPdfImporting, setIsPdfImporting] = useState(false);
  const [isDeletingTrades, setIsDeletingTrades] = useState(false);
  const [manualTrade, setManualTrade] = useState({
    symbol: '',
    side: 'long',
    entry_price: '',
    exit_price: '',
    profit_loss: '',
    profit_loss_r: '',
    date: getDefaultTradeDateTime(),
    notes: ''
  });

  useEffect(() => {
    if (!selectedJournalStrategy && selectableStrategies.length > 0) {
      setSelectedJournalStrategy(selectableStrategies[0]);
    }
  }, [selectableStrategies, selectedJournalStrategy]);

  const filteredTradeRows = useMemo(() => {
    if (!selectedJournalStrategy) return tradeRows;
    return tradeRows.filter((trade) => (trade.strategy_name || '') === selectedJournalStrategy);
  }, [tradeRows, selectedJournalStrategy]);

  const journalAnalytics = useMemo(() => {
    const rows = [...filteredTradeRows];
    const totalTrades = rows.length;
    const wins = rows.filter((trade) => toNumber(trade.profit_loss) > 0).length;
    const losses = rows.filter((trade) => toNumber(trade.profit_loss) < 0).length;
    const grossProfit = rows.reduce((acc, trade) => {
      const pnl = toNumber(trade.profit_loss);
      return pnl > 0 ? acc + pnl : acc;
    }, 0);
    const grossLoss = rows.reduce((acc, trade) => {
      const pnl = toNumber(trade.profit_loss);
      return pnl < 0 ? acc + pnl : acc;
    }, 0);
    const netPnl = grossProfit + grossLoss;
    const avgTrade = totalTrades > 0 ? netPnl / totalTrades : 0;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const avgR = totalTrades > 0
      ? rows.reduce((acc, trade) => acc + toNumber(trade.profit_loss_r), 0) / totalTrades
      : 0;
    const grossLossAbs = Math.abs(grossLoss);
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : (grossProfit > 0 ? Infinity : 0);
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const sortedRows = [...rows].sort((a, b) => {
      const aTs = new Date(a.date || 0).getTime();
      const bTs = new Date(b.date || 0).getTime();
      return aTs - bTs;
    });

    let runningPnl = 0;
    let peakPnl = 0;
    let maxDrawdown = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentProfitRun = 0;
    let currentLossRun = 0;
    let maxConsecutiveProfit = 0;
    let maxConsecutiveLoss = 0;

    sortedRows.forEach((trade) => {
      const pnl = toNumber(trade.profit_loss);
      runningPnl += pnl;
      peakPnl = Math.max(peakPnl, runningPnl);
      maxDrawdown = Math.min(maxDrawdown, runningPnl - peakPnl);

      if (pnl > 0) {
        currentWinStreak += 1;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        currentProfitRun += pnl;
        maxConsecutiveProfit = Math.max(maxConsecutiveProfit, currentProfitRun);
        currentLossRun = 0;
      } else if (pnl < 0) {
        currentLossStreak += 1;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        currentLossRun += pnl;
        maxConsecutiveLoss = Math.min(maxConsecutiveLoss, currentLossRun);
        currentProfitRun = 0;
      } else {
        currentWinStreak = 0;
        currentLossStreak = 0;
      }
    });

    const sideStats = {
      long: { count: 0, wins: 0, netPnl: 0 },
      short: { count: 0, wins: 0, netPnl: 0 },
      unknown: { count: 0, wins: 0, netPnl: 0 }
    };
    const symbolsMap = new Map();

    rows.forEach((trade) => {
      const pnl = toNumber(trade.profit_loss);
      const side = inferTradeSide(trade);
      const safeSide = sideStats[side] ? side : 'unknown';
      sideStats[safeSide].count += 1;
      if (pnl > 0) sideStats[safeSide].wins += 1;
      sideStats[safeSide].netPnl += pnl;

      const symbol = (trade.symbol || 'N/A').toUpperCase().trim() || 'N/A';
      if (!symbolsMap.has(symbol)) {
        symbolsMap.set(symbol, { symbol, count: 0, wins: 0, losses: 0, netPnl: 0 });
      }
      const symbolItem = symbolsMap.get(symbol);
      symbolItem.count += 1;
      symbolItem.netPnl += pnl;
      if (pnl > 0) symbolItem.wins += 1;
      if (pnl < 0) symbolItem.losses += 1;
    });

    const symbols = Array.from(symbolsMap.values())
      .map((item) => ({
        ...item,
        winRate: item.count > 0 ? (item.wins / item.count) * 100 : 0
      }))
      .sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl));

    const bestTrade = rows.reduce((best, trade) => {
      const pnl = toNumber(trade.profit_loss);
      return pnl > best ? pnl : best;
    }, Number.NEGATIVE_INFINITY);
    const worstTrade = rows.reduce((worst, trade) => {
      const pnl = toNumber(trade.profit_loss);
      return pnl < worst ? pnl : worst;
    }, Number.POSITIVE_INFINITY);

    const withRates = (sideData) => ({
      ...sideData,
      winRate: sideData.count > 0 ? (sideData.wins / sideData.count) * 100 : 0
    });

    return {
      summary: {
        totalTrades,
        wins,
        losses,
        winRate,
        avgR,
        profitFactor,
        maxDrawdown: Math.abs(maxDrawdown),
      },
      profitLoss: {
        grossProfit,
        grossLoss,
        netPnl,
        avgTrade,
        avgWin,
        avgLoss
      },
      longShort: {
        long: withRates(sideStats.long),
        short: withRates(sideStats.short),
        unknown: withRates(sideStats.unknown),
      },
      symbols,
      risks: {
        bestTrade: Number.isFinite(bestTrade) ? bestTrade : 0,
        worstTrade: Number.isFinite(worstTrade) ? worstTrade : 0,
        maxWinStreak,
        maxLossStreak,
        maxConsecutiveProfit,
        maxConsecutiveLoss,
      }
    };
  }, [filteredTradeRows]);

  const strategyStats = useMemo(() => ({
    total: journalAnalytics.summary.totalTrades,
    wins: journalAnalytics.summary.wins,
    losses: journalAnalytics.summary.losses,
    winRate: journalAnalytics.summary.winRate,
    totalPnl: journalAnalytics.profitLoss.netPnl,
    avgR: journalAnalytics.summary.avgR
  }), [journalAnalytics]);
  const pdfDerived = useMemo(() => (pdfReportSummary?.derived || {}), [pdfReportSummary]);
  const usePdfForStats = filteredTradeRows.length === 0 && Boolean(pdfReportSummary);

  const resolvedSummary = useMemo(() => {
    if (!usePdfForStats) {
      return {
        totalTrades: strategyStats.total,
        winRate: strategyStats.winRate,
        profitFactor: journalAnalytics.summary.profitFactor,
        netPnl: strategyStats.totalPnl,
        avgR: strategyStats.avgR,
        maxDrawdown: journalAnalytics.summary.maxDrawdown,
      };
    }

    return {
      totalTrades: toNullableNumber(pdfDerived?.long_short?.total_trades),
      winRate: toNullableNumber(pdfDerived?.long_short?.win_rate_pct),
      profitFactor: toNullableNumber(pdfDerived?.summary?.profit_factor),
      netPnl: toNullableNumber(pdfDerived?.profit_loss?.net_pnl ?? pdfDerived?.long_short?.net_pnl),
      avgR: toNullableNumber(pdfDerived?.summary?.avg_r),
      maxDrawdown: toNullableNumber(pdfDerived?.summary?.drawdown_pct ?? pdfDerived?.risks?.drawdown_pct),
    };
  }, [usePdfForStats, strategyStats, journalAnalytics, pdfDerived]);

  const resolvedProfitLoss = useMemo(() => {
    if (!usePdfForStats) {
      return {
        grossProfit: journalAnalytics.profitLoss.grossProfit,
        grossLoss: journalAnalytics.profitLoss.grossLoss,
        netPnl: journalAnalytics.profitLoss.netPnl,
        avgTrade: journalAnalytics.profitLoss.avgTrade,
        avgWin: journalAnalytics.profitLoss.avgWin,
        avgLoss: journalAnalytics.profitLoss.avgLoss
      };
    }

    const grossProfit = toNullableNumber(pdfDerived?.profit_loss?.gross_profit);
    const grossLoss = toNullableNumber(pdfDerived?.profit_loss?.gross_loss);
    const netPnl = toNullableNumber(pdfDerived?.profit_loss?.net_pnl);
    const totalTrades = toNullableNumber(pdfDerived?.long_short?.total_trades);
    const avgTrade = (netPnl !== null && totalTrades && totalTrades > 0) ? netPnl / totalTrades : null;
    const winRatePct = toNullableNumber(pdfDerived?.long_short?.win_rate_pct);
    const estimatedWins = (totalTrades && winRatePct !== null) ? Math.round((totalTrades * winRatePct) / 100) : null;
    const estimatedLosses = (totalTrades && estimatedWins !== null) ? Math.max(totalTrades - estimatedWins, 0) : null;
    const avgWin = (grossProfit !== null && estimatedWins && estimatedWins > 0) ? grossProfit / estimatedWins : null;
    const avgLoss = (grossLoss !== null && estimatedLosses && estimatedLosses > 0) ? grossLoss / estimatedLosses : null;

    return {
      grossProfit,
      grossLoss,
      netPnl,
      avgTrade,
      avgWin,
      avgLoss
    };
  }, [usePdfForStats, journalAnalytics, pdfDerived]);

  const resolvedLongShort = useMemo(() => {
    if (!usePdfForStats) {
      return journalAnalytics.longShort;
    }

    const longCount = toNullableNumber(pdfDerived?.long_short?.long_count);
    const shortCount = toNullableNumber(pdfDerived?.long_short?.short_count);
    const totalTrades = toNullableNumber(pdfDerived?.long_short?.total_trades);
    const winRate = toNullableNumber(pdfDerived?.long_short?.win_rate_pct);
    const netPnl = toNullableNumber(pdfDerived?.long_short?.net_pnl ?? pdfDerived?.profit_loss?.net_pnl);
    const longPct = toNullableNumber(pdfDerived?.long_short?.long_pct);
    const shortPct = toNullableNumber(pdfDerived?.long_short?.short_pct);
    const longNet = (netPnl !== null && longPct !== null) ? (netPnl * longPct) / 100 : null;
    const shortNet = (netPnl !== null && shortPct !== null) ? (netPnl * shortPct) / 100 : null;

    const makeSide = (count, pct, sideNetPnl) => ({
      count: count ?? 0,
      wins: (count && winRate !== null) ? Math.round((count * winRate) / 100) : 0,
      netPnl: sideNetPnl ?? 0,
      winRate: winRate ?? 0,
      pct
    });

    const unknownCount = totalTrades !== null
      ? Math.max(totalTrades - (longCount || 0) - (shortCount || 0), 0)
      : 0;

    return {
      long: makeSide(longCount, longPct, longNet),
      short: makeSide(shortCount, shortPct, shortNet),
      unknown: { count: unknownCount, wins: 0, netPnl: 0, winRate: 0, pct: null }
    };
  }, [usePdfForStats, journalAnalytics, pdfDerived]);

  const resolvedSymbols = useMemo(() => {
    if (!usePdfForStats) {
      return journalAnalytics.symbols;
    }

    const items = Array.isArray(pdfDerived?.symbols?.items) ? pdfDerived.symbols.items : [];
    const normalized = items
      .map((item) => ({
        symbol: item?.symbol || pdfDerived?.symbols?.primary_symbol || 'N/D',
        count: toNullableNumber(pdfDerived?.symbols?.manual_trades) ?? 0,
        wins: 0,
        losses: 0,
        netPnl: toNullableNumber(item?.net_pnl ?? pdfDerived?.symbols?.net_profit) ?? 0,
        winRate: toNullableNumber(pdfDerived?.long_short?.win_rate_pct) ?? 0,
        profitFactor: toNullableNumber(item?.profit_factor ?? pdfDerived?.symbols?.profit_factor)
      }))
      .filter((item) => item.symbol !== 'N/D');

    if (normalized.length > 0) return normalized;

    if (pdfDerived?.symbols?.primary_symbol) {
      return [{
        symbol: pdfDerived.symbols.primary_symbol,
        count: toNullableNumber(pdfDerived?.symbols?.manual_trades) ?? 0,
        wins: 0,
        losses: 0,
        netPnl: toNullableNumber(pdfDerived?.symbols?.net_profit) ?? 0,
        winRate: toNullableNumber(pdfDerived?.long_short?.win_rate_pct) ?? 0,
        profitFactor: toNullableNumber(pdfDerived?.symbols?.profit_factor)
      }];
    }

    return [];
  }, [usePdfForStats, journalAnalytics, pdfDerived]);

  const resolvedRisks = useMemo(() => {
    if (!usePdfForStats) {
      return journalAnalytics.risks;
    }
    return {
      bestTrade: toNullableNumber(pdfDerived?.risks?.best_trade),
      worstTrade: toNullableNumber(pdfDerived?.risks?.worst_trade),
      maxWinStreak: toNullableNumber(pdfDerived?.risks?.max_consecutive_wins),
      maxLossStreak: toNullableNumber(pdfDerived?.risks?.max_consecutive_losses),
      maxConsecutiveProfit: toNullableNumber(pdfDerived?.risks?.max_consecutive_profit),
      maxConsecutiveLoss: toNullableNumber(pdfDerived?.risks?.max_consecutive_loss),
    };
  }, [usePdfForStats, journalAnalytics, pdfDerived]);

  const loadTrades = useCallback(async (showError = true) => {
    setIsTradesLoading(true);
    try {
      const res = await api.get('/trades');
      setTradeRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      if (showError) {
        toast.error('Impossibile caricare il diario operazioni');
      }
    } finally {
      setIsTradesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'trade-journal') {
      loadTrades(false);
    }
  }, [activeTab, loadTrades]);

  useEffect(() => {
    const visibleIds = new Set(filteredTradeRows.map((trade) => trade.id));
    setSelectedTradeIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [filteredTradeRows]);

  const toggleTradeSelection = (tradeId) => {
    setSelectedTradeIds((prev) => (
      prev.includes(tradeId)
        ? prev.filter((id) => id !== tradeId)
        : [...prev, tradeId]
    ));
  };

  const toggleBulkMode = () => {
    setIsBulkMode((prev) => {
      if (prev) {
        setSelectedTradeIds([]);
      }
      return !prev;
    });
  };

  const handleDeleteSingleTrade = async (tradeId) => {
    setIsDeletingTrades(true);
    try {
      await api.delete(`/trades/${tradeId}`);
      setSelectedTradeIds((prev) => prev.filter((id) => id !== tradeId));
      toast.success('Operazione eliminata');
      await loadTrades(false);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Errore eliminazione operazione');
    } finally {
      setIsDeletingTrades(false);
    }
  };

  const handleDeleteSelectedTrades = async () => {
    if (selectedTradeIds.length === 0) return;

    setIsDeletingTrades(true);
    try {
      const res = await api.post('/trades/delete-bulk', { trade_ids: selectedTradeIds });
      toast.success(`Eliminate ${res.data?.deleted_count ?? selectedTradeIds.length} operazioni`);
      setSelectedTradeIds([]);
      await loadTrades(false);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Errore eliminazione bulk');
    } finally {
      setIsDeletingTrades(false);
    }
  };

  const handleManualTradeSave = async () => {
    if (!manualTrade.symbol || manualTrade.entry_price === '' || manualTrade.exit_price === '' || manualTrade.profit_loss === '') {
      toast.error('Compila simbolo, entry, exit e P&L');
      return;
    }

    const entryPrice = Number(manualTrade.entry_price);
    const exitPrice = Number(manualTrade.exit_price);
    const profitLoss = Number(manualTrade.profit_loss);
    const profitLossR = manualTrade.profit_loss_r === '' ? 0 : Number(manualTrade.profit_loss_r);

    if ([entryPrice, exitPrice, profitLoss, profitLossR].some((n) => Number.isNaN(n))) {
      toast.error('Valori numerici non validi');
      return;
    }

    setIsManualSaving(true);
    try {
      const strategyForSave = selectedJournalStrategy || null;
      const parsedDate = manualTrade.date ? new Date(manualTrade.date) : new Date();
      const normalizedDate = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
      await api.post('/trades', {
        symbol: manualTrade.symbol.toUpperCase().trim(),
        side: manualTrade.side || 'long',
        entry_price: entryPrice,
        exit_price: exitPrice,
        profit_loss: profitLoss,
        profit_loss_r: profitLossR,
        date: normalizedDate,
        notes: manualTrade.notes?.trim() || '',
        strategy_name: strategyForSave,
        source: 'manual'
      });

      toast.success('Operazione salvata nel diario');
      setManualTrade({
        symbol: '',
        side: 'long',
        entry_price: '',
        exit_price: '',
        profit_loss: '',
        profit_loss_r: '',
        date: getDefaultTradeDateTime(),
        notes: ''
      });
      setShowManualModal(false);
      await loadTrades(false);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Errore durante il salvataggio');
    } finally {
      setIsManualSaving(false);
    }
  };

  const handlePdfImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Carica un file PDF');
      return;
    }

    setIsPdfImporting(true);
    try {
      const strategyForSave = selectedJournalStrategy || null;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'summary');
      if (strategyForSave) {
        formData.append('strategy_name', strategyForSave);
      }

      const res = await api.post('/trades/import/pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPdfReportSummary(res.data || null);
      setJournalStatsTab('summary');
      toast.success('PDF analizzato. Statistiche template aggiornate.');
      setShowPdfModal(false);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Errore import PDF');
    } finally {
      setIsPdfImporting(false);
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'SCALE': return 'text-emerald-400 bg-emerald-500/20';
      case 'MAINTAIN': return 'text-blue-400 bg-blue-500/20';
      case 'REDUCE': return 'text-yellow-400 bg-yellow-500/20';
      case 'PAUSE': return 'text-orange-400 bg-orange-500/20';
      case 'BAN': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'SCALE': return <ArrowUp className="w-4 h-4" />;
      case 'MAINTAIN': return <Minus className="w-4 h-4" />;
      case 'REDUCE': return <ArrowDown className="w-4 h-4" />;
      case 'PAUSE': return <Pause className="w-4 h-4" />;
      case 'BAN': return <Ban className="w-4 h-4" />;
      default: return <Minus className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'LIVE': return 'text-emerald-400';
      case 'WATCH': return 'text-yellow-400';
      case 'OFF': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6 fade-in font-apple" data-testid="strategy-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Target className="w-8 h-8 text-primary" />
          Strategie di Trading
        </h1>
        <p className="text-muted-foreground mt-1">
          Libreria strategie, regole operative e analisi performance
        </p>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-transparent p-1 gap-1">
          <TabsTrigger value="strategies" className="rounded-lg">
            <Layers className="w-4 h-4 mr-2" />
            Libreria ({allStrategies.length})
          </TabsTrigger>
          <TabsTrigger value="performance" className="rounded-lg">
            <BarChart3 className="w-4 h-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="trade-journal" className="rounded-lg">
            <BookOpen className="w-4 h-4 mr-2" />
            Diario operazioni
          </TabsTrigger>
          <TabsTrigger value="new" className="rounded-lg">
            <Plus className="w-4 h-4 mr-2" />
            Nuova Strategia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="strategies" className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {allStrategies.map(s => (
              <button
                key={s.id}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  "bg-card border border-border hover:border-primary/50",
                  s.isModulator && "border-purple-500/30"
                )}
              >
                <span className="font-bold mr-2">{s.shortName}</span>
                {s.name}
                {s.winRate && (
                  <span className="ml-2 text-primary">{s.winRate}% WR</span>
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {allStrategies.map(strategy => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onExportToMonteCarlo={handleExportAndRun}
              />
            ))}
          </div>

          <div className="glass-enhanced p-4">
            <div className="pb-2">
              <h4 className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Regole di Gestione (Tutte le Strategie)
              </h4>
            </div>
            <div className="text-sm space-y-2 mt-2">
              <p>• <strong>1R</strong> = distanza entry-stop | <strong>TP1</strong> = +1.2R (obbligatorio) | <strong>TP2</strong> = +1.3R (runner)</p>
              <p>• Max <strong>2 operazioni/giorno</strong> per asset: Trade #1 + Re-entry solo se tesi valida</p>
              <p>• Apri trade solo se <strong>Probabilità ≥55%</strong></p>
              <p>• <strong>Stop a BE</strong> dopo +0.6R profitto</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance Header & Time Filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Analisi Quantitativa</h2>
            </div>

          </div>

          {/* Performance Sub-Tabs */}
          <div className="flex gap-2 border-b border-border pb-2 overflow-x-auto">
            <button
              onClick={() => setPerformanceTab('portfolio')}
              className={`tab-selector ${performanceTab === 'portfolio' ? 'tab-selector-active' : ''}`}
            >
              <Layers className="w-4 h-4 inline mr-2" />
              Portfolio
            </button>
            {detailedStrategies.filter(s => s.status === 'LIVE' && !s.isModulator && !s.name.includes('News') && !s.name.includes('VIX')).map((strategy) => (
              <button
                key={strategy.id}
                onClick={() => setPerformanceTab(strategy.id)}
                className={`tab-selector ${performanceTab === strategy.id ? 'tab-selector-active' : ''} flex items-center gap-2`}
              >
                <span className={`w-2 h-2 rounded-full ${getStatusColor(strategy.status)}`} />
                {strategy.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {performanceTab === 'portfolio' ? (
            <>
              {/* Data Quality */}
              <div className="glass-enhanced p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Qualità Dati</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(dataQualityMetrics).map(([key, value]) => (
                    <div key={key} className="glass-tab p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground capitalize">{key}</span>
                        {value >= 90 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <div className="stat-number text-foreground">{value}%</div>
                      <div className="h-1.5 bg-secondary rounded-full mt-2 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${value >= 90 ? 'bg-emerald-500' : 'bg-yellow-500'}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Core Metrics */}
              <div className="glass-enhanced p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Metriche Chiave</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Total Trades</span>
                    <span className="stat-number">{portfolioMetrics.totalTrades}</span>
                  </div>
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Win Rate</span>
                    <span className="stat-number text-emerald-400">{portfolioMetrics.overallWinRate}%</span>
                  </div>
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Expectancy (R)</span>
                    <span className="stat-number">{portfolioMetrics.avgExpectancy}</span>
                  </div>
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Profit Factor</span>
                    <span className="stat-number text-emerald-400">{portfolioMetrics.avgProfitFactor}</span>
                  </div>
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Max Drawdown</span>
                    <span className="stat-number text-red-400">{portfolioMetrics.portfolioDrawdown}%</span>
                  </div>
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Sharpe Ratio</span>
                    <span className="stat-number">{portfolioMetrics.sharpeRatio}</span>
                  </div>
                  <div className="glass-tab p-4 text-center">
                    <span className="text-sm text-muted-foreground block mb-1">Net P&L</span>
                    <span className="stat-number text-emerald-400">${portfolioMetrics.netPnl.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Leaderboard */}
              <div className="glass-enhanced p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <h3 className="font-semibold">Classifica Strategie</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">Ordinati per Risk-Adjusted Return</span>
                </div>
                <div className="space-y-3">
                  {detailedStrategies.filter(s => s.status === 'LIVE' && !s.isModulator && !s.name.includes('News') && !s.name.includes('VIX')).sort((a, b) => (b.expectancyR || 0) * (b.winRate || 0) - (a.expectancyR || 0) * (a.winRate || 0)).map((strategy, index) => (
                    <div key={strategy.id}
                      className="glass-tab p-4 cursor-pointer hover:border-primary/40 transition-all"
                      onClick={() => setExpandedStrategy(expandedStrategy === strategy.id ? null : strategy.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">#{index + 1}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{strategy.name}</h4>
                              <span className={`text-xs ${getStatusColor(strategy.status)}`}>● {strategy.status}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{strategy.type} • {strategy.trades} trades</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden md:block">
                            <span className="text-sm text-muted-foreground">Win Rate</span>
                            <p className="font-semibold text-emerald-400">{strategy.winRate}%</p>
                          </div>
                          <div className="text-right hidden lg:block">
                            <span className="text-sm text-muted-foreground">P.Factor</span>
                            <p className="font-semibold">{strategy.profitFactor}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-muted-foreground">Net P&L</span>
                            <p className={`font-semibold ${strategy.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${strategy.netPnl.toLocaleString()}</p>
                          </div>
                          <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${getActionColor(strategy.action)}`}>
                            {getActionIcon(strategy.action)}
                            <span className="font-medium text-sm">{strategy.action}</span>
                          </div>
                          {expandedStrategy === strategy.id ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      </div>
                      {expandedStrategy === strategy.id && (
                        <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-3 bg-white/5 rounded-lg">
                            <span className="text-xs text-muted-foreground block">Confidence</span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{strategy.confidence}%</span>
                              <div className="flex-1 h-1.5 bg-secondary rounded-full">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${strategy.confidence}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="p-3 bg-white/5 rounded-lg">
                            <span className="text-xs text-muted-foreground block">Max Drawdown</span>
                            <span className="font-semibold text-red-400">{strategy.maxDrawdown}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Optimization Moves */}
              <div className="glass-enhanced p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-semibold">Ottimizzazione</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="glass-tab p-4 border-l-4 border-emerald-500">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      Edge
                    </h4>
                    <p className="text-sm text-muted-foreground">Aumenta size GammaMagnet del 15% in regimi di alta volatilità.</p>
                  </div>
                  <div className="glass-tab p-4 border-l-4 border-yellow-500">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-yellow-400" />
                      Rischio
                    </h4>
                    <p className="text-sm text-muted-foreground">Riduci esposizione Multi-Day Rejection finché il DD non rientra &lt;10%.</p>
                  </div>
                  <div className="glass-tab p-4 border-l-4 border-blue-500">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-blue-400" />
                      Costi
                    </h4>
                    <p className="text-sm text-muted-foreground">Usa ordini limit su Rate-Volatility per ridurre slippage (~$8/trade).</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <StrategyDetailTab strategy={detailedStrategies.find(s => s.id === performanceTab)} />
          )}
        </TabsContent>

        <TabsContent value="trade-journal" className="space-y-6">
          <div className="glass-enhanced p-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Diario operazioni
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  I popup manuale/PDF sono minimali e si chiudono automaticamente dopo il salvataggio.
                </p>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                <button
                  onClick={() => setShowManualModal(true)}
                  className={cn("tab-selector", showManualModal && "tab-selector-active")}
                >
                  Inserimento manuale
                </button>
                <button
                  onClick={() => setShowPdfModal(true)}
                  className={cn("tab-selector", showPdfModal && "tab-selector-active")}
                >
                  Import PDF MT5
                </button>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">Strategia attiva (filtro lista)</p>
              <div className="flex flex-wrap gap-2">
                {selectableStrategies.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedJournalStrategy(name)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                      selectedJournalStrategy === name
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-enhanced p-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h3 className="font-semibold">Statistiche strategia</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedJournalStrategy || 'Nessuna'} • Auto-update da dati manuali o PDF • Trades: {usePdfForStats ? (resolvedSummary.totalTrades ?? 'N/D') : strategyStats.total}
                </p>
                {pdfReportSummary?.report_title && (
                  <p className="text-[11px] text-primary mt-1">
                    Template PDF: {pdfReportSummary.report_title}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {[
                  { key: 'summary', label: 'Summary' },
                  { key: 'profit_loss', label: 'Profit & Loss' },
                  { key: 'long_short', label: 'Long & Short' },
                  { key: 'symbols', label: 'Symbols' },
                  { key: 'risks', label: 'Risks' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setJournalStatsTab(tab.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-[0.08em] transition-all",
                      journalStatsTab === tab.key
                        ? "bg-primary/15 border-primary/40 text-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              {journalStatsTab === 'summary' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Trades</p>
                    <p className="text-lg font-semibold">
                      {resolvedSummary.totalTrades ?? 'N/D'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Win Rate</p>
                    <p className="text-lg font-semibold text-primary">
                      {resolvedSummary.winRate === null ? 'N/D' : `${formatFixed(resolvedSummary.winRate, 1)}%`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Profit Factor</p>
                    <p className="text-lg font-semibold text-emerald-400">
                      {resolvedSummary.profitFactor === null
                        ? 'N/D'
                        : Number.isFinite(resolvedSummary.profitFactor)
                          ? formatFixed(resolvedSummary.profitFactor, 2)
                          : '∞'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Net P&L</p>
                    <p className={cn("text-lg font-semibold", (resolvedSummary.netPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatSignedFixed(resolvedSummary.netPnl, 2)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Avg R</p>
                    <p className="text-lg font-semibold">{formatFixed(resolvedSummary.avgR, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Max Drawdown</p>
                    <p className="text-lg font-semibold text-red-400">
                      {resolvedSummary.maxDrawdown === null
                        ? 'N/D'
                        : `${formatFixed(resolvedSummary.maxDrawdown, 3)}${usePdfForStats ? '%' : ''}`}
                    </p>
                  </div>
                </div>
              )}

              {journalStatsTab === 'profit_loss' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Gross Profit</p>
                    <p className="text-lg font-semibold text-emerald-400">{formatSignedFixed(resolvedProfitLoss.grossProfit, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Gross Loss</p>
                    <p className="text-lg font-semibold text-red-400">{formatSignedFixed(resolvedProfitLoss.grossLoss, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Net P&L</p>
                    <p className={cn("text-lg font-semibold", (resolvedProfitLoss.netPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatSignedFixed(resolvedProfitLoss.netPnl, 2)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Avg Trade</p>
                    <p className={cn("text-lg font-semibold", (resolvedProfitLoss.avgTrade ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {formatSignedFixed(resolvedProfitLoss.avgTrade, 2)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Avg Win</p>
                    <p className="text-lg font-semibold text-emerald-400">{formatSignedFixed(resolvedProfitLoss.avgWin, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Avg Loss</p>
                    <p className="text-lg font-semibold text-red-400">{formatSignedFixed(resolvedProfitLoss.avgLoss, 2)}</p>
                  </div>
                </div>
              )}

              {journalStatsTab === 'long_short' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Long', data: resolvedLongShort.long },
                    { label: 'Short', data: resolvedLongShort.short },
                    { label: 'Unknown', data: resolvedLongShort.unknown }
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.08em]">{item.label}</p>
                      <div className="mt-2 space-y-1.5 text-sm">
                        <p>Trades: <span className="font-semibold">{item.data.count}</span></p>
                        <p>
                          Win Rate:{' '}
                          <span className="font-semibold text-primary">
                            {item.data.winRate === null || item.data.winRate === undefined
                              ? 'N/D'
                              : `${formatFixed(item.data.winRate, 1)}%`}
                          </span>
                        </p>
                        {usePdfForStats && item.data.pct !== null && item.data.pct !== undefined && (
                          <p>Quota: <span className="font-semibold text-primary">{formatFixed(item.data.pct, 2)}%</span></p>
                        )}
                        <p className={cn(item.data.netPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Net: {formatSignedFixed(item.data.netPnl, 2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {journalStatsTab === 'symbols' && (
                resolvedSymbols.length === 0 ? (
                  <div className="h-24 grid place-items-center text-xs text-muted-foreground">
                    Nessun simbolo disponibile.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {resolvedSymbols.map((item) => (
                      <div key={item.symbol} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.symbol}</p>
                          <p className="text-xs text-muted-foreground">
                            Trades: {item.count}
                            {item.winRate !== null && item.winRate !== undefined ? ` • Win Rate: ${formatFixed(item.winRate, 1)}%` : ''}
                            {item.profitFactor !== null && item.profitFactor !== undefined ? ` • PF: ${formatFixed(item.profitFactor, 2)}` : ''}
                          </p>
                        </div>
                        <p className={cn("font-semibold", item.netPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {formatSignedFixed(item.netPnl, 2)}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              )}

              {journalStatsTab === 'risks' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Best Trade</p>
                    <p className="text-lg font-semibold text-emerald-400">{formatSignedFixed(resolvedRisks.bestTrade, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Worst Trade</p>
                    <p className="text-lg font-semibold text-red-400">{formatSignedFixed(resolvedRisks.worstTrade, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Max Win Streak</p>
                    <p className="text-lg font-semibold">{resolvedRisks.maxWinStreak ?? 'N/D'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Max Loss Streak</p>
                    <p className="text-lg font-semibold">{resolvedRisks.maxLossStreak ?? 'N/D'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Consecutive Profit</p>
                    <p className="text-lg font-semibold text-emerald-400">{formatSignedFixed(resolvedRisks.maxConsecutiveProfit, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] text-muted-foreground">Consecutive Loss</p>
                    <p className="text-lg font-semibold text-red-400">{formatSignedFixed(resolvedRisks.maxConsecutiveLoss, 2)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-enhanced p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                {isBulkMode && selectedTradeIds.length > 0 && (
                  <span className="text-xs text-primary font-medium">{selectedTradeIds.length} selezionate</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => loadTrades(false)}
                  disabled={isTradesLoading}
                >
                  {isTradesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aggiorna'}
                </Button>
                <Button
                  variant="outline"
                  className={cn("rounded-lg", isBulkMode && "border-primary/40 text-primary")}
                  onClick={toggleBulkMode}
                >
                  Bulk
                </Button>
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={handleDeleteSelectedTrades}
                  disabled={!isBulkMode || selectedTradeIds.length === 0 || isDeletingTrades}
                >
                  {isDeletingTrades ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {isTradesLoading ? (
              <div className="h-36 grid place-items-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : filteredTradeRows.length === 0 ? (
              <div className="h-36 grid place-items-center text-sm text-muted-foreground border border-border/50 rounded-xl bg-white/5">
                Nessuna operazione per la strategia selezionata.
              </div>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filteredTradeRows.slice(0, 120).map((trade) => {
                  const tradePnl = toNumber(trade.profit_loss);
                  const isSelected = selectedTradeIds.includes(trade.id);

                  return (
                    <div
                      key={trade.id}
                      className={cn(
                        "rounded-xl border bg-white/5 p-3 transition-all",
                        isSelected ? "border-primary/50" : "border-border/60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{trade.symbol}</p>
                          <p className="text-xs text-muted-foreground">{formatTradeDate(trade.date)}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "text-sm font-semibold",
                            tradePnl >= 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {tradePnl >= 0 ? '+' : ''}{tradePnl.toFixed(2)}
                          </div>
                          {isBulkMode ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTradeSelection(trade.id)}
                              className="w-4 h-4 rounded border border-white/20 bg-transparent"
                            />
                          ) : (
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg"
                              onClick={() => handleDeleteSingleTrade(trade.id)}
                              disabled={isDeletingTrades}
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Entry: {trade.entry_price}</span>
                        <span>Exit: {trade.exit_price}</span>
                        <span>Side: {(trade.side || inferTradeSide(trade)).toString().toUpperCase()}</span>
                        <span>Strategia: {trade.strategy_name || '-'}</span>
                        <span>Fonte: {trade.source === 'pdf_import' ? 'PDF' : 'Manuale'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {showManualModal && (
            <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-16 px-4">
              <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#0c1117] p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">Inserimento manuale</p>
                  <button
                    onClick={() => setShowManualModal(false)}
                    className="text-xs text-muted-foreground hover:text-white"
                  >
                    Chiudi
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Seleziona strategia</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectableStrategies.map((name) => (
                    <button
                      key={`manual-${name}`}
                      onClick={() => setSelectedJournalStrategy(name)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all",
                        selectedJournalStrategy === name
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-2">Direzione operazione</p>
                <div className="flex items-center gap-2 mb-3">
                  {[
                    { key: 'long', label: 'Long' },
                    { key: 'short', label: 'Short' }
                  ].map((sideOption) => (
                    <button
                      key={sideOption.key}
                      onClick={() => setManualTrade({ ...manualTrade, side: sideOption.key })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                        manualTrade.side === sideOption.key
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {sideOption.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={manualTrade.symbol}
                    onChange={(e) => setManualTrade({ ...manualTrade, symbol: e.target.value })}
                    placeholder="Asset"
                    className="bg-white/5"
                  />
                  <Input
                    type="datetime-local"
                    value={manualTrade.date}
                    onChange={(e) => setManualTrade({ ...manualTrade, date: e.target.value })}
                    className="bg-white/5"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={manualTrade.entry_price}
                    onChange={(e) => setManualTrade({ ...manualTrade, entry_price: e.target.value })}
                    placeholder="Entry"
                    className="bg-white/5"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={manualTrade.exit_price}
                    onChange={(e) => setManualTrade({ ...manualTrade, exit_price: e.target.value })}
                    placeholder="Exit"
                    className="bg-white/5"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={manualTrade.profit_loss}
                    onChange={(e) => setManualTrade({ ...manualTrade, profit_loss: e.target.value })}
                    placeholder="P&L"
                    className="bg-white/5"
                  />
                  <Input
                    type="number"
                    step="any"
                    value={manualTrade.profit_loss_r}
                    onChange={(e) => setManualTrade({ ...manualTrade, profit_loss_r: e.target.value })}
                    placeholder="P&L (R)"
                    className="bg-white/5"
                  />
                </div>
                <Textarea
                  value={manualTrade.notes}
                  onChange={(e) => setManualTrade({ ...manualTrade, notes: e.target.value })}
                  placeholder="Note"
                  className="bg-white/5 min-h-[80px] mt-3"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" className="rounded-lg" onClick={() => setShowManualModal(false)}>
                    Annulla
                  </Button>
                  <Button
                    onClick={handleManualTradeSave}
                    className="rounded-lg bg-primary hover:bg-primary/90"
                    disabled={isManualSaving}
                  >
                    {isManualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salva'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {showPdfModal && (
            <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
              <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0c1117] p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">Import PDF MT5</p>
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="text-xs text-muted-foreground hover:text-white"
                  >
                    Chiudi
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Seleziona strategia</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectableStrategies.map((name) => (
                    <button
                      key={`pdf-${name}`}
                      onClick={() => setSelectedJournalStrategy(name)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all",
                        selectedJournalStrategy === name
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Modalità analisi: legge titolo e sezioni del report (Summary, Profit &amp; Loss, Long &amp; Short, Symbols, Risks) senza importare operazioni.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handlePdfImport}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg"
                  disabled={isPdfImporting}
                >
                  {isPdfImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {isPdfImporting ? 'Importazione...' : 'Seleziona PDF'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          {/* New Strategy Form (Existing) */}
          <div className="glass-enhanced p-0">
            <div className="p-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Crea Nuova Strategia
              </h3>
            </div>
            <div className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome Strategia *</Label>
                  <Input
                    value={newStrategy.name}
                    onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                    placeholder="Es: Breakout Morning"
                    className="bg-white/5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Asset (separati da virgola)</Label>
                  <Input
                    value={newStrategy.assets}
                    onChange={(e) => setNewStrategy({ ...newStrategy, assets: e.target.value })}
                    placeholder="NQ, S&P, XAUUSD"
                    className="bg-white/5"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrizione *</Label>
                <Textarea
                  value={newStrategy.description}
                  onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                  placeholder="Descrivi l'obiettivo e la logica della strategia..."
                  className="bg-white/5 min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Win Rate (%)</Label>
                  <Input
                    type="number"
                    value={newStrategy.winRate}
                    onChange={(e) => setNewStrategy({ ...newStrategy, winRate: parseFloat(e.target.value) })}
                    className="bg-white/5"
                    min={1}
                    max={99}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avg Win (R)</Label>
                  <Input
                    type="number"
                    value={newStrategy.avgWinR}
                    onChange={(e) => setNewStrategy({ ...newStrategy, avgWinR: parseFloat(e.target.value) })}
                    className="bg-white/5"
                    step={0.1}
                    min={0.1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avg Loss (R)</Label>
                  <Input
                    type="number"
                    value={newStrategy.avgLossR}
                    onChange={(e) => setNewStrategy({ ...newStrategy, avgLossR: parseFloat(e.target.value) })}
                    className="bg-white/5"
                    step={0.1}
                    min={0.1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max DD (%)</Label>
                  <Input
                    type="number"
                    value={newStrategy.maxDD}
                    onChange={(e) => setNewStrategy({ ...newStrategy, maxDD: parseFloat(e.target.value) })}
                    className="bg-white/5"
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Regole (una per riga)</Label>
                <Textarea
                  value={newStrategy.rules}
                  onChange={(e) => setNewStrategy({ ...newStrategy, rules: e.target.value })}
                  placeholder="Entry solo su rejection&#10;Stop oltre il massimo dello spike&#10;TP1 a +1.2R"
                  className="bg-white/5 min-h-[120px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Trigger (uno per riga)</Label>
                <Textarea
                  value={newStrategy.triggers}
                  onChange={(e) => setNewStrategy({ ...newStrategy, triggers: e.target.value })}
                  placeholder="Prezzo su zona premium&#10;VIX stabile&#10;No news imminenti"
                  className="bg-white/5 min-h-[100px] font-mono text-sm"
                />
              </div>

              <div className="p-4 bg-white/5 rounded-xl">
                <p className="text-sm text-muted-foreground mb-1">Risk/Reward Stimato</p>
                <p className="text-2xl font-bold text-primary">
                  {((newStrategy.winRate / 100 * newStrategy.avgWinR) / ((1 - newStrategy.winRate / 100) * newStrategy.avgLossR)).toFixed(2)}
                </p>
              </div>

              <Button
                onClick={handleSaveStrategy}
                className="w-full rounded-xl bg-primary hover:bg-primary/90"
              >
                <Download className="w-4 h-4 mr-2" />
                Salva Strategia
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
