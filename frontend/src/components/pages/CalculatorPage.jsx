import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Slider } from '../ui/slider';
import { cn } from '../../lib/utils';
import { 
  Calculator, DollarSign, Percent, Target, AlertTriangle,
  Building, TrendingUp, Shield, Zap, Download, BarChart3
} from 'lucide-react';

// Broker/Prop Firm Data
const BROKERS = {
  personal: [
    { id: 'ic_markets', name: 'IC Markets', leverage: 500, commission: 3.5, spread: 0.1, type: 'ECN' },
    { id: 'pepperstone', name: 'Pepperstone', leverage: 500, commission: 3.5, spread: 0.1, type: 'ECN' },
    { id: 'xm', name: 'XM', leverage: 888, commission: 0, spread: 1.6, type: 'Standard' },
    { id: 'exness', name: 'Exness', leverage: 2000, commission: 3.5, spread: 0.1, type: 'ECN' },
    { id: 'fxpro', name: 'FxPro', leverage: 500, commission: 4.5, spread: 0.3, type: 'ECN' }
  ],
  prop: [
    { id: 'ftmo', name: 'FTMO', leverage: 100, commission: 0, spread: 0.2, profit_split: 80, max_dd: 10, daily_dd: 5 },
    { id: 'funded_next', name: 'FundedNext', leverage: 100, commission: 0, spread: 0.3, profit_split: 90, max_dd: 10, daily_dd: 5 },
    { id: 'the5ers', name: 'The5ers', leverage: 100, commission: 0, spread: 0.5, profit_split: 80, max_dd: 6, daily_dd: 4 },
    { id: 'mff', name: 'MyForexFunds', leverage: 100, commission: 0, spread: 0.3, profit_split: 85, max_dd: 12, daily_dd: 5 },
    { id: 'e8', name: 'E8 Funding', leverage: 100, commission: 0, spread: 0.2, profit_split: 80, max_dd: 8, daily_dd: 4 }
  ]
};

// Asset pip values
const ASSETS = {
  'EURUSD': { pipValue: 10, pipSize: 0.0001, name: 'EUR/USD' },
  'GBPUSD': { pipValue: 10, pipSize: 0.0001, name: 'GBP/USD' },
  'USDJPY': { pipValue: 9.1, pipSize: 0.01, name: 'USD/JPY' },
  'XAUUSD': { pipValue: 1, pipSize: 0.01, name: 'Gold' },
  'NAS100': { pipValue: 1, pipSize: 0.01, name: 'NASDAQ' },
  'US30': { pipValue: 1, pipSize: 1, name: 'Dow Jones' }
};

// Result Card
const ResultCard = ({ label, value, subValue, icon: Icon, color = 'primary' }) => {
  const colorClasses = {
    primary: 'text-primary',
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400'
  };
  
  return (
    <div className="p-4 bg-white/5 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className={cn("w-4 h-4", colorClasses[color])} />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-xl font-bold truncate", colorClasses[color])}>{value}</p>
      {subValue && <p className="text-xs text-muted-foreground mt-1">{subValue}</p>}
    </div>
  );
};

export default function CalculatorPage() {
  const [brokerType, setBrokerType] = useState('personal');
  const [selectedBroker, setSelectedBroker] = useState('ic_markets');
  const [asset, setAsset] = useState('EURUSD');
  const [accountSize, setAccountSize] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [stopLossPips, setStopLossPips] = useState(20);
  const [entryPrice, setEntryPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [results, setResults] = useState(null);

  const brokerList = brokerType === 'personal' ? BROKERS.personal : BROKERS.prop;
  const broker = brokerList.find(b => b.id === selectedBroker) || brokerList[0];
  const assetData = ASSETS[asset];

  // Calculate position
  useEffect(() => {
    const riskAmount = accountSize * (riskPercent / 100);
    const pipValue = assetData.pipValue;
    const lotSize = riskAmount / (stopLossPips * pipValue);
    const lots = Math.floor(lotSize * 100) / 100; // Round to 0.01
    
    // Commission per lot (round trip)
    const commission = broker.commission * 2 * lots;
    
    // Spread cost
    const spreadCost = (broker.spread * pipValue * lots);
    
    // Total cost
    const totalCost = commission + spreadCost;
    
    // Effective risk
    const effectiveRisk = riskAmount + totalCost;
    const effectiveRiskPercent = (effectiveRisk / accountSize) * 100;
    
    // For prop firms
    const maxDDAmount = brokerType === 'prop' ? accountSize * (broker.max_dd / 100) : null;
    const dailyDDAmount = brokerType === 'prop' ? accountSize * (broker.daily_dd / 100) : null;
    const tradesBeforeDD = brokerType === 'prop' ? Math.floor(dailyDDAmount / effectiveRisk) : null;
    
    // Profit potential (1:2 RR example)
    const potentialProfit = riskAmount * 2;
    const netProfit = brokerType === 'prop' 
      ? potentialProfit * (broker.profit_split / 100) - totalCost
      : potentialProfit - totalCost;

    setResults({
      lots,
      riskAmount: riskAmount.toFixed(2),
      commission: commission.toFixed(2),
      spreadCost: spreadCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
      effectiveRisk: effectiveRisk.toFixed(2),
      effectiveRiskPercent: effectiveRiskPercent.toFixed(2),
      maxDDAmount: maxDDAmount?.toFixed(2),
      dailyDDAmount: dailyDDAmount?.toFixed(2),
      tradesBeforeDD,
      potentialProfit: potentialProfit.toFixed(2),
      netProfit: netProfit.toFixed(2),
      leverage: broker.leverage,
      marginRequired: ((lots * 100000) / broker.leverage).toFixed(2)
    });
  }, [accountSize, riskPercent, stopLossPips, broker, assetData, brokerType]);

  return (
    <div className="space-y-6 fade-in" data-testid="calculator-page">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calculator className="w-8 h-8 text-primary" />
          Position Calculator
        </h1>
        <p className="text-muted-foreground mt-1">
          Calcolo posizione ottimizzato per broker e prop firms
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <Card className="bg-card/80 border-border/50 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Parametri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Broker Type */}
            <div className="space-y-2">
              <Label>Tipo Account</Label>
              <Tabs value={brokerType} onValueChange={(v) => { setBrokerType(v); setSelectedBroker(v === 'personal' ? 'ic_markets' : 'ftmo'); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="personal" className="flex-1">Personal</TabsTrigger>
                  <TabsTrigger value="prop" className="flex-1">Prop Firm</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Broker Selection */}
            <div className="space-y-2">
              <Label>{brokerType === 'prop' ? 'Prop Firm' : 'Broker'}</Label>
              <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brokerList.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leva: 1:{broker.leverage} • Spread: {broker.spread} pip
                {brokerType === 'prop' && ` • Split: ${broker.profit_split}%`}
              </p>
            </div>

            {/* Asset */}
            <div className="space-y-2">
              <Label>Asset</Label>
              <Select value={asset} onValueChange={setAsset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSETS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account Size */}
            <div className="space-y-2">
              <Label>Capitale Account</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={accountSize}
                  onChange={(e) => setAccountSize(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Risk Percent */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Rischio per Trade</Label>
                <span className="text-sm text-primary font-bold">{riskPercent}%</span>
              </div>
              <div className="flex gap-2">
                <Slider
                  value={[riskPercent * 100]}
                  onValueChange={([v]) => setRiskPercent(v / 100)}
                  max={500}
                  min={1}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-20"
                  step={0.01}
                  min={0.01}
                />
              </div>
            </div>

            {/* Stop Loss */}
            <div className="space-y-2">
              <Label>Stop Loss (pips)</Label>
              <Input
                type="number"
                value={stopLossPips}
                onChange={(e) => setStopLossPips(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card className="bg-card/80 border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Risultati Calcolo</span>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-1" /> Export
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results && (
              <div className="space-y-4">
                {/* Main Result */}
                <div className="p-6 bg-gradient-to-r from-primary/10 to-emerald-500/10 rounded-2xl text-center">
                  <p className="text-sm text-muted-foreground mb-2">Position Size</p>
                  <p className="text-5xl font-bold text-primary">{results.lots}</p>
                  <p className="text-lg text-muted-foreground">Lotti Standard</p>
                </div>

                {/* Grid Results */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <ResultCard 
                    icon={DollarSign}
                    label="Rischio $"
                    value={`$${results.riskAmount}`}
                    color="primary"
                  />
                  <ResultCard 
                    icon={Percent}
                    label="Rischio Effettivo"
                    value={`${results.effectiveRiskPercent}%`}
                    subValue={`Inclusi costi`}
                    color={parseFloat(results.effectiveRiskPercent) > riskPercent * 1.2 ? 'yellow' : 'primary'}
                  />
                  <ResultCard 
                    icon={Target}
                    label="Profit Potenziale"
                    value={`$${results.netProfit}`}
                    subValue="2:1 R:R netto"
                    color="green"
                  />
                  <ResultCard 
                    icon={Shield}
                    label="Margine Richiesto"
                    value={`$${results.marginRequired}`}
                    subValue={`Leva 1:${results.leverage}`}
                    color="primary"
                  />
                </div>

                {/* Costs */}
                <div className="p-4 bg-white/5 rounded-xl">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Costi Operazione
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Commissioni</p>
                      <p className="font-bold">${results.commission}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Spread</p>
                      <p className="font-bold">${results.spreadCost}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Totale</p>
                      <p className="font-bold text-yellow-400">${results.totalCost}</p>
                    </div>
                  </div>
                </div>

                {/* Prop Firm Specific */}
                {brokerType === 'prop' && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" /> Limiti Prop Firm
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Max DD ({broker.max_dd}%)</p>
                        <p className="font-bold text-red-400">${results.maxDDAmount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Daily DD ({broker.daily_dd}%)</p>
                        <p className="font-bold text-red-400">${results.dailyDDAmount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Trade prima DD</p>
                        <p className="font-bold">{results.tradesBeforeDD} trade</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Summary */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-primary">
                    <Zap className="w-4 h-4" /> Karion AI Summary
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Con {results.lots} lotti su {assetData.name} e SL a {stopLossPips} pips, 
                    il rischio effettivo è {results.effectiveRiskPercent}% (${results.effectiveRisk}).
                    {brokerType === 'prop' && ` Su ${broker.name} puoi permetterti max ${results.tradesBeforeDD} trade perdenti consecutivi prima del daily DD.`}
                    {parseFloat(results.effectiveRiskPercent) > 2 && ' Considera di ridurre il rischio.'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
