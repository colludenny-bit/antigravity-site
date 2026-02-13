import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../../lib/utils';
import { 
  TrendingUp, TrendingDown, Activity, BarChart3, Target,
  ArrowUpRight, ArrowDownRight, Clock, Zap, RefreshCw,
  DollarSign, Percent, AlertTriangle, Eye
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Simulated Options Flow Data
const generateOptionsFlow = (symbol) => {
  const now = new Date();
  const flows = [];
  
  for (let i = 0; i < 15; i++) {
    const isCall = Math.random() > 0.45;
    const isBullish = isCall ? Math.random() > 0.3 : Math.random() > 0.7;
    const premium = Math.floor(Math.random() * 500000) + 50000;
    const strike = symbol === 'SPY' ? 600 + Math.floor(Math.random() * 20) - 10 :
                   symbol === 'QQQ' ? 520 + Math.floor(Math.random() * 20) - 10 :
                   symbol === 'GLD' ? 240 + Math.floor(Math.random() * 10) - 5 : 100;
    
    flows.push({
      id: i,
      time: new Date(now - i * 300000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      symbol,
      type: isCall ? 'CALL' : 'PUT',
      strike,
      expiry: ['Weekly', '2W', 'Monthly', 'Quarterly'][Math.floor(Math.random() * 4)],
      premium: premium,
      sentiment: isBullish ? 'Bullish' : 'Bearish',
      size: Math.floor(Math.random() * 5000) + 100,
      unusual: premium > 300000,
      sweep: Math.random() > 0.7
    });
  }
  
  return flows;
};

// Calculate flow summary
const calculateFlowSummary = (flows) => {
  const callPremium = flows.filter(f => f.type === 'CALL').reduce((sum, f) => sum + f.premium, 0);
  const putPremium = flows.filter(f => f.type === 'PUT').reduce((sum, f) => sum + f.premium, 0);
  const bullishCount = flows.filter(f => f.sentiment === 'Bullish').length;
  const bearishCount = flows.filter(f => f.sentiment === 'Bearish').length;
  const unusualCount = flows.filter(f => f.unusual).length;
  
  return {
    callPremium,
    putPremium,
    ratio: putPremium > 0 ? (callPremium / putPremium).toFixed(2) : 'N/A',
    bullishPct: Math.round((bullishCount / flows.length) * 100),
    bearishPct: Math.round((bearishCount / flows.length) * 100),
    unusualCount,
    netFlow: callPremium - putPremium
  };
};

// Flow Row Component
const FlowRow = ({ flow }) => (
  <div className={cn(
    "grid grid-cols-8 gap-2 p-3 rounded-lg text-sm items-center",
    flow.unusual ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-white/5",
    flow.sweep && "ring-1 ring-primary/50"
  )}>
    <span className="text-muted-foreground">{flow.time}</span>
    <span className="font-medium">{flow.symbol}</span>
    <span className={cn(
      "font-bold",
      flow.type === 'CALL' ? "text-primary" : "text-red-400"
    )}>
      {flow.type}
    </span>
    <span className="font-mono">${flow.strike}</span>
    <span className="text-muted-foreground">{flow.expiry}</span>
    <span className="font-mono">${(flow.premium / 1000).toFixed(0)}K</span>
    <span className={cn(
      "text-xs px-2 py-0.5 rounded",
      flow.sentiment === 'Bullish' ? "bg-primary/20 text-primary" : "bg-red-500/20 text-red-400"
    )}>
      {flow.sentiment}
    </span>
    <div className="flex gap-1">
      {flow.unusual && <span className="text-xs text-yellow-400">🔥</span>}
      {flow.sweep && <span className="text-xs text-primary">⚡</span>}
    </div>
  </div>
);

// GEX/DEX Indicator
const GexIndicator = ({ symbol }) => {
  const gex = symbol === 'SPY' ? Math.random() * 4 - 2 : Math.random() * 2 - 1;
  const isPositive = gex > 0;
  
  return (
    <Card className="bg-card/80 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">GEX (Gamma Exposure)</span>
          <span className={cn(
            "text-lg font-bold",
            isPositive ? "text-primary" : "text-red-400"
          )}>
            {gex > 0 ? '+' : ''}{gex.toFixed(2)}B
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {isPositive 
            ? "GEX positivo: dealer short gamma, tendenza mean-reversion"
            : "GEX negativo: dealer long gamma, possibile aumento volatilità"
          }
        </p>
      </CardContent>
    </Card>
  );
};

export default function OptionsFlowPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');
  const [flows, setFlows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setFlows(generateOptionsFlow(selectedSymbol));
  }, [selectedSymbol]);

  const summary = calculateFlowSummary(flows);

  const refreshFlows = () => {
    setIsLoading(true);
    setTimeout(() => {
      setFlows(generateOptionsFlow(selectedSymbol));
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="space-y-6 fade-in" data-testid="options-flow-page">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            Options Flow
          </h1>
          <p className="text-muted-foreground mt-1">
            Flusso opzioni in tempo reale • Unusual Activity
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SPY">SPY (S&P)</SelectItem>
              <SelectItem value="QQQ">QQQ (NDX)</SelectItem>
              <SelectItem value="GLD">GLD (Gold)</SelectItem>
              <SelectItem value="IWM">IWM (R2K)</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={refreshFlows} disabled={isLoading} className="rounded-xl">
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Aggiorna
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className={cn(
          "border",
          summary.netFlow > 0 ? "bg-primary/5 border-primary/30" : "bg-red-500/5 border-red-500/30"
        )}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Net Flow</p>
            <p className={cn(
              "text-2xl font-bold",
              summary.netFlow > 0 ? "text-primary" : "text-red-400"
            )}>
              ${(Math.abs(summary.netFlow) / 1000000).toFixed(1)}M
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.netFlow > 0 ? 'Call Heavy' : 'Put Heavy'}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Call Premium</p>
            <p className="text-2xl font-bold text-primary">
              ${(summary.callPremium / 1000000).toFixed(1)}M
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Put Premium</p>
            <p className="text-2xl font-bold text-red-400">
              ${(summary.putPremium / 1000000).toFixed(1)}M
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/80 border-border/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">P/C Ratio</p>
            <p className="text-2xl font-bold">{summary.ratio}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-yellow-500/5 border-yellow-500/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Unusual</p>
            <p className="text-2xl font-bold text-yellow-400">{summary.unusualCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flow Table */}
        <Card className="lg:col-span-2 bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Live Flow ({selectedSymbol})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {/* Header */}
              <div className="grid grid-cols-8 gap-2 p-2 text-xs text-muted-foreground border-b border-border">
                <span>Time</span>
                <span>Symbol</span>
                <span>Type</span>
                <span>Strike</span>
                <span>Expiry</span>
                <span>Premium</span>
                <span>Sent.</span>
                <span>Flag</span>
              </div>
              {flows.map((flow) => (
                <FlowRow key={flow.id} flow={flow} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* GEX */}
          <GexIndicator symbol={selectedSymbol} />
          
          {/* Sentiment Gauge */}
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium mb-3">Sentiment Distribution</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-primary">Bullish</span>
                  <span className="font-bold text-primary">{summary.bullishPct}%</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden flex">
                  <div 
                    className="bg-primary h-full transition-all"
                    style={{ width: `${summary.bullishPct}%` }}
                  />
                  <div 
                    className="bg-red-500 h-full transition-all"
                    style={{ width: `${summary.bearishPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-400">Bearish</span>
                  <span className="font-bold text-red-400">{summary.bearishPct}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Levels */}
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <h4 className="text-sm font-medium mb-3">Key Gamma Levels</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-primary/10 rounded">
                  <span>Max Pain</span>
                  <span className="font-mono font-bold">
                    ${selectedSymbol === 'SPY' ? '598' : selectedSymbol === 'QQQ' ? '515' : '242'}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span>Call Wall</span>
                  <span className="font-mono">
                    ${selectedSymbol === 'SPY' ? '610' : selectedSymbol === 'QQQ' ? '530' : '250'}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-white/5 rounded">
                  <span>Put Wall</span>
                  <span className="font-mono">
                    ${selectedSymbol === 'SPY' ? '585' : selectedSymbol === 'QQQ' ? '500' : '235'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alert */}
          <Card className="bg-yellow-500/5 border-yellow-500/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-yellow-400 mb-1">Options Flow Disclaimer</p>
                  <p className="text-muted-foreground">
                    Il flow è indicativo e non rappresenta necessariamente la direzione del mercato. 
                    Usare come conferma, non come segnale primario.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
