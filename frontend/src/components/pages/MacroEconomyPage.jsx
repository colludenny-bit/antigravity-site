import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import {
  Globe, Activity, BarChart3, Brain, RefreshCw, Zap, Target,
  Calendar, Layers, Search, TrendingUp, Waves, Clock,
  Gavel, Percent, Briefcase, Landmark, TrendingDown
} from 'lucide-react';
import { useMarket } from '../../contexts/MarketContext';
import { AIService } from '../../services/AIService';
import { MacroService } from '../../services/MacroService';
import { toast } from 'sonner';

// Simplified MacroCard without heavy borders
const MacroCard = ({ title, value, change, subtext, icon: Icon, color = "primary" }) => {
  const isPositive = change >= 0;
  return (
    <div className="bg-white/5 rounded-2xl p-5 border border-white/5 transition-all group">
      <div className="flex justify-between items-start mb-3">
        <div className={cn("p-2 rounded-xl transition-colors",
          color === "gold" ? "bg-yellow-500/10 text-yellow-400" :
            color === "purple" ? "bg-purple-500/10 text-purple-400" :
              color === "red" ? "bg-red-500/10 text-red-400" :
                "bg-primary/10 text-primary"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <div className={cn("px-2.5 py-1 rounded-lg text-xs font-bold", isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
          {isPositive ? '+' : ''}{change?.toFixed(2)}%
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-white/40 font-medium">{title}</p>
        <p className="text-2xl font-bold font-mono tracking-tight">{value?.toLocaleString()}</p>
        {subtext && <p className="text-xs text-white/30">{subtext}</p>}
      </div>
    </div>
  );
};

// Clean Seasonality Grid (No wrapper card, direct grid)
const SeasonalityGrid = ({ title, color, data }) => (
  <div>
    <h4 className="font-medium text-sm mb-3 flex items-center gap-2 px-1">
      <span className={cn("w-2 h-2 rounded-full", color)}></span>
      {title}
    </h4>
    <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
        const val = data[i];
        // Using exact colors from previous snippet if possible, effectively re-creating the logic
        const isStrong = val > 1.0;
        const isWeak = val < -0.8;
        return (
          <div key={m} className={cn(
            "text-center p-2 rounded-lg text-xs transition-colors",
            isStrong ? "bg-emerald-500/20 text-emerald-400" :
              isWeak ? "bg-red-500/20 text-red-400" :
                "bg-white/5 text-white/40"
          )}>
            <div className="font-bold mb-0.5">{m}</div>
            <div>{val > 0 ? '+' : ''}{val}%</div>
          </div>
        );
      })}
    </div>
  </div>
);

export default function MacroEconomyPage() {
  const { marketData } = useMarket();
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [fundamentals, setFundamentals] = useState(null);

  React.useEffect(() => {
    const loadFundamentals = async () => {
      const data = await MacroService.getFundamentals();
      setFundamentals(data);
    };
    loadFundamentals();
  }, []);

  const indices = marketData.macro || {
    SPX: { price: 0, change: 0 },
    NDX: { price: 0, change: 0 },
    XAU: { price: 0, change: 0 },
    VIX: { price: 0, change: 0 }
  };

  const runAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const keys = JSON.parse(localStorage.getItem('karion_api_keys') || '{}');
      const analysis = await AIService.analyzeMarket({
        context: "Macro & Indices",
        spx: indices.SPX,
        ndx: indices.NDX,
        gold: indices.XAU,
        vix: indices.VIX
      }, keys.openai);

      setAiAnalysis(analysis);
      toast.success('Analisi Macro completata!');
    } catch (error) {
      toast.error('Errore analisi AI');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 fade-in" data-testid="macro-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" />
            Macro Dashboard
          </h1>
          <p className="text-white/50 mt-1">
            Global Markets Overview & Intelligence
          </p>
        </div>

        <Button
          onClick={runAIAnalysis}
          disabled={analyzing}
          className={cn(
            "rounded-xl gap-2 h-10 px-6 font-medium shadow-lg shadow-primary/20",
            analyzing ? "bg-primary/50" : "bg-gradient-to-r from-primary to-purple-500 hover:scale-105 transition-transform"
          )}
        >
          {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {analyzing ? "Analizzando..." : "AI Report"}
        </Button>
      </motion.div>

      {/* Live Fundamentals Grid - Dashboard Consistent Typography */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { key: 'FED_RATE', icon: Gavel, color: "text-[#00D9A5]" },
          { key: 'CPI_YOY', icon: TrendingDown, color: "text-[#FF3B30]" },
          { key: 'US10Y', icon: Percent, color: "text-[#FF9F0A]" },
          { key: 'GDP_QOQ', icon: Landmark, color: "text-[#32D74B]" },
          { key: 'UNEMPLOYMENT', icon: Briefcase, color: "text-[#BF5AF2]" }
        ].map((item) => {
          const data = fundamentals?.[item.key];
          return (
            <div key={item.key} className="bg-[#0B0F17]/60 backdrop-blur-md rounded-2xl p-6 border border-white/5 transition-all hover:border-white/10 group relative overflow-hidden">
              {/* Subtle gradient glow based on trend */}
              <div className={cn("absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-10 pointer-events-none",
                data?.trend === 'down' ? "bg-red-500" : "bg-primary"
              )} />

              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  {/* LABEL: Text-BASE (Larger), White, Black Weight, Uppercase Tracking-Widest */}
                  <p className="text-base font-black text-white uppercase tracking-widest leading-none shadow-black drop-shadow-md mb-1">{data?.name || "LOADING"}</p>
                </div>

                <div className="flex items-baseline gap-2">
                  {/* VALUE: 4XL (Larger), Black Weight, Green Color */}
                  <p className="text-4xl font-black tracking-tight text-[#00D9A5] leading-none">{data?.value}</p>
                  <p className="text-base font-bold text-[#00D9A5]">{data?.suffix}</p>
                </div>

                {/* Trend Indicator - Maximum Visibility */}
                {data?.trend && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]",
                      data.trend === 'up' ? "bg-emerald-500 text-emerald-500" :
                        data.trend === 'down' ? "bg-red-500 text-red-500" : "bg-gray-400 text-gray-400"
                    )} />
                    <span className={cn(
                      "text-xs font-black uppercase tracking-widest",
                      data.trend === 'up' ? "text-emerald-400" :
                        data.trend === 'down' ? "text-red-400" : "text-gray-400"
                    )}>
                      {data.trend} Trend
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Panel */}
      <AnimatePresence>
        {aiAnalysis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full" />
              <div className="flex items-start gap-4 relative z-10">
                <div className="p-3 bg-primary/20 rounded-xl">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-primary">Karion Macro Insight</h3>
                  <p className="text-sm text-white/90 leading-relaxed font-medium">"{aiAnalysis.text}"</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TABS - Transparent Background as requested */}
      <Tabs defaultValue="seasonality" className="space-y-6">
        <TabsList className="bg-transparent p-0 flex gap-6 border-b border-white/5 w-full justify-start h-auto rounded-none">
          <TabsTrigger value="seasonality" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <Calendar className="w-4 h-4 mr-2" /> Seasonality
          </TabsTrigger>
          <TabsTrigger value="sectors" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <Layers className="w-4 h-4 mr-2" /> Sectors
          </TabsTrigger>
          <TabsTrigger value="news" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <RefreshCw className="w-4 h-4 mr-2" /> Live News
          </TabsTrigger>
          <TabsTrigger value="volatility" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-transparent data-[state=active]:shadow-none rounded-none px-0 py-3 text-base text-muted-foreground data-[state=active]:text-primary bg-transparent border-b-2 border-transparent transition-all">
            <Activity className="w-4 h-4 mr-2" /> Volatility & Bias
          </TabsTrigger>
        </TabsList>

        {/* Seasonality Content - CLEAN LIST layout */}
        <TabsContent value="seasonality" className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
          {/* S&P 500 */}
          <SeasonalityGrid
            title="S&P 500"
            color="bg-blue-500"
            data={[0.5, 0.2, 1.1, 1.5, 0.2, -0.1, 0.8, -0.5, -1.0, 0.9, 1.8, 1.4]}
          />

          {/* NASDAQ */}
          <SeasonalityGrid
            title="NASDAQ 100"
            color="bg-purple-500"
            data={[1.2, 0.5, 0.9, 1.8, 0.4, 0.2, 1.5, -0.2, -1.5, 1.2, 2.1, 1.9]}
          />

          {/* Gold */}
          <SeasonalityGrid
            title="Gold (XAU)"
            color="bg-yellow-500"
            data={[2.1, 1.5, -0.5, 0.8, -0.2, -0.4, 0.5, 1.9, 0.2, -1.1, 0.4, 1.2]}
          />
        </TabsContent>

        {/* Sectors Content */}
        <TabsContent value="sectors" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Technology', val: '+1.2%', trend: 'up' },
              { name: 'Energy', val: '-0.5%', trend: 'down' },
              { name: 'Financials', val: '+0.3%', trend: 'up' },
              { name: 'Healthcare', val: '-0.1%', trend: 'down' },
              { name: 'Utilities', val: '+0.8%', trend: 'up' },
              { name: 'Consumer Disc.', val: '+0.9%', trend: 'up' },
              { name: 'Real Estate', val: '-1.5%', trend: 'down' },
              { name: 'Materials', val: '+0.2%', trend: 'up' },
            ].map(s => (
              <div key={s.name} className="bg-white/5 rounded-xl p-4 border border-transparent hover:border-white/10 transition-colors">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm text-white/70">{s.name}</span>
                  <span className={s.trend === 'up' ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{s.val}</span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Live News Content */}
        <TabsContent value="news" className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
            {(marketData.news || []).map((news) => (
              <div key={news.id} className="p-4 bg-white/5 rounded-xl flex justify-between items-center hover:bg-white/10 transition-colors cursor-default border border-transparent hover:border-white/5">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-white/30 font-mono tracking-wide">{news.time}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                      news.sentiment === 'Bullish' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    )}>{news.sentiment}</span>
                  </div>
                  <p className="font-medium text-sm text-white/90 leading-snug">{news.title}</p>
                </div>
                {news.impact === 'High' && <TrendingUp className="w-4 h-4 text-red-400 ml-4 shrink-0" />}
              </div>
            ))}
            {marketData.news?.length === 0 && <div className="text-center text-white/20 py-10">Waiting for live news...</div>}
          </div>
        </TabsContent>

        {/* Volatility & Bias Content - PREMIUM TECHNICAL RESTORED */}
        <TabsContent value="volatility" className="space-y-8 animate-in fade-in slide-in-from-bottom-2">

          {/* Section 1: Market Structure (Weekly & Daily) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* LEFT: Weekly Phases Container */}
            <div className="lg:col-span-4 bg-[#0B0F17]/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                <Calendar className="w-5 h-5 text-[#00D9A5]" />
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Ciclo Settimanale</h3>
              </div>

              <div className="space-y-3 flex-1">
                {[
                  { id: '01', status: 'Accumulazione', sub: 'Range Stretto', active: false },
                  { id: '02', status: 'Slancio', sub: 'Inizio Trend', active: true },
                  { id: '03', status: 'Continuazione', sub: 'Trend Sostenuto', active: false },
                  { id: '04', status: 'Esaurimento', sub: 'Presa di Liquidità', active: false }
                ].map((w, i) => (
                  <div key={i} className={cn(
                    "relative p-4 rounded-xl border transition-all duration-300",
                    w.active
                      ? "bg-[#00D9A5]/10 border-[#00D9A5] shadow-[0_0_15px_rgba(0,217,165,0.1)]"
                      : "bg-white/5 border-transparent hover:bg-white/10"
                  )}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={cn("text-xs font-bold uppercase tracking-widest", w.active ? "text-[#00D9A5]" : "text-white/40")}>Week {w.id}</span>
                      {w.active && <div className="w-1.5 h-1.5 rounded-full bg-[#00D9A5] animate-pulse"></div>}
                    </div>
                    <div className="text-lg font-bold text-white leading-none mb-1">{w.status}</div>
                    <div className="text-xs text-white/50">{w.sub}</div>
                  </div>
                ))}
              </div>

              {/* Insight Box */}
              <div className="mt-6 p-4 rounded-xl bg-[#00D9A5]/5 border border-[#00D9A5]/10">
                <div className="text-[10px] font-bold text-[#00D9A5]/70 uppercase tracking-widest mb-1">System Insight</div>
                <p className="text-xs text-white/80 leading-relaxed font-medium">
                  Bias settimanale rialzista confermato dal flusso ordini istituzionale.
                </p>
              </div>
            </div>

            {/* RIGHT: Daily Bias Grid */}
            <div className="lg:col-span-8 bg-[#0B0F17]/60 backdrop-blur-md border border-white/5 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-[#BF5AF2]" />
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Bias Giornaliero</h3>
                </div>
                <div className="px-3 py-1 bg-[#00D9A5]/10 rounded-full text-[#00D9A5] text-[10px] font-bold uppercase tracking-wider border border-[#00D9A5]/20">
                  Live Session
                </div>
              </div>

              <div className="grid grid-cols-5 gap-4">
                {[
                  { d: 'LUN', title: 'Ranging', desc: 'Espansione post-sbilancio', active: false },
                  { d: 'MAR', title: 'Accumulo', desc: 'O Ribilanciamento', active: false },
                  { d: 'MER', title: 'Espansione', desc: 'In Ribilanciamento', active: false },
                  { d: 'GIO', title: 'Accumulo', desc: 'O Ribilanciamento', active: false },
                  { d: 'VEN', title: 'Inversione', desc: 'Espansione o Reversal', active: true }
                ].map((d, i) => (
                  <div key={i} className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all h-full min-h-[140px]",
                    d.active
                      ? "bg-gradient-to-b from-[#00D9A5]/20 to-[#00D9A5]/5 border-[#00D9A5] shadow-[0_0_20px_rgba(0,217,165,0.15)] scale-105 z-10"
                      : "bg-white/5 border-white/5 hover:bg-white/10 opacity-70 hover:opacity-100"
                  )}>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest mb-3", d.active ? "text-[#00D9A5]" : "text-white/30")}>{d.d}</span>
                    <span className={cn("text-base font-bold leading-tight mb-2", d.active ? "text-white" : "text-white/80")}>{d.title}</span>
                    <span className="text-[9px] text-white/50 leading-relaxed max-w-[80px]">{d.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Volatility Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Heatmap */}
            <div className="lg:col-span-2 bg-[#0B0F17]/60 backdrop-blur-md border border-white/5 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Mappa Volatilità Oraria</h3>
                  <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wide">Analisi Volume 24H (Media 10W)</p>
                </div>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] text-white/50 font-medium bg-white/5 px-2 py-1 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00D9A5]/30"></div> Bassa
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-white/50 font-medium bg-white/5 px-2 py-1 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00D9A5]"></div> Alta
                  </span>
                </div>
              </div>

              <div className="w-full">
                <div className="grid grid-cols-24 gap-1 h-[80px]">
                  {Array.from({ length: 24 }).map((_, i) => {
                    const val = [15, 10, 12, 8, 25, 45, 60, 85, 90, 75, 60, 40, 30, 25, 35, 45, 65, 95, 80, 50, 30, 20, 15, 10][i];
                    return (
                      <div key={i} className="flex flex-col gap-1 items-center group relative h-full justify-end">
                        <div
                          className="w-full rounded-t-sm rounded-b-[1px] transition-all duration-500 hover:brightness-125"
                          style={{
                            height: `${val}%`,
                            backgroundColor: val > 60 ? '#00D9A5' : 'rgba(0, 217, 165, 0.3)',
                            opacity: val > 60 ? 1 : 0.5
                          }}
                        />
                        <span className="text-[9px] font-medium text-white/30 absolute -bottom-5">{i}</span>

                        {/* Hover Tooltip */}
                        <div className="absolute -top-10 bg-[#1A1D24] border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-20">
                          {i}:00 <span className="text-[#00D9A5] ml-1">{val}% Vol</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between mt-6 px-1 pt-4 border-t border-white/5">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Sessione Asiatica</span>
                  <span className="text-[10px] font-bold text-[#00D9A5]/50 uppercase tracking-widest">Londra</span>
                  <span className="text-[10px] font-bold text-[#BF5AF2]/50 uppercase tracking-widest">New York</span>
                </div>
              </div>
            </div>

            {/* Risk Meters */}
            <div className="bg-[#0B0F17]/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-col">
              <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">Rischio ADR Giornaliero</h3>

              <div className="space-y-5 flex-1 overflow-y-auto pr-1">
                {[
                  { p: 'XAU/USD', v: 82, l: 'HIGH', c: 'text-[#FF9F0A]', b: 'bg-[#FF9F0A]' },
                  { p: 'BTC/USD', v: 95, l: 'EXTREME', c: 'text-[#FF3B30]', b: 'bg-[#FF3B30]' },
                  { p: 'EUR/USD', v: 45, l: 'NORMAL', c: 'text-[#00D9A5]', b: 'bg-[#00D9A5]' },
                  { p: 'US30', v: 67, l: 'ELEVATED', c: 'text-[#FF9F0A]', b: 'bg-[#FF9F0A]' },
                  { p: 'SPX500', v: 22, l: 'LOW', c: 'text-[#00D9A5]', b: 'bg-[#00D9A5]' },
                ].map((m, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between text-xs font-bold text-white mb-2">
                      <span>{m.p}</span>
                      <span className={m.c}>{m.v}% / ADR</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${m.v}%` }}
                        className={cn("h-full rounded-full transition-all duration-1000", m.b)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </TabsContent>

      </Tabs>
    </div >
  );
}
