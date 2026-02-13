import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import {
  Bitcoin, TrendingUp, TrendingDown, Activity, Wallet,
  ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp,
  Waves, BarChart3, PieChart, Globe, Code, MessageCircle,
  AlertTriangle, Zap, Search, RefreshCw, Shield, Maximize2, Minimize2,
  ExternalLink, Clock, Users, Scale, Brain, Target,
  Flame, DollarSign, Hash, Layers, GitCommit, Info, X, Lightbulb
} from 'lucide-react';
import { TechCard } from '../ui/TechCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { MarketService } from '../../services/MarketService';
import { CryptoOnChainService } from '../../services/CryptoOnChainService';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart as RPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ─── Helper / Formatters ───
const fmt = (n, dec = 2) => {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(dec)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(dec)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(dec)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(dec)}`;
};
const pct = (n) => n ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—';
const pctColor = (n) => n >= 0 ? 'text-[#00D9A5]' : 'text-red-400';

// ─── Stat Card ───
const StatCard = ({ label, value, change, icon: Icon, iconColor = '#00D9A5' }) => (
  <TechCard className="p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
      {Icon && <Icon className="w-4 h-4" style={{ color: iconColor }} />}
    </div>
    <p className="text-xl font-bold text-white font-apple">{value}</p>
    {change !== undefined && (
      <span className={cn("text-xs font-medium", pctColor(change))}>{pct(change)}</span>
    )}
  </TechCard>
);

// ─── Bias Score Badge ───
const BiasScoreBadge = ({ score, signal }) => {
  const color = signal === 'BULLISH' ? '#00D9A5' : signal === 'BEARISH' ? '#EF4444' : '#F59E0B';
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-2xl" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round"
            className="transition-all duration-1000 ease-out" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-black" style={{ color }}>{score}</span>
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Bias Score</p>
        <p className="text-lg font-black" style={{ color }}>{signal}</p>
      </div>
    </div>
  );
};

// ─── Custom Tooltip ───
const CustomTooltip = ({ active, payload, label, prefix = '$' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1C1F26] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-[10px] text-white/40 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-bold" style={{ color: p.color || '#00D9A5' }}>
          {p.name}: {prefix}{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB 1: OVERVIEW
// ═══════════════════════════════════════════════════════════
const OverviewTab = ({ coin, chartData, globalData, mvrvData }) => {
  const [chartRange, setChartRange] = useState('7');
  const [mvrvZoomed, setMvrvZoomed] = useState(false);
  const [mvrvTimeframe, setMvrvTimeframe] = useState('1M');
  const [showPriceOverlay, setShowPriceOverlay] = useState(true);
  const [localMvrvData, setLocalMvrvData] = useState(mvrvData);
  const [showMvrvInfo, setShowMvrvInfo] = useState(false);
  const [showPriceInfo, setShowPriceInfo] = useState(false);

  // Re-fetch MVRV when timeframe changes
  useEffect(() => {
    if (coin?.symbol) {
      const data = CryptoOnChainService.getMVRV(coin.symbol.toUpperCase(), mvrvTimeframe);
      setLocalMvrvData(data);
    }
  }, [mvrvTimeframe, coin?.symbol]);

  // Sync parent mvrvData on initial load
  useEffect(() => { if (mvrvData) setLocalMvrvData(mvrvData); }, [mvrvData]);

  const activeMvrv = localMvrvData || mvrvData;

  const priceHistory = useMemo(() => {
    if (!chartData?.prices) return [];
    return chartData.prices.map(([ts, price]) => ({
      date: new Date(ts).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
      price: parseFloat(price.toFixed(2))
    }));
  }, [chartData]);

  if (!coin) return <div className="text-white/40 text-center py-20">Seleziona un asset...</div>;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Prezzo" value={coin.current_price ? fmt(coin.current_price) : '—'} change={coin.price_change_percentage_24h} icon={DollarSign} />
        <StatCard label="Market Cap" value={fmt(coin.market_cap)} icon={Layers} />
        <StatCard label="Volume 24h" value={fmt(coin.total_volume)} icon={BarChart3} />
        <StatCard label="Circulating Supply" value={coin.circulating_supply ? `${(coin.circulating_supply / 1e6).toFixed(2)}M` : '—'} icon={Hash} iconColor="#F59E0B" />
      </div>

      {/* Price Chart */}
      <TechCard className="p-5 relative">
        {/* ─── Price History Info Tooltip — Apple Genie Style ─── */}
        <AnimatePresence>
          {showPriceInfo && (
            <motion.div
              initial={{ opacity: 0, scale: 0, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0, y: -20 }}
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 25,
                mass: 0.6
              }}
              style={{ transformOrigin: 'top left', willChange: 'transform, opacity, filter' }}
              className="absolute inset-3 z-50 bg-[#0F1115]/20 backdrop-blur-[6px] rounded-[24px]"
            >
              <div className="relative px-8 py-6 border border-[#00D9A5]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
                <div className="flex items-center justify-between mb-5">
                  <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida Price History</h4>
                  <button onClick={() => setShowPriceInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                    <X className="w-5 h-5 text-white/50" />
                  </button>
                </div>
                <div className="space-y-5 text-left">
                  <p className="text-lg text-white leading-relaxed font-normal">
                    Il <span className="text-[#00D9A5] font-semibold">Price History</span> mostra l'andamento del prezzo dell'asset nel periodo selezionato (7, 30 o 90 giorni). Permette di identificare trend, supporti, resistenze e pattern di prezzo rilevanti per il trading.
                  </p>

                  <div className="pt-5 border-t border-white/10">
                    <div className="flex items-center justify-center gap-2 mb-5">
                      <BarChart3 className="w-5 h-5 text-[#00D9A5]" style={{ filter: 'drop-shadow(0 0 6px #00D9A5)' }} />
                      <p className="text-base font-bold text-white uppercase tracking-[0.15em]">Come leggere i dati</p>
                    </div>
                    <ul className="space-y-4 text-left">
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold">Trend rialzista:</span> Quando la linea sale costantemente con minimi crescenti, il mercato è in fase <span className="text-[#00D9A5] font-semibold">bullish</span>. Cercare pullback su supporti per ingressi.
                        </p>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_#EF4444] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold">Trend ribassista:</span> Massimi decrescenti e rottura dei supporti indicano fase <span className="text-red-400 font-semibold">bearish</span>. Ridurre esposizione o attendere conferme di inversione.
                        </p>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_#FACC15] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold">Consolidamento:</span> Prezzo in <span className="text-yellow-400 font-semibold">range laterale</span> indica indecisione. Un breakout con volume confermerà la prossima direzione.
                        </p>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-5 border-t border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-5 h-5 text-[#00D9A5]" style={{ filter: 'drop-shadow(0 0 6px #00D9A5)' }} />
                      <p className="text-base font-bold text-white uppercase tracking-[0.15em]">Consiglio</p>
                    </div>
                    <p className="text-lg text-white/90 leading-relaxed font-normal">
                      Usa i timeframe 7d per swing trading, 30d per trend di medio termine e 90d per confermare la fase di mercato. Confronta sempre il prezzo con gli indicatori on-chain (MVRV, whale flow) per decisioni più informate.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00D9A5]" />
            <span className="text-sm font-bold text-white/90">Price History</span>
            {/* Info Button */}
            <button
              onClick={() => setShowPriceInfo(!showPriceInfo)}
              className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
            >
              <Info className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <div className="flex gap-1">
            {['7', '30', '90'].map(d => (
              <button key={d} onClick={() => setChartRange(d)}
                className={cn("px-3 py-1 rounded-lg text-xs font-medium transition-all",
                  chartRange === d ? "bg-[#00D9A5]/15 text-[#00D9A5] border border-[#00D9A5]/30" : "bg-white/5 text-white/40 hover:bg-white/10"
                )}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceHistory}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D9A5" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00D9A5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={true} vertical={true} />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false}
                domain={['auto', 'auto']} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="price" stroke="#00D9A5" strokeWidth={2} fill="url(#priceGrad)" name="Price" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </TechCard>

      {/* ─── Mini Charts Section (Dashboard Screening Style) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MVRV Ratio Mini Chart — Technical */}
        <TechCard className={cn("p-4 transition-all duration-300 relative", mvrvZoomed && "md:col-span-3")}>
          {/* ─── MVRV Info Tooltip — Apple Genie Style ─── */}
          <AnimatePresence>
            {showMvrvInfo && (
              <motion.div
                initial={{ opacity: 0, scale: 0, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0, y: -20 }}
                transition={{
                  type: "spring",
                  stiffness: 350,
                  damping: 25,
                  mass: 0.6
                }}
                style={{ transformOrigin: 'top left', willChange: 'transform, opacity, filter' }}
                className="absolute inset-3 z-50 bg-[#0F1115]/20 backdrop-blur-[6px] rounded-[24px]"
              >
                <div className="relative px-8 py-6 border border-[#F59E0B]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
                  <div className="flex items-center justify-between mb-5">
                    <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida MVRV</h4>
                    <button onClick={() => setShowMvrvInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                      <X className="w-5 h-5 text-white/50" />
                    </button>
                  </div>
                  <div className="space-y-5 text-left">
                    <p className="text-lg text-white leading-relaxed font-normal">
                      Il <span className="text-[#F59E0B] font-semibold">MVRV (Market Value to Realized Value)</span> misura il rapporto tra la capitalizzazione di mercato e quella realizzata. Indica se gli holder sono mediamente in profitto o in perdita, rivelando le fasi di <span className="text-white/90 italic">euforia</span> e <span className="text-white/90 italic">capitolazione</span> del mercato.
                    </p>

                    <div className="pt-5 border-t border-white/10">
                      <div className="flex items-center justify-center gap-2 mb-5">
                        <BarChart3 className="w-5 h-5 text-[#F59E0B]" style={{ filter: 'drop-shadow(0 0 6px #F59E0B)' }} />
                        <p className="text-base font-bold text-white uppercase tracking-[0.15em]">Come leggere i dati</p>
                      </div>
                      <ul className="space-y-4 text-left">
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_#EF4444] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold">MVRV &gt; 3.7:</span> Zona di <span className="text-red-400 font-semibold">top storico</span>. Gli holder sono in forte profitto — alta probabilità di distribuzione e correzione imminente.
                          </p>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_#FACC15] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold">MVRV 1.0 – 3.7:</span> <span className="text-yellow-400 font-semibold">Zona neutra</span>. Mercato in fase di equilibrio tra accumulazione e distribuzione. Trend da confermare con altri indicatori.
                          </p>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold">MVRV &lt; 1.0:</span> Zona di <span className="text-[#00D9A5] font-semibold">bottom storico</span>. Gli holder sono mediamente in perdita — zona di accumulazione ideale per posizioni long-term.
                          </p>
                        </li>
                      </ul>
                    </div>

                    <div className="pt-5 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="w-5 h-5 text-[#F59E0B]" style={{ filter: 'drop-shadow(0 0 6px #F59E0B)' }} />
                        <p className="text-base font-bold text-white uppercase tracking-[0.15em]">Consiglio</p>
                      </div>
                      <p className="text-lg text-white/90 leading-relaxed font-normal">
                        Utilizza il MVRV come filtro macro: evita ingressi Long quando MVRV supera 3.5 e cerca accumulazione sotto 1.2. Incrocia sempre con il prezzo (linea cyan) per confermare divergenze tra valore di mercato e valore realizzato.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header row */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#F59E0B]" />
              <span className="text-sm font-bold text-white/90">MVRV Ratio</span>
              {/* Info Button */}
              <button
                onClick={() => setShowMvrvInfo(!showMvrvInfo)}
                className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
              >
                <Info className="w-3.5 h-3.5 text-white" />
              </button>
              {activeMvrv && (
                <span className={cn("text-xs font-black px-2 py-0.5 rounded-lg",
                  activeMvrv.value > 3.7 ? "bg-red-500/15 text-red-400" :
                    activeMvrv.value < 1 ? "bg-[#00D9A5]/15 text-[#00D9A5]" :
                      "bg-yellow-500/15 text-yellow-400"
                )}>{activeMvrv.value}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Price overlay toggle */}
              <button onClick={() => setShowPriceOverlay(!showPriceOverlay)}
                className={cn("px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1",
                  showPriceOverlay ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "bg-white/5 text-white/30 hover:bg-white/10"
                )}>
                <DollarSign className="w-3 h-3" />Price
              </button>
              <button onClick={() => setMvrvZoomed(!mvrvZoomed)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white/70">
                {mvrvZoomed ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {/* Timeframe selector */}
          <div className="flex items-center gap-1 mb-3">
            {['1D', '1W', '1M', '1Y', 'ALL'].map(tf => (
              <button key={tf} onClick={() => setMvrvTimeframe(tf)}
                className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider transition-all",
                  mvrvTimeframe === tf ? "bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30" : "bg-white/5 text-white/30 hover:bg-white/10"
                )}>
                {tf}
              </button>
            ))}
            <div className="flex-1" />
            {/* Signal zones legend */}
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-[9px] text-white/30">&gt;3.7</span></div>
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-yellow-400" /><span className="text-[9px] text-white/30">1-3.7</span></div>
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#00D9A5]" /><span className="text-[9px] text-white/30">&lt;1</span></div>
            </div>
          </div>
          {/* Chart */}
          <div className={cn("transition-all duration-300", mvrvZoomed ? "h-[360px]" : "h-[160px]")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeMvrv?.history} margin={{ top: 5, right: showPriceOverlay ? 50 : 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="mvrvGradOver" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="priceGradMvrv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={true} vertical={true} />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 9 }} axisLine={false} tickLine={false}
                  interval={mvrvZoomed ? 'preserveStartEnd' : Math.max(Math.floor((activeMvrv?.history?.length || 10) / 5), 1)} />
                <YAxis yAxisId="mvrv" domain={[0, 5]} tick={{ fill: '#F59E0B', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false}
                  ticks={[0, 1, 2, 3, 3.7, 5]} width={30} />
                {showPriceOverlay && (
                  <YAxis yAxisId="price" orientation="right" tick={{ fill: '#22D3EE', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false}
                    domain={['auto', 'auto']} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)} width={45} />
                )}
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-[#1C1F26] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
                      <p className="text-[10px] text-white/40 mb-1">{label}</p>
                      {payload.map((p, i) => (
                        <p key={i} className="text-xs font-bold" style={{ color: p.color }}>
                          {p.name}: {p.name === 'Price' ? `$${p.value.toLocaleString()}` : p.value}
                        </p>
                      ))}
                    </div>
                  );
                }} />
                {/* Reference lines at 3.7 and 1.0 */}
                <Area yAxisId="mvrv" type="monotone" dataKey={() => 3.7} stroke="#EF444466" strokeWidth={1} strokeDasharray="4 4" fill="none" name="" legendType="none" tooltipType="none" />
                <Area yAxisId="mvrv" type="monotone" dataKey={() => 1.0} stroke="#00D9A566" strokeWidth={1} strokeDasharray="4 4" fill="none" name="" legendType="none" tooltipType="none" />
                {/* MVRV Line */}
                <Area yAxisId="mvrv" type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2} fill="url(#mvrvGradOver)" name="MVRV"
                  dot={false} activeDot={{ r: 3, fill: '#F59E0B', stroke: '#0F1115', strokeWidth: 2 }} />
                {/* Price overlay */}
                {showPriceOverlay && (
                  <Area yAxisId="price" type="monotone" dataKey="price" stroke="#22D3EE" strokeWidth={1.5} fill="url(#priceGradMvrv)" name="Price"
                    dot={false} activeDot={{ r: 3, fill: '#22D3EE', stroke: '#0F1115', strokeWidth: 2 }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Bottom: signal only */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-[9px] text-white/30">&gt;3.7 Top</span></div>
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#00D9A5]" /><span className="text-[9px] text-white/30">&lt;1 Bottom</span></div>
            </div>
            <span className={cn("text-[10px] font-bold uppercase tracking-widest",
              activeMvrv?.signal === 'overvalued' ? "text-red-400" :
                activeMvrv?.signal === 'undervalued' ? "text-[#00D9A5]" : "text-yellow-400"
            )}>{activeMvrv?.signal}</span>
          </div>
        </TechCard>

        {/* Placeholder per futuri mini charts */}
        <TechCard className="p-4 flex items-center justify-center min-h-[240px] opacity-30">
          <div className="text-center">
            <BarChart3 className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <span className="text-xs text-white/30">Coming soon...</span>
          </div>
        </TechCard>
        <TechCard className="p-4 flex items-center justify-center min-h-[240px] opacity-30">
          <div className="text-center">
            <BarChart3 className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <span className="text-xs text-white/30">Coming soon...</span>
          </div>
        </TechCard>
      </div>

      {/* On-Chain Basics + Global */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="ATH" value={coin.ath ? fmt(coin.ath) : '—'} change={coin.ath_change_percentage} icon={TrendingUp} />
        <StatCard label="ATL" value={coin.atl ? fmt(coin.atl) : '—'} icon={TrendingDown} iconColor="#EF4444" />
        <StatCard label="Circulating Supply" value={coin.circulating_supply ? `${(coin.circulating_supply / 1e6).toFixed(1)}M` : '—'} icon={Hash} />
        <StatCard label="Max Supply" value={coin.max_supply ? `${(coin.max_supply / 1e6).toFixed(1)}M` : '∞'} icon={Shield} />
      </div>

      {/* Global Market */}
      {globalData && (
        <TechCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-[#00D9A5]" />
            <span className="text-sm font-bold text-white/90">Global Market</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><span className="text-[10px] text-white/40 uppercase block">Total Market Cap</span>
              <span className="text-sm font-bold text-white">{fmt(globalData.total_market_cap?.usd)}</span></div>
            <div><span className="text-[10px] text-white/40 uppercase block">24h Volume</span>
              <span className="text-sm font-bold text-white">{fmt(globalData.total_volume?.usd)}</span></div>
            <div><span className="text-[10px] text-white/40 uppercase block">BTC Dominance</span>
              <span className="text-sm font-bold text-[#F59E0B]">{globalData.market_cap_percentage?.btc?.toFixed(1)}%</span></div>
            <div><span className="text-[10px] text-white/40 uppercase block">Active Cryptos</span>
              <span className="text-sm font-bold text-white">{globalData.active_cryptocurrencies?.toLocaleString()}</span></div>
          </div>
        </TechCard>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB 2: WHALES
// ═══════════════════════════════════════════════════════════
const WhalesTab = ({ symbol, whaleTxs, netflowData, topWallets }) => {
  if (!symbol) return null;

  return (
    <div className="space-y-4">
      {/* Whale Transactions Table */}
      <TechCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white/90">Whale Transactions (&gt;$1M)</span>
          </div>
          <span className="text-[10px] text-white/30 uppercase">Last 72h • {symbol}</span>
        </div>
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0F1115] z-10">
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-white/40 font-medium">Amount</th>
                <th className="text-left py-2 text-white/40 font-medium">From</th>
                <th className="text-left py-2 text-white/40 font-medium">To</th>
                <th className="text-left py-2 text-white/40 font-medium">Type</th>
                <th className="text-right py-2 text-white/40 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {whaleTxs?.map((tx) => (
                <tr key={tx.id} className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", tx.isAlert && "bg-red-500/5")}>
                  <td className="py-2 font-bold text-white">{tx.amountFormatted}
                    {tx.isAlert && <Zap className="w-3 h-3 text-yellow-400 inline ml-1" />}
                  </td>
                  <td className="py-2 text-white/60">{tx.from}</td>
                  <td className="py-2 text-white/60">{tx.to}</td>
                  <td className="py-2">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                      tx.type === 'exchange_deposit' ? "bg-red-500/10 text-red-400" :
                        tx.type === 'exchange_withdrawal' ? "bg-[#00D9A5]/10 text-[#00D9A5]" :
                          "bg-white/5 text-white/50"
                    )}>{tx.type.replace('_', ' ')}</span>
                  </td>
                  <td className="py-2 text-right text-white/40">{new Date(tx.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TechCard>

      {/* Netflow Chart */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-[#00D9A5]" />
          <span className="text-sm font-bold text-white/90">Exchange Netflow (14d)</span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={netflowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip prefix="" />} />
              <Bar dataKey="netflow" name="Netflow">
                {netflowData?.map((entry, i) => (
                  <Cell key={i} fill={entry.netflow >= 0 ? '#EF4444' : '#00D9A5'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-white/30 mt-2 text-center">Rosso = inflow exchange (sell pressure) • Verde = outflow (accumulation)</p>
      </TechCard>

      {/* Top Wallets */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-4 h-4 text-[#F59E0B]" />
          <span className="text-sm font-bold text-white/90">Top Wallets — PnL Leaderboard</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-white/40">#</th>
                <th className="text-left py-2 text-white/40">Address</th>
                <th className="text-left py-2 text-white/40">Label</th>
                <th className="text-right py-2 text-white/40">Balance</th>
                <th className="text-right py-2 text-white/40">PnL</th>
              </tr>
            </thead>
            <tbody>
              {topWallets?.map((w) => (
                <tr key={w.rank} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-2 text-white/40">{w.rank}</td>
                  <td className="py-2 text-white/60 font-mono text-[10px]">{w.address}</td>
                  <td className="py-2">{w.label ? <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[10px]">{w.label}</span> : '—'}</td>
                  <td className="py-2 text-right font-bold text-white">{w.balance}</td>
                  <td className={cn("py-2 text-right font-bold", w.pnl >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{w.pnl >= 0 ? '+' : ''}{w.pnl.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TechCard>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB 3: ON-CHAIN FLOWS
// ═══════════════════════════════════════════════════════════
const OnChainTab = ({ symbol, flowData, holderDist, mvrvData, soprData }) => {
  if (!symbol) return null;

  return (
    <div className="space-y-4">
      {/* Exchange Flows */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpRight className="w-4 h-4 text-red-400" />
          <span className="text-sm font-bold text-white/90">Exchange Inflow / Outflow (30d)</span>
        </div>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={flowData}>
              <defs>
                <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.3} /><stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D9A5" stopOpacity={0.3} /><stop offset="100%" stopColor="#00D9A5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip prefix="" />} />
              <Area type="monotone" dataKey="inflow" stroke="#EF4444" fill="url(#inflowGrad)" strokeWidth={2} name="Inflow" />
              <Area type="monotone" dataKey="outflow" stroke="#00D9A5" fill="url(#outflowGrad)" strokeWidth={2} name="Outflow" />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </TechCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Holder Distribution */}
        <TechCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[#00D9A5]" />
            <span className="text-sm font-bold text-white/90">Holder Distribution</span>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <RPieChart>
                <Pie data={holderDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {holderDist?.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip prefix="" />} />
              </RPieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {holderDist?.map((h, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }} />
                <span className="text-[10px] text-white/50">{h.name}: {h.value}%</span>
              </div>
            ))}
          </div>
        </TechCard>

        {/* MVRV Gauge */}
        <TechCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#F59E0B]" />
              <span className="text-sm font-bold text-white/90">MVRV Ratio</span>
            </div>
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded",
              mvrvData?.signal === 'overvalued' ? "bg-red-500/10 text-red-400" :
                mvrvData?.signal === 'undervalued' ? "bg-[#00D9A5]/10 text-[#00D9A5]" :
                  "bg-yellow-500/10 text-yellow-400"
            )}>{mvrvData?.signal?.toUpperCase()}</span>
          </div>
          <div className="text-center mb-4">
            <span className="text-4xl font-black text-white">{mvrvData?.value}</span>
            <p className="text-[10px] text-white/30 mt-1">&gt;3.5 = Top • &lt;1.0 = Bottom</p>
          </div>
          <div className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mvrvData?.history}>
                <XAxis dataKey="date" tick={false} axisLine={false} />
                <YAxis tick={false} axisLine={false} domain={[0, 4.5]} />
                <Line type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2} dot={false} />
                {/* Reference lines at 1 and 3.5 */}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TechCard>
      </div>

      {/* SOPR */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-bold text-white/90">SOPR (Spent Output Profit Ratio)</span>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={soprData}>
              <defs>
                <linearGradient id="soprGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.3} /><stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
              <YAxis domain={[0.8, 1.2]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip prefix="" />} />
              <Area type="monotone" dataKey="value" stroke="#A78BFA" fill="url(#soprGrad)" strokeWidth={2} name="SOPR" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-white/30 mt-2 text-center">SOPR &gt;1 = Profit taking • SOPR &lt;1 = Selling at loss</p>
      </TechCard>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB 4: DEFI METRICS
// ═══════════════════════════════════════════════════════════
const DeFiTab = ({ symbol, defiData }) => {
  if (!defiData) return null;

  return (
    <div className="space-y-4">
      {/* TVL + Volume */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="TVL Totale" value={defiData.tvlFormatted} change={defiData.tvlChange} icon={Layers} />
        <StatCard label="DEX Volume" value={defiData.dexVolumeFormatted} icon={BarChart3} />
        <StatCard label="Open Interest" value={defiData.openInterest} icon={Target} iconColor="#F59E0B" />
        <StatCard label="Funding Rate" value={`${defiData.fundingRate > 0 ? '+' : ''}${(defiData.fundingRate * 100).toFixed(3)}%`}
          icon={defiData.fundingRate >= 0 ? TrendingUp : TrendingDown} iconColor={defiData.fundingRate >= 0 ? '#00D9A5' : '#EF4444'} />
      </div>

      {/* TVL History */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-[#00D9A5]" />
          <span className="text-sm font-bold text-white/90">TVL Trend (30d)</span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={defiData.tvlHistory}>
              <defs>
                <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D9A5" stopOpacity={0.3} /><stop offset="100%" stopColor="#00D9A5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}B`} />
              <Tooltip content={<CustomTooltip prefix="$" />} />
              <Area type="monotone" dataKey="tvl" stroke="#00D9A5" fill="url(#tvlGrad)" strokeWidth={2} name="TVL (B)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </TechCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Protocols Pie */}
        <TechCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-4 h-4 text-[#FF007A]" />
            <span className="text-sm font-bold text-white/90">Top Protocols (TVL %)</span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <RPieChart>
                <Pie data={defiData.protocols} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                  {defiData.protocols.map((p, i) => (
                    <Cell key={i} fill={p.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip prefix="" />} />
              </RPieChart>
            </ResponsiveContainer>
          </div>
        </TechCard>

        {/* Liquidations */}
        <TechCard className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-white/90">Liquidazioni 24h</span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defiData.liquidations}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hour" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 8 }} axisLine={false} tickLine={false}
                  interval={3} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip prefix="$" />} />
                <Bar dataKey="longs" name="Longs" fill="#00D9A5" fillOpacity={0.7} stackId="a" />
                <Bar dataKey="shorts" name="Shorts" fill="#EF4444" fillOpacity={0.7} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TechCard>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB 5: FUNDAMENTALS
// ═══════════════════════════════════════════════════════════
const FundamentalsTab = ({ symbol, coin, fundamentals }) => {
  if (!fundamentals) return null;

  return (
    <div className="space-y-4">
      {/* Supply Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Circulating Supply" value={`${(fundamentals.circulatingSupply / 1e6).toFixed(1)}M`} icon={Hash} />
        <StatCard label="Total Supply" value={`${(fundamentals.totalSupply / 1e6).toFixed(1)}M`} icon={Layers} />
        <StatCard label="Circulating %" value={`${fundamentals.circulatingRatio}%`} icon={PieChart} iconColor="#F59E0B" />
        <StatCard label="Max Supply" value={fundamentals.maxSupply ? `${(fundamentals.maxSupply / 1e6).toFixed(1)}M` : '∞'} icon={Shield} />
      </div>

      {/* Circulating Ratio Bar */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-[#00D9A5]" />
          <span className="text-sm font-bold text-white/90">Supply Distribution</span>
        </div>
        <div className="relative h-6 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fundamentals.circulatingRatio}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#00D9A5]/80 to-[#00D9A5] rounded-full"
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
            {fundamentals.circulatingRatio}% Circulating
          </span>
        </div>
      </TechCard>

      {/* Developer Activity */}
      <TechCard className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-white/90">Developer Activity (12 months)</span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fundamentals.devActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip prefix="" />} />
              <Bar dataKey="commits" name="Commits" fill="#22D3EE" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </TechCard>

      {/* Social Sentiment */}
      <TechCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-bold text-white/90">Social Sentiment</span>
          </div>
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded",
            fundamentals.socialSentiment.score > 60 ? "bg-[#00D9A5]/10 text-[#00D9A5]" :
              fundamentals.socialSentiment.score < 40 ? "bg-red-500/10 text-red-400" :
                "bg-yellow-500/10 text-yellow-400"
          )}>Score: {fundamentals.socialSentiment.score}/100</span>
        </div>
        <div className="relative h-4 bg-white/5 rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fundamentals.socialSentiment.score}%` }}
            transition={{ duration: 1.5 }}
            className={cn("absolute inset-y-0 left-0 rounded-full",
              fundamentals.socialSentiment.score > 60 ? "bg-gradient-to-r from-[#00D9A5]/70 to-[#00D9A5]" :
                fundamentals.socialSentiment.score < 40 ? "bg-gradient-to-r from-red-500/70 to-red-500" :
                  "bg-gradient-to-r from-yellow-500/70 to-yellow-500"
            )} />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <span className="text-[10px] text-white/40 uppercase block">Twitter</span>
            <span className="text-sm font-bold text-white">{(fundamentals.socialSentiment.twitter / 1000).toFixed(0)}K mentions</span>
          </div>
          <div>
            <span className="text-[10px] text-white/40 uppercase block">Reddit</span>
            <span className="text-sm font-bold text-white">{(fundamentals.socialSentiment.reddit / 1000).toFixed(0)}K posts</span>
          </div>
          <div>
            <span className="text-[10px] text-white/40 uppercase block">Telegram</span>
            <span className="text-sm font-bold text-white">{(fundamentals.socialSentiment.telegram / 1000).toFixed(0)}K msgs</span>
          </div>
        </div>
      </TechCard>

      {/* AI Summary */}
      <TechCard className="p-5 bg-gradient-to-br from-[#00D9A5]/5 to-transparent border-[#00D9A5]/20">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-[#00D9A5]" />
          <span className="text-sm font-bold text-[#00D9A5]">Karion AI — Fundamental Analysis</span>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <ul className="space-y-1.5 text-sm text-white/80">
            <li className="flex items-start gap-2"><span className="text-[#00D9A5] mt-0.5">•</span>Supply circulating al {fundamentals.circulatingRatio}% — {fundamentals.circulatingRatio > 70 ? 'bassa pressione inflazionaria' : 'potenziale diluzione significativa'}.</li>
            <li className="flex items-start gap-2"><span className="text-[#00D9A5] mt-0.5">•</span>Dev activity {fundamentals.devActivity[11]?.commits > 150 ? 'elevata' : 'moderata'} nell\'ultimo mese ({fundamentals.devActivity[11]?.commits} commits) — segnale di sviluppo {fundamentals.devActivity[11]?.commits > 150 ? 'forte' : 'stabile'}.</li>
            <li className="flex items-start gap-2"><span className="text-[#00D9A5] mt-0.5">•</span>Sentiment score a {fundamentals.socialSentiment.score}/100 — {fundamentals.socialSentiment.score > 60 ? 'comunità ottimista' : fundamentals.socialSentiment.score < 40 ? 'sentiment bearish prevalente' : 'mood neutrale'}.</li>
            <li className="flex items-start gap-2"><span className="text-[#00D9A5] mt-0.5">•</span>Valutazione complessiva: {fundamentals.socialSentiment.score > 60 && fundamentals.devActivity[11]?.commits > 100 ? 'Fondamentali solidi per posizionamento long-term.' : 'Mantenere esposizione ridotta fino a conferme.'}</li>
          </ul>
        </div>
      </TechCard>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN: CRYPTO PAGE
// ═══════════════════════════════════════════════════════════
export default function CryptoPage() {
  const [coins, setCoins] = useState([]);
  const [selectedId, setSelectedId] = useState('bitcoin');
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [chartData, setChartData] = useState(null);
  const [globalData, setGlobalData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // On-chain data states
  const [whaleTxs, setWhaleTxs] = useState([]);
  const [netflowData, setNetflowData] = useState([]);
  const [topWallets, setTopWallets] = useState([]);
  const [flowData, setFlowData] = useState([]);
  const [holderDist, setHolderDist] = useState([]);
  const [mvrvData, setMvrvData] = useState(null);
  const [soprData, setSoprData] = useState([]);
  const [defiData, setDefiData] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [biasScore, setBiasScore] = useState(null);

  const selectedCoin = useMemo(() => coins.find(c => c.id === selectedId), [coins, selectedId]);
  const selectedSymbol = selectedCoin?.symbol?.toUpperCase() || 'BTC';

  // Fetch top 30 coins
  useEffect(() => {
    const fetchCoins = async () => {
      setIsUpdating(true);
      const data = await MarketService.getTop30();
      if (data?.length) {
        setCoins(data);
        if (!data.find(c => c.id === selectedId)) setSelectedId(data[0].id);
      }
      setLoading(false);
      setIsUpdating(false);
    };
    fetchCoins();
    const interval = setInterval(fetchCoins, 60000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Fetch chart data when coin changes
  useEffect(() => {
    if (!selectedId) return;
    const fetchChart = async () => {
      const data = await MarketService.getCoinChart(selectedId, 7);
      setChartData(data);
    };
    fetchChart();
  }, [selectedId]);

  // Fetch global data once
  useEffect(() => {
    MarketService.getGlobalData().then(setGlobalData);
  }, []);

  // Generate on-chain data when coin changes
  useEffect(() => {
    if (!selectedSymbol) return;
    const sym = selectedSymbol;

    const whales = CryptoOnChainService.getWhaleTransactions(sym);
    const netflow = CryptoOnChainService.getExchangeNetflow(sym);
    const wallets = CryptoOnChainService.getTopWallets(sym);
    const flows = CryptoOnChainService.getExchangeFlows(sym);
    const holders = CryptoOnChainService.getHolderDistribution(sym);
    const mvrv = CryptoOnChainService.getMVRV(sym);
    const sopr = CryptoOnChainService.getSOPR(sym);
    const defi = CryptoOnChainService.getDeFiMetrics(sym);
    const fund = CryptoOnChainService.getProjectFundamentals(sym);

    setWhaleTxs(whales);
    setNetflowData(netflow);
    setTopWallets(wallets);
    setFlowData(flows);
    setHolderDist(holders);
    setMvrvData(mvrv);
    setSoprData(sopr);
    setDefiData(defi);
    setFundamentals(fund);

    const bias = CryptoOnChainService.calculateBiasScore(whales, netflow, holders, mvrv);
    setBiasScore(bias);
  }, [selectedSymbol]);

  // Filter coins for search
  const filteredCoins = useMemo(() => {
    if (!searchQuery) return coins;
    const q = searchQuery.toLowerCase();
    return coins.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  }, [coins, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-[#00D9A5] animate-spin mx-auto mb-3" />
          <p className="text-white/40 text-sm">Loading Crypto Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 fade-in font-apple" data-testid="crypto-page">
      {/* ─── Header ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bitcoin className="w-7 h-7 text-[#00D9A5]" />
            Crypto Portal
            {isUpdating && <RefreshCw className="w-4 h-4 animate-spin text-white/30" />}
          </h1>
          <p className="text-white/40 mt-1 text-sm">Top 30 Crypto • On-Chain Analytics • Bias Engine</p>
        </div>

        {biasScore && <BiasScoreBadge score={biasScore.score} signal={biasScore.signal} />}
      </motion.div>

      {/* ─── Asset Selector ─── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca crypto..."
            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#00D9A5]/30"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {filteredCoins.slice(0, 15).map((c) => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0",
                selectedId === c.id
                  ? "bg-[#00D9A5]/15 text-[#00D9A5] border border-[#00D9A5]/30"
                  : "bg-white/5 text-white/50 border border-transparent hover:bg-white/10"
              )}>
              {c.image && <img src={c.image} alt={c.symbol} className="w-4 h-4 rounded-full" />}
              <span className="uppercase font-bold">{c.symbol}</span>
              <span className={cn("text-[10px]", pctColor(c.price_change_percentage_24h))}>
                {pct(c.price_change_percentage_24h)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />Overview
          </TabsTrigger>
          <TabsTrigger value="whales" className="flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5" />Whales
          </TabsTrigger>
          <TabsTrigger value="onchain" className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />On-Chain
          </TabsTrigger>
          <TabsTrigger value="defi" className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />DeFi
          </TabsTrigger>
          <TabsTrigger value="fundamentals" className="flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5" />Fundamentals
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <TabsContent value="overview">
              <OverviewTab coin={selectedCoin} chartData={chartData} globalData={globalData} mvrvData={mvrvData} />
            </TabsContent>

            <TabsContent value="whales">
              <WhalesTab symbol={selectedSymbol} whaleTxs={whaleTxs} netflowData={netflowData} topWallets={topWallets} />
            </TabsContent>

            <TabsContent value="onchain">
              <OnChainTab symbol={selectedSymbol} flowData={flowData} holderDist={holderDist} mvrvData={mvrvData} soprData={soprData} />
            </TabsContent>

            <TabsContent value="defi">
              <DeFiTab symbol={selectedSymbol} defiData={defiData} />
            </TabsContent>

            <TabsContent value="fundamentals">
              <FundamentalsTab symbol={selectedSymbol} coin={selectedCoin} fundamentals={fundamentals} />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
