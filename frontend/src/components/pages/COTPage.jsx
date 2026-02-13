import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, RefreshCw, Activity, Search,
  ArrowUpRight, ArrowDownRight, Layers, Zap,
  Crosshair, LineChart, Table as TableIcon, Filter,
  LayoutGrid, BarChart3, ChevronDown, Check, Target,
  Shield, Timer, TrendingUp as TrendIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TechCard } from '../ui/TechCard';
import { GlowingChart } from '../ui/SparkLine';
import { MacroService } from '../../services/MacroService';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { WeeklyBiasScale } from '../ui/WeeklyBiasScale';

const TechnicalMetric = ({ label, value, subValue, suffix = '', variant = 'default' }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center">
    <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">{label}</span>
    <span className={cn(
      "text-3xl font-black mb-1 tracking-tighter",
      variant === 'bull' ? "text-[#00D9A5] drop-shadow-[0_0_10px_#00D9A5/30]" :
        variant === 'bear' ? "text-red-400 drop-shadow-[0_0_10px_#EF4444/30]" : "text-white"
    )}>
      {value}{suffix}
    </span>
    {subValue && <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{subValue}</span>}
  </div>
);

const ParticipantRow = ({ type, data }) => (
  <div className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
    <div className="flex flex-col">
      <span className="text-sm font-bold text-white/90">{type}</span>
      <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{data.oiPct}% of Total OI</span>
    </div>
    <div className="flex gap-10 items-center">
      <div className="flex flex-col items-end min-w-[80px]">
        <span className="text-xs font-mono font-bold text-white">{data.net.toLocaleString()}</span>
        <span className="text-[9px] text-white/40 uppercase font-black">Net Pos</span>
      </div>
      <div className={cn(
        "flex flex-col items-end min-w-[60px]",
        data.change >= 0 ? "text-[#00D9A5]" : "text-red-400"
      )}>
        <span className="text-xs font-mono font-bold">{data.change >= 0 ? '+' : ''}{data.change.toLocaleString()}</span>
        <span className="text-[9px] opacity-60 uppercase font-black">Weekly</span>
      </div>
    </div>
  </div>
);

const OverviewCard = ({ symbol, data, onClick }) => (
  <button
    onClick={onClick}
    className="bg-white/[0.03] border border-white/10 p-6 rounded-[32px] text-left hover:bg-white/5 transition-all group relative overflow-hidden h-full flex flex-col"
  >
    <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
      <ArrowUpRight className="w-5 h-5 text-[#00D9A5]" />
    </div>
    <div className="flex items-center gap-3 mb-6">
      <Badge className={cn(
        "px-3 py-0.5 font-bold tracking-widest rounded-full text-[9px] uppercase",
        data.sentiment === 'BULLISH' ? "bg-[#00D9A5]/20 text-[#00D9A5] border-[#00D9A5]/30" :
          data.sentiment === 'BEARISH' ? "bg-red-400/20 text-red-500 border-red-500/30" :
            "bg-yellow-400/20 text-yellow-500 border-yellow-500/30"
      )}>
        {data.sentiment}
      </Badge>
      <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">{data.symbol} Index</span>
    </div>

    <div className="mb-4">
      <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">{data.name}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-white tracking-tighter">
          {data.netPosition > 0 ? '+' : ''}{(data.netPosition / 1000).toFixed(1)}k
        </span>
        <span className="text-[10px] font-bold text-white/40 uppercase">Contracts</span>
      </div>
    </div>

    {/* Rolling Bias Section for Overview */}
    <div className="mt-2 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">4W Trend Bias</span>
        <span className="text-[9px] font-bold text-[#00D9A5] uppercase tracking-widest opacity-60">Rolling Window</span>
      </div>
      <WeeklyBiasScale data={data.rollingBias} mini={true} />
    </div>

    <div className="mt-auto pt-6 border-t border-white/5 flex justify-between items-center">
      <div className="flex flex-col">
        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Percentile 52W</span>
        <span className="text-lg font-bold text-white/80">{data.technical.percentile52W}%</span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Z-Score</span>
        <span className={cn(
          "text-lg font-bold",
          Math.abs(data.technical.zScore) > 1.5 ? (data.technical.zScore > 0 ? "text-[#00D9A5]" : "text-red-400") : "text-white"
        )}>
          {data.technical.zScore > 0 ? '+' : ''}{data.technical.zScore}
        </span>
      </div>
    </div>
  </button>
);

export default function COTPage() {
  const [cotData, setCotData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAsset, setActiveAsset] = useState('SPX');
  const [viewMode, setViewMode] = useState('overview');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await MacroService.getCOTData();
      setCotData(data);
    } catch (err) {
      console.error('Error fetching COT data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectAsset = (symbol) => {
    setActiveAsset(symbol);
    setViewMode('technical');
  };

  if (isLoading || !cotData) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-[#00D9A5]" />
      </div>
    );
  }

  const asset = cotData[activeAsset];
  const historyData = asset.history.map(h => h.value);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] fade-in -mt-2">
      {/* Premium Header Navigation */}
      <div className="flex items-center justify-between mb-8 px-2 shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight uppercase leading-none">COT Institutional</h1>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em] mt-2">Smart Money Positioning</p>
          </div>

          <div className="flex bg-white/5 rounded-2xl p-1.5 border border-white/10">
            <button
              onClick={() => setViewMode('overview')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                viewMode === 'overview' ? "bg-white/10 text-[#00D9A5] shadow-xl" : "text-white/40 hover:text-white/60"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setViewMode('technical')}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                viewMode === 'technical' ? "bg-white/10 text-[#00D9A5] shadow-xl" : "text-white/40 hover:text-white/60"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              Technical Detail
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {viewMode === 'technical' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 px-5 py-2.5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all">
                  <span className="text-xs font-black text-white uppercase tracking-widest">{activeAsset}</span>
                  <ChevronDown className="w-4 h-4 text-white/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-[#0B0F17] border border-white/10 rounded-2xl shadow-2xl p-2">
                {Object.keys(cotData).map((symbol) => (
                  <DropdownMenuItem
                    key={symbol}
                    onClick={() => setActiveAsset(symbol)}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl cursor-pointer hover:bg-white/5 focus:bg-white/5 transition-all text-sm font-bold",
                      activeAsset === symbol ? "text-[#00D9A5]" : "text-white/60"
                    )}
                  >
                    <span>{symbol}</span>
                    {activeAsset === symbol && <Check className="w-4 h-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={fetchData}
            className="p-2.5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-white/40 hover:text-[#00D9A5]"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'overview' ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pr-2 overflow-y-auto custom-scrollbar h-full pb-8"
          >
            {Object.values(cotData).map((assetData) => (
              <OverviewCard
                key={assetData.symbol}
                symbol={assetData.symbol}
                data={assetData}
                onClick={() => selectAsset(assetData.symbol)}
              />
            ))}

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="lg:col-span-2 bg-gradient-to-br from-[#00D9A5]/5 to-transparent border border-[#00D9A5]/10 p-10 rounded-[40px] flex flex-col justify-center"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-[#00D9A5]/10 rounded-2xl">
                  <Filter className="w-7 h-7 text-[#00D9A5]" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-white uppercase tracking-tight">Institutional Positioning Bias</h4>
                  <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">Cross-Asset Sentiment Analysis</p>
                </div>
              </div>
              <p className="text-white/60 text-sm leading-relaxed max-w-xl mb-8 font-apple italic">
                "The current reporting window highlights a surgical shift in institutional positioning. While broad equity indices show steady accumulation, commodity markets exhibit higher volatility in bias velocity with notable retail exhaustion signals."
              </p>
              <div className="flex gap-4">
                <div className="px-5 py-2.5 bg-white/5 rounded-2xl border border-white/10 text-[10px] font-black text-[#00D9A5] uppercase tracking-widest">
                  Period: Feb 06 - Feb 13, 2026
                </div>
                <div className="px-5 py-2.5 bg-white/5 rounded-2xl border border-white/10 text-[10px] font-black text-white/40 uppercase tracking-widest">
                  Next Release: In 6 Days
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="technical"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="flex-1 flex flex-col h-full overflow-y-auto pr-2 custom-scrollbar pb-8"
          >
            <TechCard className="p-10 bg-[#0B0F17]/40 relative overflow-hidden flex flex-col min-h-fit border-white/5">
              <div className="absolute top-[-200px] left-[-200px] w-[500px] h-[500px] bg-[#00D9A5]/5 blur-[150px] rounded-full pointer-events-none" />

              {/* Header Section */}
              <div className="flex justify-between items-start mb-12 relative z-10">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center bg-white/5 rounded-full px-5 py-2 border border-white/10 shadow-2xl backdrop-blur-md">
                      <Zap className="w-3.5 h-3.5 text-[#00D9A5] mr-2" />
                      <span className="text-[10px] font-black text-white/90 uppercase tracking-[0.2em]">{asset.symbol} TECHNICAL DEPTH</span>
                    </div>
                    <Badge className={cn(
                      "px-5 py-1.5 font-black tracking-widest rounded-full uppercase text-[10px]",
                      asset.sentiment === 'BULLISH' ? "bg-[#00D9A5]/20 text-[#00D9A5] border-[#00D9A5]/30 shadow-[0_0_20_rgba(0,217,165,0.2)]" :
                        "bg-red-500/20 text-red-500 border-red-500/30"
                    )}>
                      {asset.sentiment}
                    </Badge>
                  </div>
                  <h1 className="text-5xl font-black text-white mb-3 tracking-tighter leading-none uppercase">{asset.name}</h1>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-4">
                      <span className="text-8xl font-black text-white tracking-tighter leading-none mb-4 drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">
                        {asset.netPosition > 0 ? '+' : ''}{(asset.netPosition / 1000).toFixed(1)}k
                      </span>
                      <span className="text-2xl font-black text-white/20 uppercase tracking-widest">Net</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-white/40 font-black uppercase tracking-[0.4em]">Institutional Position</span>
                      <div className="h-4 w-px bg-white/20" />
                      <div className={cn(
                        "flex items-center gap-2 text-sm font-black uppercase tracking-widest",
                        asset.change >= 0 ? "text-[#00D9A5]" : "text-red-400"
                      )}>
                        {asset.change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {Math.abs(asset.change).toLocaleString()} Change
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 p-10 rounded-[48px] border border-white/10 flex flex-col items-center justify-center min-w-[200px] backdrop-blur-xl">
                  <span className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em] mb-4">52W Percentile</span>
                  <div className="text-7xl font-black text-white tracking-tighter">{asset.technical.percentile52W}%</div>
                  <div className="px-4 py-1.5 bg-[#00D9A5]/10 rounded-full border border-[#00D9A5]/20 text-[9px] text-[#00D9A5] font-black mt-4 uppercase tracking-widest shadow-lg">
                    {asset.technical.percentile52W > 80 ? 'EXTREME BULLISH' : asset.technical.percentile52W < 20 ? 'EXTREME BEARISH' : 'NORMALIZED BIAS'}
                  </div>
                </div>
              </div>

              {/* Advanced Bias Transition Scales (Rolling 4-Week) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-12 relative z-10 items-stretch">
                <div className="lg:col-span-2">
                  <WeeklyBiasScale data={asset.rollingBias} />
                </div>

                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="p-10 rounded-[48px] border border-[#00D9A5]/20 bg-gradient-to-br from-[#00D9A5]/10 via-[#00D9A5]/5 to-transparent flex flex-col justify-center shadow-2xl"
                >
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2.5 bg-[#00D9A5]/10 rounded-xl">
                      <TrendIcon className="w-6 h-6 text-[#00D9A5]" />
                    </div>
                    <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Bias Velocity Analysis</h4>
                  </div>
                  <div className="space-y-8">
                    <div>
                      <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] block mb-3">Trend Conviction</span>
                      <p className="text-lg font-bold text-white leading-tight">
                        Smart Money commitment is in an **{asset.rollingBias[3].value > asset.rollingBias[2].value ? 'Acceleration' : 'Correction'}** phase.
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] block mb-3">Momentum Impulse</span>
                      <div className="flex items-center gap-5">
                        <span className="text-5xl font-black text-[#00D9A5] drop-shadow-[0_0_15px_#00D9A5/40]">
                          {Math.abs(asset.rollingBias[3].value - asset.rollingBias[2].value)}%
                        </span>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-white/40 uppercase leading-none tracking-widest">
                            Weekly
                          </span>
                          <span className="text-[10px] font-black text-white/40 uppercase leading-none tracking-widest mt-1">
                            Variance
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pt-8 border-t border-white/10">
                      <p className="text-xs text-white/50 leading-relaxed italic font-apple pr-4">
                        "The delta from **{asset.rollingBias[2].value}%** to **{asset.rollingBias[3].value}%** suggests a tactical rotation in institutional desk positioning for the next cycle."
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Quick Technical Stats Grid */}
              <div className="grid grid-cols-4 gap-6 mb-12 relative z-10">
                <TechnicalMetric
                  label="Institutional Z-Score"
                  value={asset.technical.zScore > 0 ? '+' : '' + asset.technical.zScore}
                  subValue="Deviation from Mean"
                  variant={Math.abs(asset.technical.zScore) > 2 ? (asset.technical.zScore > 0 ? 'bull' : 'bear') : 'default'}
                />
                <TechnicalMetric
                  label="Concentration Index"
                  value={asset.technical.concentration4}
                  suffix="%"
                  subValue="Top 4 Dealers Dominance"
                />
                <TechnicalMetric
                  label="Price Sync Core"
                  value={asset.technical.oiCorrelation}
                  subValue="Positioning Alignment"
                  variant={asset.technical.oiCorrelation > 0.8 ? 'bull' : asset.technical.oiCorrelation < -0.8 ? 'bear' : 'default'}
                />
                <TechnicalMetric
                  label="Active Liquid OI"
                  value={(asset.openInterest / 1000000).toFixed(2)}
                  suffix="M"
                  subValue="Total Open Contracts"
                />
              </div>

              {/* Institutional Trend Chart & TFF Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-12 relative z-10">
                <div className="lg:col-span-2 bg-white/[0.02] border border-white/10 rounded-[48px] p-10 shadow-inner">
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-white/5 rounded-xl border border-white/10">
                        <LineChart className="w-5 h-5 text-[#00D9A5]" />
                      </div>
                      <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Net Position Trend Analysis</h4>
                    </div>
                  </div>
                  <div className="h-[300px]">
                    <GlowingChart
                      data={historyData}
                      width={1000}
                      height={300}
                      color="#00D9A5"
                      showPrice={true}
                    />
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/10 rounded-[48px] p-10">
                  <div className="flex items-center gap-4 mb-10">
                    <div className="p-2.5 bg-white/5 rounded-xl border border-white/10">
                      <TableIcon className="w-5 h-5 text-[#00D9A5]" />
                    </div>
                    <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">TFF Participant Feed</h4>
                  </div>
                  <div className="space-y-1">
                    <ParticipantRow type="Asset Managers" data={asset.breakdownTFF.assetManagers} />
                    <ParticipantRow type="Leveraged Funds" data={asset.breakdownTFF.leveragedFunds} />
                    <ParticipantRow type="Other Reportables" data={asset.breakdownTFF.otherReportables} />
                  </div>
                  <div className="mt-10 p-6 bg-[#00D9A5]/5 rounded-[32px] border border-[#00D9A5]/10 shadow-[0_0_30px_rgba(0,217,165,0.05)]">
                    <div className="text-[10px] font-black text-[#00D9A5] uppercase tracking-[0.3em] mb-3 flex items-center">
                      <Target className="w-4 h-4 mr-2" /> Technical Insight
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed font-medium font-apple italic">
                      Monitor the **Leveraged Funds** net delta of ({asset.breakdownTFF.leveragedFunds.change > 0 ? '+' : ''}{asset.breakdownTFF.leveragedFunds.change.toLocaleString()}) to anticipate potential momentum capitulation or squeeze events.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Technical Cards */}
              <div className="grid grid-cols-2 gap-10 relative z-10">
                <div className="p-10 rounded-[48px] bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10">
                  <div className="flex items-center gap-4 mb-8">
                    <Layers className="w-6 h-6 text-[#00D9A5]" />
                    <h5 className="text-sm font-black text-white uppercase tracking-[0.2em]">Microstructure Metrics</h5>
                  </div>
                  <div className="grid grid-cols-2 gap-10">
                    <div>
                      <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] block mb-4">Market Concentration</span>
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-3xl font-black text-white tracking-tighter">{asset.technical.concentration4}%</span>
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-1">Top 4</span>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="flex flex-col">
                          <span className="text-3xl font-black text-white tracking-tighter">{asset.technical.concentration8}%</span>
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mt-1">Top 8</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] block mb-4">Signal Quality</span>
                      <div className="inline-flex items-center px-6 py-2.5 rounded-2xl bg-[#00D9A5]/10 border border-[#00D9A5]/20 text-[#00D9A5] text-xs font-black uppercase tracking-[0.2em] shadow-lg">
                        {asset.technical.oiCorrelation > 0.7 ? 'Strong Conviction' :
                          asset.technical.oiCorrelation < -0.7 ? 'Contra Signal' : 'Neutral Alpha'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-10 rounded-[48px] bg-white/[0.02] border border-white/10">
                  <div className="flex items-center gap-4 mb-8">
                    <Crosshair className="w-6 h-6 text-[#00D9A5]" />
                    <h5 className="text-sm font-black text-white uppercase tracking-[0.2em]">Quant Assessment</h5>
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="mt-2 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_10px_#00D9A5]" />
                        <p className="text-[11px] text-white/70 leading-relaxed font-bold uppercase tracking-wide">
                          Z-Score: **{asset.technical.zScore}** ({Math.abs(asset.technical.zScore) > 2 ? 'Extreme' : 'Normalized'})
                        </p>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="mt-2 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_10px_#00D9A5]" />
                        <p className="text-[11px] text-white/70 leading-relaxed font-bold uppercase tracking-wide">
                          Percentile: **{asset.technical.percentile52W}%** ({asset.technical.percentile52W > 80 ? 'Bullish Cap' : 'Discovery'})
                        </p>
                      </div>
                    </div>
                    <div className="space-y-5 font-apple border-l border-white/10 pl-8 italic">
                      <p className="text-[11px] text-white/40 leading-relaxed">
                        Cross-reference **Open Interest** divergence with net capital flows to validate the sustainability of the current positioning extreme.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TechCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
