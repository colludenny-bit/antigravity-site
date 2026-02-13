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
  Play, BarChart3, Activity
} from 'lucide-react';
import { toast } from 'sonner';

// Pre-defined strategies based on user rules
const predefinedStrategies = [
  {
    id: 'strategy-1',
    name: 'News Spike Reversion',
    shortName: 'S1',
    assets: ['NQ', 'S&P', 'XAUUSD', 'EURUSD'],
    winRate: 62,
    avgWinR: 1.2,
    avgLossR: 1.0,
    riskReward: 1.44,
    maxDD: 8,
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
    ]
  },
  {
    id: 'strategy-2',
    name: 'VIX Range Fade',
    shortName: 'S2',
    assets: ['NQ', 'S&P'],
    winRate: 58,
    avgWinR: 1.2,
    avgLossR: 1.0,
    riskReward: 1.39,
    maxDD: 10,
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
    ]
  },
  {
    id: 'strategy-3',
    name: 'Cross-Market Confirmation',
    shortName: 'S3',
    assets: ['Tutti'],
    winRate: null,
    avgWinR: null,
    avgLossR: null,
    riskReward: null,
    maxDD: null,
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
    isModulator: true
  },
  // Advanced Strategies
  {
    id: 'gamma-magnet',
    name: 'GammaMagnet Convergence',
    shortName: 'GM',
    assets: ['NQ', 'S&P', 'SPY', 'QQQ'],
    winRate: 68,
    avgWinR: 1.24,
    avgLossR: 1.0,
    riskReward: 2.15,
    maxDD: 8,
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
    isAdvanced: true
  },
  {
    id: 'rate-vol-alignment',
    name: 'Rate-Volatility Alignment',
    shortName: 'RV',
    assets: ['NQ', 'S&P', 'TLT', 'EURUSD'],
    winRate: 62,
    avgWinR: 0.98,
    avgLossR: 1.0,
    riskReward: 1.62,
    maxDD: 12,
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
    isAdvanced: true
  },
  {
    id: 'volguard-mr',
    name: 'VolGuard Mean-Reversion',
    shortName: 'VG',
    assets: ['NQ', 'S&P', 'SPX'],
    winRate: 72,
    avgWinR: 0.65,
    avgLossR: 1.0,
    riskReward: 1.67,
    maxDD: 5,
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
    isAdvanced: true
  },
  {
    id: 'multi-day-ra',
    name: 'Multi-Day Rejection/Acceptance',
    shortName: 'MD',
    assets: ['NQ', 'S&P', 'XAUUSD', 'BTC'],
    winRate: 56,
    avgWinR: 1.85,
    avgLossR: 1.0,
    riskReward: 2.36,
    maxDD: 15,
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
    isAdvanced: true
  }
];

const StrategyCard = ({ strategy, onExportToMonteCarlo }) => {
  const navigate = useNavigate();

  const handleExport = () => {
    // Store strategy params in localStorage for Monte Carlo
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
        {/* Description */}
        <p className="text-sm text-muted-foreground">{strategy.description}</p>

        {/* Stats Grid - Only for non-modulator strategies */}
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

        {/* Rules */}
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

        {/* Triggers */}
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

        {/* Probability Factors */}
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

        {/* Export Button - Only for strategies with stats */}
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

export default function StrategyPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('strategies');
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

    // Save to localStorage (in production would save to backend)
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

  // Load custom strategies
  const customStrategies = JSON.parse(localStorage.getItem('customStrategies') || '[]');
  const allStrategies = [...predefinedStrategies, ...customStrategies.map(s => ({
    ...s,
    probabilityFactors: ['Definiti dall\'utente']
  }))];

  return (
    <div className="space-y-6 fade-in font-apple" data-testid="strategy-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Target className="w-8 h-8 text-primary" />
          Strategie di Trading
        </h1>
        <p className="text-muted-foreground mt-1">
          Strategie pre-definite con regole e stime di performance
        </p>
      </motion.div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-transparent p-1 gap-1">
          <TabsTrigger value="strategies" className="rounded-lg">
            <BarChart3 className="w-4 h-4 mr-2" />
            Strategie ({allStrategies.length})
          </TabsTrigger>
          <TabsTrigger value="new" className="rounded-lg">
            <Plus className="w-4 h-4 mr-2" />
            Nuova Strategia
          </TabsTrigger>
        </TabsList>

        {/* Strategies List */}
        <TabsContent value="strategies" className="space-y-4">
          {/* Strategy Tabs */}
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

          {/* Strategy Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {allStrategies.map(strategy => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onExportToMonteCarlo={handleExportAndRun}
              />
            ))}
          </div>

          {/* Risk Management Rules */}
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
              <p>• <strong>Chiudi anticipato</strong> se probabilità scende sotto 50%</p>
              <p>• <strong>Re-entry</strong> consentito solo se prob torna ≥55%</p>
            </div>
          </div>
        </TabsContent>

        {/* New Strategy Form */}
        <TabsContent value="new" className="space-y-4">
          <div className="glass-enhanced p-0">
            <div className="p-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Crea Nuova Strategia
              </h3>
            </div>
            <div className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label>Nome Strategia *</Label>
                  <Input
                    value={newStrategy.name}
                    onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                    placeholder="Es: Breakout Morning"
                    className="bg-white/5"
                  />
                </div>

                {/* Assets */}
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

              {/* Description */}
              <div className="space-y-2">
                <Label>Descrizione *</Label>
                <Textarea
                  value={newStrategy.description}
                  onChange={(e) => setNewStrategy({ ...newStrategy, description: e.target.value })}
                  placeholder="Descrivi l'obiettivo e la logica della strategia..."
                  className="bg-white/5 min-h-[100px]"
                />
              </div>

              {/* Stats Grid */}
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

              {/* Rules */}
              <div className="space-y-2">
                <Label>Regole (una per riga)</Label>
                <Textarea
                  value={newStrategy.rules}
                  onChange={(e) => setNewStrategy({ ...newStrategy, rules: e.target.value })}
                  placeholder="Entry solo su rejection&#10;Stop oltre il massimo dello spike&#10;TP1 a +1.2R"
                  className="bg-white/5 min-h-[120px] font-mono text-sm"
                />
              </div>

              {/* Triggers */}
              <div className="space-y-2">
                <Label>Trigger (uno per riga)</Label>
                <Textarea
                  value={newStrategy.triggers}
                  onChange={(e) => setNewStrategy({ ...newStrategy, triggers: e.target.value })}
                  placeholder="Prezzo su zona premium&#10;VIX stabile&#10;No news imminenti"
                  className="bg-white/5 min-h-[100px] font-mono text-sm"
                />
              </div>

              {/* Preview R:R */}
              <div className="p-4 bg-white/5 rounded-xl">
                <p className="text-sm text-muted-foreground mb-1">Risk/Reward Stimato</p>
                <p className="text-2xl font-bold text-primary">
                  {((newStrategy.winRate / 100 * newStrategy.avgWinR) / ((1 - newStrategy.winRate / 100) * newStrategy.avgLossR)).toFixed(2)}
                </p>
              </div>

              {/* Save Button */}
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
