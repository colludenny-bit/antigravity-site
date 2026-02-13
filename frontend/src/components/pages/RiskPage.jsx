import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'; // REMOVED FOR STABILITY
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import {
  AlertTriangle, Activity, Shield, TrendingUp, TrendingDown,
  Clock, RefreshCw, ArrowUp, ArrowDown, Minus, Target,
  Calendar, BarChart3, Gauge, Brain, Zap
} from 'lucide-react';
import { RiskService } from '../../services/RiskService'; // NEW SERVICE

// Risk Score Gauge Component
const RiskGauge = ({ score, category }) => {
  const rotation = (score / 100) * 180 - 90;
  const categoryColors = {
    SAFE: { bg: 'bg-primary/20', text: 'text-primary', border: 'border-primary', glow: 'shadow-[0_0_30px_rgba(34,197,94,0.4)]' },
    MEDIUM: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500', glow: 'shadow-[0_0_30px_rgba(234,179,8,0.4)]' },
    HIGH: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.4)]' }
  };
  const colors = categoryColors[category] || categoryColors.MEDIUM;

  return (
    <div className="relative w-48 h-24 mx-auto mb-4">
      {/* Gauge background */}
      <div className={cn("absolute inset-0 rounded-t-full border-8 border-b-0 border-secondary overflow-hidden", colors.glow)}>
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-yellow-500 to-red-500 opacity-30" />
      </div>
      {/* Needle with pulse animation */}
      <motion.div
        className="absolute bottom-0 left-1/2 w-1 h-20 bg-foreground origin-bottom"
        initial={{ rotate: -90 }}
        animate={{
          rotate: rotation,
          scale: [1, 1.02, 1]
        }}
        transition={{
          rotate: { duration: 1.5, ease: "easeOut" },
          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }}
        style={{ x: '-50%' }}
      />
      {/* Center dot with pulse */}
      <motion.div
        className={cn("absolute bottom-0 left-1/2 w-4 h-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground border-2 border-background", colors.glow)}
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      {/* Score display */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center">
        <motion.span
          className={cn("text-4xl font-bold", colors.text)}
          key={score}
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {score}
        </motion.span>
        <span className="text-muted-foreground text-lg">/100</span>
      </div>
    </div>
  );
};

// Component Card for risk breakdown
const ComponentCard = ({ name, value, maxValue = 25, description, icon: Icon }) => {
  const percentage = (value / maxValue) * 100;
  const getColor = () => {
    if (percentage >= 70) return 'bg-red-500';
    if (percentage >= 40) return 'bg-yellow-500';
    return 'bg-primary';
  };

  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{name}</span>
        </div>
        <span className="text-sm font-bold">{value}/{maxValue}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", getColor())}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
};

// Asset Risk Card
const AssetRiskCard = ({ symbol, data, tilt }) => {
  const tiltColors = {
    green: 'border-primary/50 bg-primary/5',
    yellow: 'border-yellow-500/50 bg-yellow-500/5',
    red: 'border-red-500/50 bg-red-500/5'
  };

  return (
    <div className={cn("border rounded-xl bg-card overflow-hidden", tiltColors[tilt?.color] || 'border-border/50')}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
        <div className="text-lg font-bold flex items-center gap-2">
          <span>{symbol}</span>
        </div>
        <span className="text-primary font-mono font-bold">
          {typeof data.current === 'number'
            ? data.current.toFixed(symbol === 'EURUSD' ? 5 : 2)
            : data.current}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {/* Price Levels */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 bg-white/5 rounded">
            <p className="text-xs text-muted-foreground">Weekly H/L</p>
            <p>{data.weekly_high} / {data.weekly_low}</p>
          </div>
          <div className="p-2 bg-white/5 rounded">
            <p className="text-xs text-muted-foreground">2W H/L</p>
            <p>{data.two_week_high} / {data.two_week_low}</p>
          </div>
        </div>

        {/* Distance to extreme */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Distanza estremo:</span>
          <span className={cn(
            "font-bold",
            data.distance_to_extreme <= 0.5 ? "text-red-400" :
              data.distance_to_extreme <= 1 ? "text-yellow-400" : "text-primary"
          )}>
            {data.distance_to_extreme}% ({data.nearest_extreme})
          </span>
        </div>

        {/* Tilt */}
        {tilt && (
          <div className={cn(
            "p-2 rounded text-xs",
            tilt.color === 'green' ? "bg-primary/10" :
              tilt.color === 'yellow' ? "bg-yellow-500/10" : "bg-red-500/10"
          )}>
            <p className={cn(
              "font-medium mb-1",
              tilt.color === 'green' ? "text-primary" :
                tilt.color === 'yellow' ? "text-yellow-400" : "text-red-400"
            )}>
              {tilt.tilt.replace('-', ' ').toUpperCase()}
            </p>
            <p className="text-muted-foreground">{tilt.text}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default function RiskPage() {
  const [riskData, setRiskData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [previousScore, setPreviousScore] = useState(null);

  const fetchRiskData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
      setPreviousScore(riskData?.risk_score);
    }

    try {
      // Replaced AXIOS with INTERNAL SERVICE for reliability
      const data = await RiskService.getRiskAnalysis();
      setRiskData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching risk data:', err);
      setError('Errore nel caricamento dei dati di rischio');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [riskData?.risk_score]);

  useEffect(() => {
    fetchRiskData();
    const interval = setInterval(() => fetchRiskData(true), 60000); // 1 min update
    return () => clearInterval(interval);
  }, []); // Depend on empty array to mount only once, but fetchRiskData is stable enough or we ignore the lint warning for 'fetchRiskData' for now as it's a simulation

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="risk-page-loading">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !riskData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4" data-testid="risk-page-error">
        <AlertTriangle className="w-12 h-12 text-red-400" />
        <p className="text-muted-foreground">{error || 'Dati non disponibili'}</p>
        <Button onClick={() => fetchRiskData()}>Riprova</Button>
      </div>
    );
  }

  const { risk_score, risk_category, vix, components, reasons, assets, expected_move, next_event, asset_tilts, macro_events, last_update } = riskData;
  const scoreChanged = previousScore !== null && previousScore !== risk_score;

  return (
    <div className="space-y-6 fade-in" data-testid="risk-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            Risk Assessment
          </h1>
          <p className="text-muted-foreground mt-1">
            Valutazione rischio AI-powered • Update: {last_update}
          </p>
        </div>

        <Button
          onClick={() => fetchRiskData(true)}
          disabled={isRefreshing}
          className="rounded-xl bg-primary hover:bg-primary/90"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
          Update
        </Button>
      </motion.div>

      {/* Score Change Alert */}
      <AnimatePresence>
        {scoreChanged && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "p-3 rounded-xl flex items-center gap-3",
              risk_score > previousScore
                ? "bg-red-500/10 border border-red-500/30"
                : "bg-primary/10 border border-primary/30"
            )}
          >
            {risk_score > previousScore ? (
              <ArrowUp className="w-5 h-5 text-red-400" />
            ) : (
              <ArrowDown className="w-5 h-5 text-primary" />
            )}
            <span className="text-sm">
              Risk Score {risk_score > previousScore ? 'aumentato' : 'diminuito'}: {previousScore} → {risk_score}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tabs - Transparent Style */}
      <Tabs defaultValue="risk-level" className="space-y-6">
        <TabsList className="bg-transparent p-0 flex gap-6 border-b border-white/5 w-full justify-start h-auto rounded-none">
          <TabsTrigger value="risk-level" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <Gauge className="w-4 h-4 mr-2" />
            Risk Level
          </TabsTrigger>
          <TabsTrigger value="vix" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <Activity className="w-4 h-4 mr-2" />
            VIX Index
          </TabsTrigger>
          <TabsTrigger value="assets" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <BarChart3 className="w-4 h-4 mr-2" />
            Asset Risk
          </TabsTrigger>
          <TabsTrigger value="events" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <Calendar className="w-4 h-4 mr-2" />
            Macro Events
          </TabsTrigger>
        </TabsList>

        {/* Tab: Risk Level */}
        <TabsContent value="risk-level" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {/* Main Risk Score Card */}
          <div className={cn(
            "border-2 rounded-2xl p-6",
            risk_category === 'SAFE' ? "border-primary/50 bg-primary/5" :
              risk_category === 'MEDIUM' ? "border-yellow-500/50 bg-yellow-500/5" :
                "border-red-500/50 bg-red-500/5"
          )}>
            <div className="text-center mb-6">
              <RiskGauge score={risk_score} category={risk_category} />
              <div className="mt-8">
                <span className={cn(
                  "px-4 py-2 rounded-full text-lg font-bold",
                  risk_category === 'SAFE' ? "bg-primary/20 text-primary" :
                    risk_category === 'MEDIUM' ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                )}>
                  {risk_category}
                </span>
              </div>
            </div>

            {/* Main Reasons */}
            <div className="space-y-2 mt-6">
              <h4 className="text-sm font-medium text-white/50 text-center uppercase tracking-widest mb-4">Risk Drivers</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {reasons.map((reason, i) => (
                  <div key={i} className="flex flex-col gap-1 p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                    <div className="flex items-center justify-center gap-2 text-primary font-medium">
                      <Zap className="w-4 h-4" /> {reason.name}
                    </div>
                    <span className="text-xs text-muted-foreground">{reason.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Components Breakdown */}
            <div className="bg-card/40 border border-white/5 rounded-2xl p-5">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2 text-white/90">
                <Activity className="w-4 h-4 text-primary" /> Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ComponentCard
                  name="VIX Level"
                  value={components.vix_level}
                  description={`VIX @ ${vix.current}`}
                  icon={Activity}
                />
                <ComponentCard
                  name="VIX Momentum"
                  value={components.vix_momentum}
                  description={`Change ${vix.change > 0 ? '+' : ''}${vix.change}%`}
                  icon={TrendingUp}
                />
                <ComponentCard
                  name="Event Risk"
                  value={components.event_risk}
                  description={next_event ? `${next_event.hours_away}h left` : 'None'}
                  icon={Calendar}
                />
                <ComponentCard
                  name="Stretch"
                  value={components.market_stretch}
                  description="2W Extension"
                  icon={Target}
                />
              </div>
            </div>

            {/* Expected Move */}
            <div className="bg-card/40 border border-white/5 rounded-2xl p-5">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2 text-white/90">
                <Target className="w-4 h-4 text-primary" /> Expected Move (1σ)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl text-center border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Implied %</p>
                  <p className="text-3xl font-bold font-mono text-white">±{expected_move.percent}%</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl text-center border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">S&P 500 Pts</p>
                  <p className="text-3xl font-bold font-mono text-white">±{expected_move.sp500_points}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed text-center">
                Based on VIX/252. Exceeding this range indicates standard deviation expansion.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Tab: VIX Index */}
        <TabsContent value="vix" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* VIX Current */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
              <Activity className="w-10 h-10 mx-auto mb-3 text-primary" />
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Current VIX</p>
              <p className="text-5xl font-bold text-white">{vix.current}</p>
              <p className="text-xs text-primary mt-2 flex items-center justify-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Data
              </p>
            </div>

            {/* VIX Change */}
            <div className={cn(
              "border rounded-2xl p-6 text-center",
              vix.change > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"
            )}>
              {vix.change > 0 ? (
                <ArrowUp className="w-10 h-10 mx-auto mb-3 text-red-400" />
              ) : (
                <ArrowDown className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
              )}
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">24h Change</p>
              <p className={cn(
                "text-4xl font-bold",
                vix.change > 0 ? "text-red-400" : "text-emerald-400"
              )}>
                {vix.change > 0 ? '+' : ''}{vix.change}%
              </p>
            </div>

            {/* VIX Yesterday */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
              <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Previous Close</p>
              <p className="text-4xl font-bold text-muted-foreground">{vix.yesterday}</p>
            </div>
          </div>

          {/* VIX Interpretation */}
          <div className={cn(
            "border rounded-2xl p-5 flex items-center gap-4",
            vix.regime === 'risk-off' ? "bg-red-500/5 border-red-500/20" :
              vix.regime === 'risk-on' ? "bg-emerald-500/5 border-emerald-500/20" : "bg-yellow-500/5 border-yellow-500/20"
          )}>
            <div className={cn("p-3 rounded-full",
              vix.regime === 'risk-off' ? "bg-red-500/20 text-red-400" :
                vix.regime === 'risk-on' ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"
            )}>
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg uppercase tracking-wide mb-1">Regime: {vix.regime.replace('-', ' ')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {vix.regime === 'risk-off' && 'High volatility detected. Hedging recommended. Reduce position sizing.'}
                {vix.regime === 'risk-on' && 'Low volatility environment. Trending strategies favored. Standard risk sizing.'}
                {vix.regime === 'neutral' && 'Mixed signals. Caution advised around key levels.'}
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Asset Risk */}
        <TabsContent value="assets" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(assets).map(([symbol, data]) => (
              <AssetRiskCard
                key={symbol}
                symbol={symbol}
                data={data}
                tilt={asset_tilts[symbol]}
              />
            ))}
          </div>
        </TabsContent>

        {/* Tab: Macro Events */}
        <TabsContent value="events" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-card/40 border border-white/5 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Today's Macro Schedule
            </h3>
            <div className="space-y-2">
              {macro_events?.map((event, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl border transition-colors",
                    event.impact === 'high' ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10" :
                      event.impact === 'medium' ? "bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10" :
                        "bg-white/5 border-white/5 hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-sm font-bold text-white/70">{event.time}</span>
                    <div>
                      <p className="font-medium text-white/90">{event.event}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cons: {event.consensus} • Prev: {event.previous}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                    event.impact === 'high' ? "bg-red-500/20 text-red-400" :
                      event.impact === 'medium' ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-white/10 text-muted-foreground"
                  )}>
                    {event.impact}
                  </span>
                </div>
              ))}
            </div>

            {/* No-Trade Window Warning */}
            <div className="mt-6 p-4 bg-red-500/5 border border-red-500/30 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-red-400">No-Trade Zone Active</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Statistical edge decreases significantly 15 minutes before and after High Impact events. Algorithms dominate liquidity.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
