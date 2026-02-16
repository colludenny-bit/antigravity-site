import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
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
  ChevronDown, ChevronUp, Trophy, Pause, Ban, Scale,
  CheckCircle, XCircle, Minus, ArrowUp, ArrowDown
} from 'lucide-react';
import { toast } from 'sonner';

import { detailedStrategies } from '../../data/strategies';

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
