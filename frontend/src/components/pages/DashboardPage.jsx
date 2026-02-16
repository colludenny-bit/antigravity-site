import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  TrendingUp, TrendingDown, DollarSign, Activity,
  Target, Shield, AlertTriangle, RefreshCw, Lightbulb, Clock,
  BarChart3, Eye, Minus, Users, ArrowUpRight, ArrowDownRight,
  Scale, Layers, Newspaper, ChevronDown, ChevronUp, ChevronRight,
  Zap, Calendar, ChevronLeft, Info, X, Crown
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TechCard, TechCardHeader, TechBadge } from '../ui/TechCard';
import { SparkLine, GlowingChart, MiniDonut } from '../ui/SparkLine';
import { DetailChart } from '../ui/DetailChart';
import { TechTableTabs } from '../ui/TechTable';
import { ExportButton } from '../ui/ExportButton';
import { Skeleton, CardSkeleton } from '../ui/LoadingSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { WeeklyBiasScale } from '../ui/WeeklyBiasScale';


// Typewriter Text Component - reveals text character by character
const TypewriterText = ({ text, speed = 25, delay = 0, className, children }) => {
  const [displayedChars, setDisplayedChars] = useState(0);
  const content = text || (typeof children === 'string' ? children : '');

  useEffect(() => {
    if (!content) return;
    setDisplayedChars(0);
    const startTimer = setTimeout(() => {
      let current = 0;
      const interval = setInterval(() => {
        current++;
        setDisplayedChars(current);
        if (current >= content.length) clearInterval(interval);
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(startTimer);
  }, [content, speed, delay]);

  if (!content) return <span className={className}>{children}</span>;

  return (
    <span className={className}>
      {content.slice(0, displayedChars)}
      {displayedChars < content.length && (
        <span className="inline-block w-[2px] h-[0.9em] bg-[#00D9A5]/60 ml-0.5 align-middle animate-pulse" />
      )}
    </span>
  );
};

// Counter Animation Component - spins numbers like a roulette
const CountUp = ({ value, duration = 1500, delay = 0, prefix = '', suffix = '', className }) => {
  const [display, setDisplay] = useState(0);
  const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
  const isDecimal = String(numVal).includes('.') || String(value).includes('.');

  useEffect(() => {
    setDisplay(0);
    const startTimer = setTimeout(() => {
      const startTime = performance.now();
      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = numVal * eased;
        setDisplay(isDecimal ? Math.round(current * 10) / 10 : Math.round(current));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, delay);
    return () => clearTimeout(startTimer);
  }, [numVal, duration, delay, isDecimal]);

  return <span className={className}>{prefix}{display}{suffix}</span>;
};

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

// Asset Charts Grid (2-3 charts visible at once)
const AssetChartPanel = ({ assets, favoriteCharts, onFavoriteChange, animationsReady = false, onSyncAsset }) => {
  // State with LocalStorage Persistence
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('dashboard_viewMode') || 'grid');
  const [selectedAsset, setSelectedAsset] = useState(() => localStorage.getItem('dashboard_selectedAsset') || null);
  const [showSelector, setShowSelector] = useState(false);
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [chartLineColor, setChartLineColor] = useState(() => localStorage.getItem('dashboard_chartLineColor') || '#00D9A5');
  const [syncEnabled, setSyncEnabled] = useState(() => localStorage.getItem('dashboard_syncEnabled') === 'true');

  // Persist State Changes
  useEffect(() => {
    localStorage.setItem('dashboard_syncEnabled', syncEnabled);
  }, [syncEnabled]);

  useEffect(() => {
    localStorage.setItem('dashboard_viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (selectedAsset) {
      localStorage.setItem('dashboard_selectedAsset', selectedAsset);
      if (syncEnabled && onSyncAsset) {
        onSyncAsset(selectedAsset);
      }
    } else {
      localStorage.removeItem('dashboard_selectedAsset');
    }
  }, [selectedAsset, syncEnabled, onSyncAsset]);

  useEffect(() => {
    localStorage.setItem('dashboard_chartLineColor', chartLineColor);
  }, [chartLineColor]);

  // Filter to show only favorite charts in grid
  const visibleAssets = assets.filter(a => favoriteCharts.includes(a.symbol));

  const toggleFavorite = (symbol) => {
    if (favoriteCharts.includes(symbol)) {
      if (favoriteCharts.length > 2) {
        onFavoriteChange(favoriteCharts.filter(s => s !== symbol));
      }
    } else {
      if (favoriteCharts.length < 3) {
        onFavoriteChange([...favoriteCharts, symbol]);
      }
    }
  };

  const getDailyOutlook = (asset) => {
    const isBull = asset.direction === 'Up';
    const isBear = asset.direction === 'Down';
    const conf = asset.confidence || 0;

    let conclusion = "Bias Neutrale";
    let conclusionType = 'neutral';
    let lines = [
      "Struttura di mercato in fase laterale.",
      "Monitorare la rottura dei livelli chiave.",
      "Incertezza sui volumi direzionali."
    ];

    if (isBull && conf >= 60) {
      conclusion = "Trend Rialzista Forte";
      conclusionType = 'bullish';
      lines = [
        "Forte spinta rialzista confermata dai volumi.",
        "Cerca ingressi Long sui ritracciamenti.",
        "Target primario verso i massimi settimanali."
      ];
    } else if (isBull) {
      conclusion = "Bias Rialzista Moderato";
      conclusionType = 'bullish';
      lines = [
        "Sentiment positivo ma con volatilità.",
        "Inclinazione rialzista nel breve termine.",
        "Attenzione a possibili prese di profitto."
      ];
    } else if (isBear && conf >= 60) {
      conclusion = "Trend Ribassista Forte";
      conclusionType = 'bearish';
      lines = [
        "Pressione di vendita dominante.",
        "Favorire strategie Short in breakout.",
        "Obiettivo su minimi di periodo."
      ];
    } else if (isBear) {
      conclusion = "Bias Ribassista Moderato";
      conclusionType = 'bearish';
      lines = [
        "Incertezza con tendenza al ribasso.",
        "Possibile prosecuzione controllata.",
        "Stop loss stretti consigliati."
      ];
    }

    return { conclusion, conclusionType, outlookLines: lines };
  };

  const currentAsset = selectedAsset ? assets.find(a => a.symbol === selectedAsset) : assets[0];
  const dailyOutlook = currentAsset ? getDailyOutlook(currentAsset) : null;
  const chartColors = ['#00D9A5', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

  const handleFocusAsset = (symbol) => {
    setSelectedAsset(symbol);
    setViewMode('focus');
    setShowAssetMenu(false);
  };

  const handleTitleClick = () => {
    if (viewMode === 'focus') {
      setViewMode('grid');
      setSelectedAsset(null);
    } else {
      setShowAssetMenu(!showAssetMenu);
    }
  };

  return (
    <TechCard className="font-apple glass-edge fine-gray-border p-5 relative">
      {/* Info Tooltip - Genie Effect */}
      <AnimatePresence>
        {showInfo && (
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
                <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida Screening</h4>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
              <div className="space-y-5 text-left">
                <p className="text-lg text-white leading-relaxed font-normal">
                  Lo <span className="text-[#00D9A5] font-semibold">Screening</span> analizza gli asset in tempo reale combinando indicatori tecnici, volumi e momentum per identificare opportunità di trading ad alta probabilità.
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
                        <span className="font-semibold">Direzione:</span> Trend dominante dell'asset.
                        <span className="text-[#00D9A5] font-semibold"> Up = rialzista</span>,
                        <span className="text-red-400 font-semibold"> Down = ribassista</span>.
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold">Confidenza:</span> Forza del segnale (0-100%).
                        <span className="text-[#00D9A5] font-semibold"> &gt;60% = segnale forte</span>,
                        <span className="text-yellow-400 font-semibold"> 40-60% = moderato</span>.
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_10px_#00D9A5] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold text-[#00D9A5]">Volumi:</span> Conferma della direzione tramite volume.
                        Volumi crescenti <span className="italic">validano</span> il movimento.
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_#FACC15] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold text-yellow-400">Outlook:</span> Sintesi operativa giornaliera.
                        Contiene <span className="italic">bias, target e livelli chiave</span>.
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
                    Usa lo Screening come filtro iniziale: seleziona asset con confidenza &gt;60% e verifica con COT e Options prima di entrare.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-8">
        <div className="relative flex items-center gap-2">
          <button
            onClick={handleTitleClick}
            className="flex items-center gap-3 group transition-all"
          >
            <div className={cn(
              "p-2 rounded-lg border transition-all",
              viewMode === 'focus'
                ? "bg-[#00D9A5]/10 border-[#00D9A5]/20 font-bold"
                : "bg-white/5 border-white/10 group-hover:border-white/20 dark:bg-white/5 dark:border-white/10"
            )}>
              <BarChart3 className="w-5 h-5 text-[#00D9A5]" />
            </div>
            <div className="text-left">
              <h4 className={cn(
                "text-lg font-bold transition-colors select-none",
                viewMode === 'focus' ? "text-slate-900 dark:text-white" : "text-slate-500 group-hover:text-slate-900 dark:text-white/80 dark:group-hover:text-white"
              )}>
                {viewMode === 'focus' ? 'Screening' : 'Screening'}
              </h4>
              <p className="text-xs text-slate-400 dark:text-white/40 leading-none mt-1">
                {viewMode === 'focus' ? 'Dettagli asset' : 'Clicca per selezionare asset'}
              </p>
            </div>
          </button>
          {/* Info Button */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
          >
            <Info className="w-3.5 h-3.5 text-white" />
          </button>

          {/* Asset Selection Dropdown */}
          <AnimatePresence>
            {showAssetMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 5 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute left-0 top-full mt-2 z-50 p-2 bg-white/95 border border-slate-200 rounded-xl shadow-2xl min-w-[180px] backdrop-blur-xl dark:bg-[#0B0F17]/95 dark:border-white/10"
              >
                <div className="space-y-1">
                  {assets.map((a) => (
                    <button
                      key={a.symbol}
                      onClick={() => handleFocusAsset(a.symbol)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all text-slate-500 hover:bg-slate-100 hover:text-slate-900 font-semibold dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      {a.symbol}
                    </button>
                  ))}
                  <div className="h-px bg-white/5 my-1" />
                  <button
                    onClick={() => { setViewMode('grid'); setShowAssetMenu(false); setSelectedAsset(null); }}
                    className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-[10px] uppercase font-bold tracking-widest text-[#00D9A5] hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    Torna alla Griglia
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          {/* Outlook Giornaliero */}
          {viewMode === 'focus' && currentAsset && (
            <div className="text-right">
              <p className="text-sm text-white uppercase font-black tracking-[0.15em] mb-1">Outlook Giornaliero</p>
              <div className={cn(
                "px-3 py-1.5 rounded-lg border text-xs font-bold shadow-lg uppercase tracking-widest",
                getDailyOutlook(currentAsset).conclusionType === 'bullish' ? "bg-[#00D9A5]/10 text-[#00D9A5] border-[#00D9A5]/20" :
                  getDailyOutlook(currentAsset).conclusionType === 'bearish' ? "bg-red-500/10 text-red-400 border-red-400/20" :
                    "bg-yellow-500/10 text-yellow-400 border-yellow-400/20"
              )}>
                {getDailyOutlook(currentAsset).conclusion}
              </div>
            </div>
          )}

          {/* Favorite Eye Icon & Color Selector */}
          <div className="relative" onMouseLeave={() => setShowSelector(false)}>
            <button
              onClick={() => setShowSelector(!showSelector)}
              className={cn(
                "p-2 rounded-lg border transition-all flex items-center gap-2",
                showSelector ? "bg-[#00D9A5]/10 border-[#00D9A5]/30 text-[#00D9A5]" : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-white/5 dark:border-white/10 dark:text-white/40 dark:hover:text-white dark:hover:border-white/20"
              )}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartLineColor }} />
              <Eye className="w-5 h-5" />
            </button>

            <AnimatePresence>
              {showSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute right-0 top-full z-50 p-3 bg-white/95 border border-slate-200/50 rounded-xl shadow-2xl min-w-[220px] backdrop-blur-xl dark:bg-[#0B0F17]/95 dark:border-white/10"
                >
                  {/* Asset Selection Section */}
                  <div className="mb-2 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest dark:text-white/30">Seleziona Asset ({favoriteCharts.length}/3)</span>
                  </div>
                  <div className="space-y-1 mb-4">
                    {assets.map((a) => (
                      <button
                        key={a.symbol}
                        onClick={() => toggleFavorite(a.symbol)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all font-medium",
                          favoriteCharts.includes(a.symbol)
                            ? "bg-[#00D9A5]/10 text-[#00D9A5]"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
                        )}
                      >
                        <span>{a.symbol}</span>
                      </button>
                    ))}
                  </div>

                  {/* Color Selection Section */}
                  <div className="border-t border-white/5 pt-3 mb-4">
                    <div className="mb-2 px-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest dark:text-white/30">Colore Grafico</span>
                    </div>
                    <div className="flex items-center justify-between px-2">
                      {chartColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setChartLineColor(color)}
                          className={cn(
                            "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                            chartLineColor === color ? "border-white shadow-[0_0_8px_rgba(255,255,255,0.5)] scale-110" : "border-transparent opacity-50 hover:opacity-100"
                          )}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Sync Tickers Switch */}
                  <div className="border-t border-white/5 pt-3">
                    <button
                      onClick={() => setSyncEnabled(!syncEnabled)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <RefreshCw className={cn("w-4 h-4 transition-transform duration-500", syncEnabled && "rotate-180 text-[#00D9A5]")} />
                        <span className={cn("font-medium", syncEnabled ? "text-[#00D9A5]" : "text-slate-500 dark:text-white/50")}>Sync Tickers</span>
                      </div>
                      <div className={cn(
                        "w-8 h-4 rounded-full relative transition-colors",
                        syncEnabled ? "bg-[#00D9A5]" : "bg-slate-200 dark:bg-white/10"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm",
                          syncEnabled ? "left-4.5" : "left-0.5"
                        )} />
                      </div>
                    </button>
                    {syncEnabled && (
                      <p className="text-[9px] text-[#00D9A5]/60 mt-1 px-3 leading-tight italic">
                        Link charts, COT & Options
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={cn(
              "grid gap-4",
              visibleAssets.length === 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {visibleAssets.map((asset, index) => {
              const color = chartColors[index % chartColors.length];
              return (
                <button
                  key={asset.symbol}
                  onClick={() => handleFocusAsset(asset.symbol)}
                  className="group relative p-4 bg-white rounded-2xl !border !border-slate-400 shadow-[0_20px_50px_rgb(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.15)] transition-all text-left overflow-hidden dark:bg-white/[0.03] dark:!border-white/10 dark:hover:!border-white/20 dark:shadow-none font-apple"
                >
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-100 to-transparent opacity-0 group-hover:opacity-100 transition-opacity dark:from-white/5" />

                  <div className="mb-2 relative z-10 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1 tracking-tight">{asset.symbol}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-white tracking-tight">
                          {asset.price?.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Confidence Percentage - Repositioned to Top Right */}
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-black text-white uppercase tracking-[0.2em] leading-none mb-1">Confidenza</span>
                      <span className="text-lg font-black leading-none text-[#00D9A5]">
                        {asset.confidence}%
                      </span>
                    </div>
                  </div>

                  <div className="h-28 -ml-4 relative z-10 overflow-hidden rounded-lg mb-2">
                    {animationsReady && (
                      <GlowingChart
                        data={asset.sparkData || [30, 45, 35, 60, 42, 70, 55, 65, 50, 75]}
                        width={400}
                        height={110}
                        color={color}
                        showPrice={false}
                      />
                    )}
                  </div>

                  <div className="relative z-10 space-y-3 mt-4">
                    {/* Bias & Confidence Row - HIGHLIGHTED */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all",
                        getDailyOutlook(asset).conclusionType === 'bullish' ? "bg-[#00D9A5]/10 border-[#00D9A5]/20 text-[#00D9A5]" :
                          getDailyOutlook(asset).conclusionType === 'bearish' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                            "bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
                      )}>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          getDailyOutlook(asset).conclusionType === 'bullish' ? "bg-[#00D9A5]" :
                            getDailyOutlook(asset).conclusionType === 'bearish' ? "bg-red-500" :
                              "bg-yellow-500"
                        )} />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none">
                          {getDailyOutlook(asset).conclusion}
                        </p>
                      </div>
                    </div>

                    {/* Analysis Points - LARGER TEXT */}
                    <ul className="space-y-2">
                      {getDailyOutlook(asset).outlookLines.slice(0, 3).map((line, i) => (
                        <li key={i} className="flex items-start gap-3 text-base font-semibold text-white/95 leading-relaxed tracking-tight">
                          <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-[#00D9A5]/60 shadow-[0_0_8px_#00D9A5]/40 flex-shrink-0" />
                          <TypewriterText text={line} speed={20} delay={500 + i * 800} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="focus"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="animate-in fade-in slide-in-from-bottom-2 duration-[800ms]"
          >
            {/* Focus View Header - Compact */}
            <div className="flex flex-wrap items-center justify-between mb-5 gap-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-widest leading-none select-none">
                  {currentAsset.symbol}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white tracking-tight">
                    {currentAsset.price?.toLocaleString() || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <TechBadge variant={currentAsset.direction === 'Up' ? 'success' : 'warning'} className="px-3 py-1.5 font-bold uppercase tracking-[0.2em] leading-none flex flex-col items-center gap-0.5">
                    <span className="text-xs">Confidenza</span>
                    <span className="text-sm font-black">{currentAsset.confidence}%</span>
                  </TechBadge>
                </div>
              </div>
            </div>

            {/* Big Chart - Compatto */}
            <div className="h-[100px] mb-6 relative group overflow-hidden">
              {/* Hover Gradient - Neutral */}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-100 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity dark:from-white/5" />
              <div className="w-full h-full flex items-center justify-center">
                {animationsReady && (
                  <DetailChart
                    data={(currentAsset.sparkData || [30, 45, 35, 60, 42, 70, 55, 65, 50, 75]).map((val, i) => ({
                      date: `${10 + (i * 2)}:00`,
                      value: val
                    }))}
                    height={100}
                    color={chartLineColor}
                    showgrid={false}
                  />
                )}
              </div>
            </div>

            {/* Details Grid - Compact */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2">
                <h5 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-4">Analisi Strutturale</h5>
                <ul className="space-y-3">
                  {dailyOutlook.outlookLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-4 text-base font-semibold text-white/95 leading-relaxed tracking-tight">
                      <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-[#00D9A5] shadow-[0_0_10px_#00D9A5] flex-shrink-0" />
                      <TypewriterText text={line} speed={20} delay={600 + i * 1000} />
                    </li>
                  ))}
                  {/* Engine Drivers - Integrated */}
                  {currentAsset.drivers?.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/5">
                      <h5 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">Engine Drivers</h5>
                      <div className="flex flex-wrap gap-2">
                        {currentAsset.drivers.map((driver, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-white/60 uppercase tracking-widest"
                          >
                            {driver}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </ul>
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <h5 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-4">Metriche Rapide</h5>
                  <div className="grid grid-cols-2 gap-y-6">
                    <div>
                      <p className="text-xs text-white uppercase font-black tracking-[0.2em] mb-1 leading-none">Volatilità</p>
                      <p className="text-lg font-bold text-[#00D9A5] tracking-tight leading-none">Alta</p>
                    </div>
                    <div>
                      <p className="text-xs text-white uppercase font-black tracking-[0.2em] mb-1 leading-none">Impulso</p>
                      <p className="text-lg font-bold text-[#00D9A5] tracking-tight leading-none">{currentAsset.impulse || 'Stabile'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-white uppercase font-black tracking-[0.2em] mb-1 leading-none">Regime</p>
                      <p className="text-lg font-bold text-[#00D9A5] tracking-tight leading-none">Trend</p>
                    </div>
                  </div>

                  {/* Source Breakdown - Integrated */}
                  {currentAsset.scores && Object.keys(currentAsset.scores).length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/5">
                      <h5 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4">Source Breakdown</h5>
                      <div className="space-y-3">
                        {Object.entries(currentAsset.scores).map(([source, score]) => (
                          <div key={source} className="group">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest group-hover:text-white/60 transition-colors">
                                {source}
                              </span>
                              <span className={cn(
                                "text-[10px] font-mono font-bold",
                                score > 0 ? "text-[#00D9A5]" : score < 0 ? "text-red-400" : "text-white/30"
                              )}>
                                {score > 0 ? '+' : ''}{score.toFixed(2)}
                              </span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.abs(score) * 100}%` }}
                                className={cn(
                                  "h-full rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                                  score > 0 ? "bg-[#00D9A5]" : "bg-red-500"
                                )}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </TechCard >
  );
};


// Risk Overview - Compact Inline
const RiskPanel = ({ vix, regime }) => (
  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-[#00D9A5]" />
        <span className="text-base text-white/50">VIX</span>
        <span className={cn(
          "text-lg font-bold font-mono",
          vix?.current > 22 ? "text-red-400" : vix?.current > 18 ? "text-yellow-400" : "text-[#00D9A5]"
        )}>
          {vix?.current || '-'}
        </span>
        <span className={cn(
          "text-base",
          vix?.change > 0 ? "text-red-400" : "text-[#00D9A5]"
        )}>
          ({vix?.change > 0 ? '+' : ''}{vix?.change || 0}%)
        </span>
      </div>
      <div className="w-px h-4 bg-white/10" />
      <div className="flex items-center gap-2">
        <span className="text-base text-white/50">Regime</span>
        <span className={cn(
          "text-lg font-bold",
          regime === 'risk-off' ? "text-red-400" : regime === 'risk-on' ? "text-[#00D9A5]" : "text-yellow-400"
        )}>
          {regime?.toUpperCase() || '-'}
        </span>
      </div>
    </div>
  </div>
);

// COT Summary Panel - Premium Carousel Style
const COTPanel = ({ cotData, favoriteCOT, onFavoriteCOTChange, animationsReady = false }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  if (!cotData?.data) return null;

  const instruments = Object.keys(cotData.data || {});
  const validFavorites = (favoriteCOT || []).filter((symbol) => instruments.includes(symbol));
  const selectedInstruments = validFavorites.length > 0 ? validFavorites : instruments.slice(0, 2);

  const nextInstrument = () => {
    if (selectedInstruments.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % selectedInstruments.length);
  };

  const prevInstrument = () => {
    if (selectedInstruments.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + selectedInstruments.length) % selectedInstruments.length);
  };

  const currentSymbol = selectedInstruments.length > 0
    ? selectedInstruments[Math.min(activeIndex, selectedInstruments.length - 1)]
    : null;
  const data = currentSymbol ? cotData?.data?.[currentSymbol] : null;

  const selectInstrument = (inst) => {
    if (!onFavoriteCOTChange) return;
    onFavoriteCOTChange([inst]);
    setActiveIndex(0);
    setShowSelector(false);
  };

  const getInstitutionalPositions = (data) => {
    if (!data?.categories) return { long: 0, short: 0 };
    if (data.categories.asset_manager) return data.categories.asset_manager;
    if (data.categories.managed_money) return data.categories.managed_money;
    return { long: 0, short: 0 };
  };

  const pos = data ? getInstitutionalPositions(data) : { long: 0, short: 0 };
  const netPos = (pos.long || 0) - (pos.short || 0);
  const formattedNetPos = (netPos > 0 ? '+' : '') + (netPos / 1000).toFixed(1) + 'k';

  // Mock historical data for the bar chart (last 4 reporting periods)
  const historicalData = [
    { label: 'giu.', value: 12, estimate: false },
    { label: 'set.', value: 37, estimate: false },
    { label: 'dic.', value: 42, estimate: false },
    { label: 'mar.', value: 68, estimate: true },
  ];

  // Metrics specifically for the current asset
  const getMetrics = (data, pos) => {
    const total = (pos.long || 0) + (pos.short || 0);
    const ratio = total > 0 ? Math.round((pos.long / total) * 100) : 50;
    const confidence = Math.min(95, Math.max(40, ratio > 60 ? ratio + 10 : 100 - ratio + 10));
    const crowding = Math.min(98, Math.max(30, Math.abs(ratio - 50) + 50));
    const squeezeRisk = data?.bias === 'Bear' ? Math.min(95, 70 + Math.random() * 25) :
      data?.bias === 'Bull' ? Math.max(20, 30 + Math.random() * 25) : 50;
    return {
      confidence: Math.round(confidence),
      crowding: Math.round(crowding),
      squeezeRisk: Math.round(squeezeRisk)
    };
  };

  const metrics = getMetrics(data, pos);

  // Generate interpretive text - 4 bullet points technical summary
  const getInterpretation = (data, metrics) => {
    if (!data) return ['Caricamento dati...', 'Attendere prego.', '...', '...'];
    if (data.bias === 'Bull') {
      return [
        `Accumulo istituzionale forte con confidence al ${metrics.confidence}%.`,
        metrics.crowding > 75 ? 'Crowding elevato: possibile consolidamento prima di nuova estensione.' : 'Trend rialzista supportato da fondamentali e flussi netti positivi.',
        `Rapporto Long/Short favorevole — net position in espansione da 3 settimane.`,
        'Target tecnico istituzionale su livelli superiori; supporto dinamico confermato.'
      ];
    } else if (data.bias === 'Bear') {
      return [
        `Distribuzione istituzionale attiva — confidence al ${metrics.confidence}%.`,
        metrics.squeezeRisk > 75 ? 'Short squeeze risk critico: monitorare chiusure sopra resistenza chiave.' : 'Pressione ribassista confermata da flussi netti e open interest.',
        `Crowding al ${metrics.crowding}% — eccesso di consenso short da gestire con cautela.`,
        'Scenario risk-off dominante; attesa breakout direzionale su dati macro.'
      ];
    }
    return [
      'Posizionamento neutrale degli istituzionali — nessuna direzionalità chiara.',
      'Flussi bilanciati tra long e short con volatilità in contrazione.',
      'Attendere prossima release COT per conferma bias settimanale.',
      'Monitoraggio incrociato con options flow per segnali anticipatori.'
    ];
  };

  const interpretation = getInterpretation(data, metrics);

  if (selectedInstruments.length === 0) {
    return (
      <TechCard className="p-4 h-full font-apple bg-[#0F1115] border-[#1C1F26] rounded-[32px] shadow-2xl relative flex items-center justify-center">
        <p className="text-sm text-white/60 text-center">COT non disponibile al momento.</p>
      </TechCard>
    );
  }

  return (
    <TechCard className="p-3 h-full font-apple bg-[#0F1115] border-[#1C1F26] rounded-[32px] shadow-2xl relative flex flex-col">
      {/* Glow effect in background */}
      <div className="absolute top-[-100px] right-[-100px] w-64 h-64 bg-[#00D9A5]/5 blur-[80px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#00D9A5]" />
          <span className="font-medium text-base text-white/90">COT Institutional</span>
          {/* Info Button */}
          <div className="relative">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
            >
              <Info className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>

        {/* Info Tooltip - Centered overlay in panel */}
        <AnimatePresence>
          {showInfo && (
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
              {/* Glass effect content layer */}
              <div className="relative px-8 py-6 border border-[#00D9A5]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
                <div className="flex items-center justify-between mb-5">
                  <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida COT</h4>
                  <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                    <X className="w-5 h-5 text-white/50" />
                  </button>
                </div>
                <div className="space-y-5 text-left">
                  <p className="text-lg text-white leading-relaxed font-normal">
                    Il <span className="text-[#00D9A5] font-semibold">COT (Commitment of Traders)</span> è un report settimanale della CFTC che rivela il posizionamento degli operatori istituzionali (hedge fund, asset manager) sui mercati futures. È lo strumento chiave per capire dove si muove il <span className="text-white/90 italic">"smart money"</span>.
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
                          <span className="font-semibold">Net Position:</span> Differenza tra Long e Short.
                          <span className="text-[#00D9A5] font-semibold"> Positivo = bullish</span>,
                          <span className="text-red-400 font-semibold"> Negativo = bearish</span>.
                        </p>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold">Scale W-3 → W-0:</span> Evoluzione bias ultime 4 settimane.
                          Valori crescenti = <span className="italic">accumulazione</span>, calanti = <span className="italic">distribuzione</span>.
                        </p>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_10px_#00D9A5] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold text-[#00D9A5]">Confidence:</span> Forza della convinzione.
                          Valori &gt;70% indicano forte consenso direzionale.
                        </p>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_#FACC15] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold text-yellow-400">Crowding:</span> Affollamento posizioni.
                          Valori &gt;80% = eccesso consenso → possibile inversione.
                        </p>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="mt-2.5 w-2 h-2 rounded-full bg-red-400 shadow-[0_0_10px_#F87171] flex-shrink-0" />
                        <p className="text-lg text-white leading-relaxed font-normal">
                          <span className="font-semibold text-red-400">Squeeze:</span> Rischio short squeeze.
                          Valori alti = molti short esposti. Rally esplosivo se sale. <span className="text-red-400 font-semibold">Cautela se short.</span>
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
                      Usa il COT come filtro direzionale: opera nella direzione del posizionamento istituzionale, evita di andare contro il "smart money".
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-4">
          <div className="relative" onMouseLeave={() => setShowSelector(false)}>
            <button
              onMouseEnter={() => setShowSelector(true)}
              onClick={() => setShowSelector(!showSelector)}
              className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
            >
              <Eye className="w-4 h-4 text-white" />
            </button>
            <AnimatePresence>
              {showSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  className="absolute right-0 top-full pt-1 z-50"
                >
                  <div className="p-3 bg-[#161B22] border border-white/10 rounded-2xl shadow-2xl min-w-[180px] backdrop-blur-xl">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3 px-2">Monitorati</p>
                    <div className="space-y-1 max-h-[250px] overflow-y-auto scrollbar-thin">
                      {instruments.map(inst => (
                        <button
                          key={inst}
                          onClick={() => selectInstrument(inst)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all",
                            selectedInstruments.includes(inst) ? "bg-[#00D9A5]/10 text-[#00D9A5]" : "text-white/50 hover:bg-white/5"
                          )}
                        >
                          {inst}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col -mt-[18px]">
        {/* Main Title & Value */}
        {/* Compact Title Row & Chart */}
        {/* Left Aligned Compact Row */}
        {/* Left Stack Title & NetPos */}
        {/* Left Stack Title & NetPos - Big & Spaced */}
        <div className="flex flex-col items-start px-1 mb-0 relative top-[18px] shrink-0">
          <h2 className="text-xl font-bold text-white leading-none mb-0.5">{currentSymbol || '-'}</h2>
          <div className="flex items-baseline gap-2 mt-0">
            <span className={cn(
              "text-3xl font-bold tracking-tighter leading-none",
              netPos >= 0 ? "text-[#00D9A5]" : "text-red-400"
            )}>{formattedNetPos}</span>
            <span className="text-xs text-white/70 font-bold uppercase tracking-wider relative -top-[1px]">Net Position</span>
          </div>
        </div>

        {/* Rolling Bias Section */}
        <div className="mb-0 -mt-[8px] px-0">
          <WeeklyBiasScale
            data={data?.rolling_bias || [
              { label: 'W-3', value: 45, isCurrent: false },
              { label: 'W-2', value: 37, isCurrent: false },
              { label: 'W-1', value: 55, isCurrent: false, isPrevious: true },
              { label: 'W-0', value: metrics.confidence, isCurrent: true }
            ]}
            mini={true}
            showWrapper={false}
            trigger={animationsReady}
          />
        </div>

        {/* Metrics Row */}
        <div className="flex items-start justify-evenly px-0 mb-1">
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-white/70 uppercase tracking-widest mb-0.5">Confidence</span>
            <span className="text-xl font-bold text-[#00D9A5]"><CountUp value={metrics.confidence} suffix="%" duration={1800} delay={200} /></span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-white/70 uppercase tracking-widest mb-0.5">Crowding</span>
            <span className={cn(
              "text-xl font-bold",
              metrics.crowding > 75 ? "text-yellow-400" : "text-white"
            )}><CountUp value={metrics.crowding} suffix="%" duration={1800} delay={400} /></span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-white/70 uppercase tracking-widest mb-0.5">Squeeze</span>
            <span className={cn(
              "text-xl font-bold",
              metrics.squeezeRisk > 70 ? "text-red-400" : "text-[#00D9A5]"
            )}><CountUp value={metrics.squeezeRisk} suffix="%" duration={1800} delay={600} /></span>
          </div>
        </div>


        {/* Bias Interpretation */}
        <div className="relative top-[4px] p-4 rounded-xl bg-white/5 border border-white/10">
          <ul className="space-y-1.5 text-base text-white/90">
            {interpretation.slice(0, 4).map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#00D9A5] mt-0.5">•</span>
                <TypewriterText text={line} speed={20} delay={300 + i * 800} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TechCard >
  );
};




// Options Flow Panel - Enhanced Interactive
const OptionsPanel = ({ optionsData, animationsReady = false, selectedAsset: propAsset, onAssetChange }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [internalSelectedAsset, setInternalSelectedAsset] = useState('XAUUSD');

  const selectedAsset = propAsset || internalSelectedAsset;
  const handleAssetChange = (asset) => {
    if (onAssetChange) {
      onAssetChange(asset);
    } else {
      setInternalSelectedAsset(asset);
    }
    setShowSelector(false);
  };

  const availableAssets = ['XAUUSD', 'NAS100', 'SP500', 'EURUSD', 'BTCUSD'];

  // Asset-specific options data with millions values (simulated - will come from backend)
  const assetOptionsData = {
    XAUUSD: {
      call_ratio: 55, put_ratio: 45, net_flow: 52, bias: 'bullish',
      call_million: 128, put_million: 105, net_million: 23,
      call_change: -5.2, put_change: 8.4, net_change: -12.5,
      gamma_exposure: 55, gamma_billion: 0.9,
      interpretation: [
        'Flusso Gold moderatamente bullish ma in rallentamento.',
        'Long liquidation significativa: -14.9% gross longs speculativi.',
        'Supporto a $5000, resistenza chiave a $5100.'
      ]
    },
    NAS100: {
      call_ratio: 50, put_ratio: 50, net_flow: 48, bias: 'neutral',
      call_million: 88, put_million: 90, net_million: -2,
      call_change: -2.8, put_change: 4.5, net_change: -6.2,
      gamma_exposure: 48, gamma_billion: 0.6,
      interpretation: [
        'Flusso NAS100 neutrale, equilibrio call/put.',
        'Tech in pressione post-NFP forte (ritardo tagli).',
        'COT speculatori net short, cautela su posizioni long.'
      ]
    },
    SP500: {
      call_ratio: 48, put_ratio: 52, net_flow: 45, bias: 'neutral',
      call_million: 165, put_million: 178, net_million: -13,
      call_change: -3.5, put_change: 5.2, net_change: -8.1,
      gamma_exposure: 48, gamma_billion: 4.8,
      interpretation: [
        'SP500 in equilibrio post-NFP beat (+130K vs 65K attesi).',
        'Speculatori COT net short -132.9K contratti.',
        'Range 6850-7000, gamma flip a 6900.'
      ]
    },
    EURUSD: {
      call_ratio: 62, put_ratio: 38, net_flow: 68, bias: 'bullish',
      call_million: 78, put_million: 48, net_million: 30,
      call_change: 8.5, put_change: -4.2, net_change: 14.2,
      gamma_exposure: 65, gamma_billion: 0.5,
      interpretation: [
        'Flusso EURUSD decisamente bullish.',
        'EUR net long speculativo a 163K (max 6 mesi).',
        'DXY in calo a 96.60, supporta EUR sopra 1.18.'
      ]
    },
    BTCUSD: {
      call_ratio: 38, put_ratio: 62, net_flow: 32, bias: 'bearish',
      call_million: 142, put_million: 232, net_million: -90,
      call_change: -18.5, put_change: 22.8, net_change: -35.4,
      gamma_exposure: 30, gamma_billion: -2.1,
      interpretation: [
        'BTCUSD flusso fortemente bearish.',
        'Sell-off da $100K a $67K, put premium dominante.',
        'Liquidazioni long cascata, supporto critico $65K.'
      ]
    }
  };

  const currentData = assetOptionsData[selectedAsset] || assetOptionsData.XAUUSD;

  return (
    <TechCard className="p-3 h-full font-apple relative">
      {/* Info Tooltip - Genie Effect */}
      <AnimatePresence>
        {showInfo && (
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
                <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida Options</h4>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
              <div className="space-y-5 text-left">
                <p className="text-lg text-white leading-relaxed font-normal">
                  L'<span className="text-[#00D9A5] font-semibold">Options Flow</span> traccia i flussi di opzioni call e put sui mercati principali. Rivela dove gli istituzionali stanno posizionando le loro scommesse direzionali attraverso il mercato delle opzioni.
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
                        <span className="font-semibold">Call/Put Ratio:</span> Proporzione tra opzioni call (rialziste) e put (ribassiste).
                        <span className="text-[#00D9A5] font-semibold"> Call &gt; 55% = bullish</span>,
                        <span className="text-red-400 font-semibold"> Put &gt; 55% = bearish</span>.
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold">Net Flow:</span> Differenza netta tra flussi call e put in milioni.
                        Indica la <span className="italic">direzione dominante</span> del "smart money".
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_10px_#00D9A5] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold text-[#00D9A5]">Gamma Exposure:</span> Esposizione dei market maker.
                        <span className="text-[#00D9A5] font-semibold"> Positivo = supporto ai livelli</span>,
                        <span className="text-red-400 font-semibold"> Negativo = volatilità amplificata</span>.
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_#FACC15] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold text-yellow-400">Milioni (M/B):</span> Volume in milioni o miliardi di dollari.
                        Flussi &gt;100M indicano <span className="italic">interesse istituzionale significativo</span>.
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
                    Usa l'Options Flow come conferma direzionale: se COT e Options convergono sulla stessa direzione, la probabilità di successo aumenta significativamente.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#00D9A5]" />
          <span className="font-medium text-base text-white/90">Options Flow</span>
          {/* Info Button */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
          >
            <Info className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        {/* Eye Icon Selector */}
        <div className="relative" onMouseLeave={() => setShowSelector(false)}>
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="p-1.5 rounded-lg transition-colors border bg-slate-100 border-slate-200 hover:bg-slate-200 dark:bg-white/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            <Eye className="w-4 h-4 text-slate-500 dark:text-white/60" />
          </button>
          {/* Dropdown Selector */}
          <AnimatePresence>
            {showSelector && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 top-full z-50 p-3 bg-white/95 border border-slate-200 rounded-lg shadow-xl min-w-[160px] dark:bg-black/90 dark:border-white/10"
              >
                <div className="mb-2 px-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest dark:text-white/30">Seleziona Asset</p>
                </div>
                <div className="space-y-1">
                  {availableAssets.map(asset => (
                    <button
                      key={asset}
                      onClick={() => handleAssetChange(asset)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors font-medium",
                        selectedAsset === asset
                          ? "bg-[#00D9A5]/10 text-[#00D9A5]"
                          : "bg-transparent text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/5"
                      )}
                    >
                      <span>{asset}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Asset Name - Prominent Display */}
      <div className="flex items-center justify-between mb-1 px-2">
        <span className="text-xl font-bold text-white">{selectedAsset}</span>
        <span className={cn(
          "px-2 py-1 rounded text-sm font-semibold",
          currentData.bias === 'bullish' ? "bg-[#00D9A5]/20 text-[#00D9A5]" :
            currentData.bias === 'bearish' ? "bg-red-500/20 text-red-400" :
              "bg-yellow-500/20 text-yellow-400"
        )}>
          {currentData.bias === 'bullish' ? 'Bullish' : currentData.bias === 'bearish' ? 'Bearish' : 'Neutral'}
        </span>
      </div>

      {/* Three Circles Layout: Call | Net Flow | Put - Responsive */}
      <div className="flex items-end justify-center gap-2 sm:gap-4 lg:gap-6 mb-0 p-0 overflow-hidden" style={{ minHeight: '80px' }}>
        {/* Left - Calls with Millions */}
        <div className="flex flex-col items-center flex-shrink min-w-0">
          <div className="relative w-[75px] h-[75px] sm:w-[90px] sm:h-[90px] lg:w-[105px] lg:h-[105px]">
            {animationsReady && (
              <MiniDonut
                value={currentData.call_ratio}
                size="100%"
                strokeWidth={6}
                color="#00D9A5"
                showValue={false}
              />
            )}
            {animationsReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium",
                  currentData.call_change >= 0 ? "text-[#00D9A5]" : "text-red-400"
                )}>
                  <CountUp value={currentData.call_change} prefix={currentData.call_change >= 0 ? '+' : ''} suffix="%" duration={1200} delay={300} />
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#00D9A5]"><CountUp value={currentData.call_million} suffix="M" duration={1500} delay={500} /></span>
              </div>
            )}
          </div>
          <p className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-2 font-medium">Calls</p>
        </div>

        {/* Center - Net Flow (larger, prominent) */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="relative w-[95px] h-[95px] sm:w-[115px] sm:h-[115px] lg:w-[135px] lg:h-[135px]">
            {animationsReady && (
              <MiniDonut
                value={currentData.net_flow}
                size="100%"
                strokeWidth={8}
                color={currentData.bias === 'bearish' ? "#EF4444" : "#00D9A5"}
                showValue={false}
              />
            )}
            {animationsReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium",
                  currentData.net_change >= 0 ? "text-[#00D9A5]" : "text-red-400"
                )}>
                  <CountUp value={currentData.net_change} prefix={currentData.net_change >= 0 ? '+' : ''} suffix="%" duration={1200} delay={300} />
                </span>
                <span className={cn(
                  "text-lg sm:text-xl lg:text-2xl font-bold",
                  currentData.bias === 'bearish' ? "text-red-400" : "text-[#00D9A5]"
                )}>
                  <CountUp value={currentData.net_million} prefix={currentData.net_million > 0 ? '+' : ''} suffix="M" duration={1800} delay={500} />
                </span>
              </div>
            )}
          </div>
          <p className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-2 font-medium">Net Flow</p>
        </div>

        {/* Right - Puts with Millions */}
        <div className="flex flex-col items-center flex-shrink min-w-0">
          <div className="relative w-[75px] h-[75px] sm:w-[90px] sm:h-[90px] lg:w-[105px] lg:h-[105px]">
            {animationsReady && (
              <MiniDonut
                value={currentData.put_ratio}
                size="100%"
                strokeWidth={6}
                color="#EF4444"
                showValue={false}
              />
            )}
            {animationsReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium",
                  currentData.put_change >= 0 ? "text-[#00D9A5]" : "text-red-400"
                )}>
                  <CountUp value={currentData.put_change} prefix={currentData.put_change >= 0 ? '+' : ''} suffix="%" duration={1200} delay={300} />
                </span>
                <span className="text-xs sm:text-sm font-bold text-red-400"><CountUp value={currentData.put_million} suffix="M" duration={1500} delay={500} /></span>
              </div>
            )}
          </div>
          <p className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-2 font-medium">Puts</p>
        </div>
      </div>

      {/* Summary Line */}
      <p className="text-xs text-white/50 text-center mb-3 italic">
        {currentData.bias === 'bullish'
          ? 'Flussi istituzionali favorevoli al rialzo'
          : currentData.bias === 'bearish'
            ? 'Pressione ribassista sui derivati'
            : 'Equilibrio tra opzioni call e put'}
      </p>

      {/* Gamma Exposure Bar */}
      <div className="mb-3 px-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg text-white/90 font-semibold">Gamma Exposure</span>
          <span className={cn(
            "text-xl font-bold",
            currentData.gamma_billion >= 0 ? "text-[#00D9A5]" : "text-red-400"
          )}>
            {currentData.gamma_billion >= 0 ? '+' : ''}{currentData.gamma_billion}B
          </span>
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              currentData.gamma_exposure >= 50 ? "bg-[#00D9A5]" : "bg-red-400"
            )}
            style={{ width: `${currentData.gamma_exposure}%` }}
          />
        </div>
      </div>

      {/* Options Interpretation - Bullet Points styled like Screening */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <ul className="space-y-1.5 text-base text-white/90">
          {currentData.interpretation.map((line, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-[#00D9A5] mt-0.5">•</span>
              <TypewriterText text={line} speed={20} delay={300 + idx * 800} />
            </li>
          ))}
          <li className="flex items-start gap-2">
            <span className="text-[#00D9A5] mt-0.5">•</span>
            <TypewriterText text="Monitorare variazioni giornaliere per conferma direzionale." speed={20} delay={300 + 3 * 800} />
          </li>
        </ul>
      </div>

      {/* Compact Disclaimer Summary - Matching Chart Style */}

    </TechCard>
  );
};

// Strategy Selector Panel - With checkbox filtering from Strategia page
const StrategySelectorPanel = ({ strategies, expandedNews, setExpandedNews }) => {
  const [showSelector, setShowSelector] = useState(false);

  // Available strategies from StrategyPage (with win rates)
  const availableStrategies = [
    { id: 'volguard-mr', name: 'VolGuard Mean-Reversion', shortName: 'VG', winRate: 72 },
    { id: 'gamma-magnet', name: 'GammaMagnet Convergence', shortName: 'GM', winRate: 68 },
    { id: 'strategy-1', name: 'News Spike Reversion', shortName: 'S1', winRate: 62 },
    { id: 'rate-vol-alignment', name: 'Rate-Volatility Alignment', shortName: 'RV', winRate: 62 },
    { id: 'strategy-2', name: 'VIX Range Fade', shortName: 'S2', winRate: 58 },
    { id: 'multi-day-ra', name: 'Multi-Day Rejection', shortName: 'MD', winRate: 56 },
  ];

  // Selected strategies (default: top 3 by win rate)
  const [selectedStrategies, setSelectedStrategies] = useState(['volguard-mr', 'gamma-magnet', 'strategy-1']);

  // Today's signals for each strategy (simulated - would come from backend)
  const todaySignals = [
    { strategyId: 'volguard-mr', asset: 'SP500', bias: 'Long', winRate: 72, summary: 'VIX 17.62 stabile, range post-NFP. SPX tra 6900-6950. Entry su test gamma flip 6900.', trigger: 'VIX Stable + Range' },
    { strategyId: 'gamma-magnet', asset: 'NAS100', bias: 'Short', winRate: 68, summary: 'Speculatori COT net short. Prezzo vicino a call wall, respinto. Target 21200.', trigger: 'COT Short + Call Wall' },
    { strategyId: 'gamma-magnet', asset: 'SP500', bias: 'Long', winRate: 68, summary: 'Gamma positivo sopra 6900. Prezzo attratto verso 6950. Supporto forte.', trigger: 'Gamma Magnet 6950' },
    { strategyId: 'strategy-1', asset: 'XAUUSD', bias: 'Long', winRate: 62, summary: 'Gold a $5055 dopo sell-off. Long liquidation completata. Rimbalzo atteso da supporto.', trigger: 'Post-Liquidation Bounce' },
    { strategyId: 'strategy-1', asset: 'BTCUSD', bias: 'Short', winRate: 62, summary: 'BTC $67K in sell-off da $100K. Put flow dominante. Target $65K se perde supporto.', trigger: 'Breakdown Setup' },
    { strategyId: 'rate-vol-alignment', asset: 'EURUSD', bias: 'Long', winRate: 62, summary: 'DXY debole a 96.60. EUR net long speculativo max 6 mesi. Target 1.1950.', trigger: 'USD Weakness' },
    { strategyId: 'strategy-2', asset: 'NAS100', bias: 'Long', winRate: 58, summary: 'VIX contenuto, Tech in correzione. Fade setup su supporto 21200.', trigger: 'VIX Low + Dip Buy' },
    { strategyId: 'multi-day-ra', asset: 'XAUUSD', bias: 'Long', winRate: 56, summary: 'Rejection con wick lunga su $5000. Supporto multi-day testato con successo.', trigger: 'Multi-Day Support Hold' },
  ];

  // Filter signals by selected strategies and sort by win rate
  const filteredSignals = todaySignals
    .filter(s => selectedStrategies.includes(s.strategyId))
    .sort((a, b) => b.winRate - a.winRate);

  const toggleStrategy = (strategyId) => {
    if (selectedStrategies.includes(strategyId)) {
      if (selectedStrategies.length > 1) {
        setSelectedStrategies(selectedStrategies.filter(id => id !== strategyId));
      }
    } else {
      setSelectedStrategies([...selectedStrategies, strategyId]);
    }
  };

  const selectAll = () => setSelectedStrategies(availableStrategies.map(s => s.id));
  const selectNone = () => setSelectedStrategies([availableStrategies[0].id]); // Keep at least one

  return (
    <TechCard className="p-4 font-apple">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-base font-medium text-white/90 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-[#00D9A5]" />
          Report Posizionamenti
        </h4>
        {/* Strategy Selector */}
        <div className="relative" onMouseLeave={() => setShowSelector(false)}>
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="p-1.5 rounded-lg transition-colors border flex items-center gap-1 bg-slate-100 border-slate-200 hover:bg-slate-200 dark:bg-white/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            <Eye className="w-4 h-4 text-slate-500 dark:text-white/60" />
            <span className="text-xs text-slate-400 dark:text-white/40">{selectedStrategies.length}/{availableStrategies.length}</span>
          </button>
          {/* Dropdown Selector */}
          <AnimatePresence>
            {showSelector && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 top-full z-50 p-3 bg-white/95 border border-slate-200 rounded-lg shadow-xl min-w-[220px] dark:bg-black/95 dark:border-white/10"
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest dark:text-white/30">Strategie</p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-[10px] font-bold uppercase tracking-wider text-[#00D9A5] hover:underline">Tutte</button>
                    <button onClick={selectNone} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:underline dark:text-white/40">Reset</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {availableStrategies.map(strategy => (
                    <button
                      key={strategy.id}
                      onClick={() => toggleStrategy(strategy.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors font-medium",
                        selectedStrategies.includes(strategy.id)
                          ? "bg-[#00D9A5]/10 text-[#00D9A5]"
                          : "bg-transparent text-slate-500 hover:bg-slate-100 dark:text-white/50 dark:hover:bg-white/5"
                      )}
                    >
                      <span>{strategy.name}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Filtered Signals List */}
      <div className="space-y-2 max-h-[450px] overflow-y-auto scrollbar-thin">
        {filteredSignals.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-4">Nessun segnale per le strategie selezionate</p>
        ) : (
          filteredSignals.map((s, i) => {
            const strategy = availableStrategies.find(st => st.id === s.strategyId);
            return (
              <div
                key={i}
                onClick={() => setExpandedNews(expandedNews === `sig-${i}` ? null : `sig-${i}`)}
                onMouseLeave={() => expandedNews === `sig-${i}` && setExpandedNews(null)}
                className={cn(
                  "p-2.5 rounded-lg transition-all cursor-pointer",
                  "bg-white/5 hover:bg-white/8",
                  expandedNews === `sig-${i}` && "ring-1 ring-[#00D9A5]/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">{strategy?.shortName}</span>
                    <span className="text-base font-medium text-white/90">{s.asset}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TechBadge variant={s.bias === 'Long' ? 'success' : s.bias === 'Short' ? 'danger' : 'warning'}>
                      {s.bias}
                    </TechBadge>
                    <ChevronDown className={cn(
                      "w-4 h-4 text-white/30 transition-transform",
                      expandedNews === `sig-${i}` && "rotate-180"
                    )} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">{s.trigger}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00D9A5] rounded-full"
                        style={{ width: `${s.winRate}%` }}
                      />
                    </div>
                    <span className="text-xs text-white/60">{s.winRate}%</span>
                  </div>
                </div>
                <AnimatePresence>
                  {expandedNews === `sig-${i}` && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 p-3 bg-black/40 rounded-lg border border-[#00D9A5]/20">
                        <p className="text-base text-slate-700 leading-relaxed dark:text-white/90">
                          <span className="text-[#00D9A5] font-bold block mb-1">Setup</span>
                          {s.summary}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </TechCard>
  );
};

// News & Activity Sidebar
const ActivitySidebar = ({ news, events, strategies }) => {
  const [activeTab, setActiveTab] = useState('news');
  const [expandedNews, setExpandedNews] = useState(null);

  const newsData = news || [
    { title: 'NFP (Jan)', time: '14:30', impact: 'high', currency: 'USD', forecast: '65K', previous: '256K', actual: '130K', countdown: 'Uscito', summary: 'Payrolls a 130K, il doppio delle attese. Disoccupazione scesa a 4.3%. Mercato prezza taglio Fed a luglio, non più giugno.' },
    { title: 'Unemployment Rate', time: '14:30', impact: 'high', currency: 'USD', forecast: '4.4%', previous: '4.4%', actual: '4.3%', countdown: 'Uscito', summary: 'Tasso disoccupazione migliorato. Mercato lavoro solido nonostante revisioni al ribasso del 2025 (-862K).' },
    { title: 'Average Hourly Earnings', time: '14:30', impact: 'high', currency: 'USD', forecast: '3.5%', previous: '3.6%', actual: '3.7%', countdown: 'Uscito', summary: 'Salari in crescita 3.7% YoY, sopra inflazione. Pressione hawkish sulla Fed.' },
    { title: 'Fed Speeches', time: '16:00', impact: 'medium', currency: 'USD', forecast: '-', previous: '-', actual: null, countdown: '15m', summary: 'Diversi policymaker Fed in programma. Tono atteso post-NFP forte: cautela sui tagli.' },
    { title: 'US 10Y Auction', time: '19:00', impact: 'medium', currency: 'USD', forecast: '4.18%', previous: '4.14%', actual: null, countdown: '3h', summary: 'Asta Treasury 10Y. Yield salito a 4.18% dopo NFP. Monitorare domanda istituzionale.' },
    { title: 'CPI (Jan)', time: 'Ven 14:30', impact: 'high', currency: 'USD', forecast: '2.5%', previous: '2.9%', actual: null, countdown: '2 giorni', summary: 'Dato inflazione cruciale dopo NFP forte. Se sopra attese, taglio Fed rinviato ulteriormente.' },
    { title: 'CBO Budget Outlook', time: '18:00', impact: 'medium', currency: 'USD', forecast: '-', previous: '-', actual: null, countdown: '2h', summary: 'Pubblicazione outlook fiscale CBO. Focus su deficit e traiettoria debito pubblico USA.' },
  ];

  return (
    <div className="space-y-4">
      {/* News Section */}
      <TechCard className="p-4 font-apple flex flex-col glass-edge fine-gray-border" style={{ maxHeight: '550px' }}>
        {/* Sticky Header */}
        <h4 className="text-base font-medium text-white/90 mb-3 flex items-center gap-2 sticky top-0 bg-inherit z-10 pb-2">
          <Newspaper className="w-5 h-5 text-[#00D9A5]" />
          News
        </h4>
        {/* Scrollable Content */}
        <div className="space-y-2 overflow-y-auto flex-1 scrollbar-thin">
          {newsData.map((item, i) => (
            <div
              key={i}
              onClick={() => setExpandedNews(expandedNews === i ? null : i)}
              onMouseLeave={() => expandedNews === i && setExpandedNews(null)}
              className={cn(
                "p-2.5 rounded-lg transition-all cursor-pointer subtle-divider",
                item.actual ? "bg-slate-50 border border-slate-200 dark:bg-[#1A1A1A] dark:border-white/10" : "bg-slate-50 hover:bg-slate-100 dark:bg-[#1A1A1A] dark:hover:bg-[#252525]",
                expandedNews === i && "ring-1 ring-slate-300 dark:ring-white/20"
              )}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-base font-medium text-slate-900 dark:text-white/90">{item.title}</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm",
                    item.countdown === 'Uscito' ? "text-[#00D9A5]" : "text-yellow-400/80"
                  )}>{item.countdown}</span>
                  <span className="text-base font-medium text-[#00D9A5]">{item.time}</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-slate-400 dark:text-white/30 transition-transform",
                    expandedNews === i && "rotate-180"
                  )} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-base font-medium",
                    item.currency === 'USD' ? "text-[#D4AF37]" : "text-slate-400 dark:text-white/40"
                  )}>
                    {item.currency}
                  </span>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    item.impact === 'high' ? "bg-red-400" : "bg-yellow-400"
                  )} />
                </div>
                <div className="flex items-center gap-3 text-base">
                  <span className="text-slate-500 dark:text-white/50">P: <span className="font-bold text-slate-700 dark:text-white/80">{item.previous}</span></span>
                  <span className="text-slate-500 dark:text-white/50">F: <span className="font-bold text-slate-900 dark:text-white">{item.forecast}</span></span>
                  {item.actual && (
                    <span className="text-slate-500 dark:text-white/50">A: <span className="font-bold text-lg text-[#00D9A5]">{item.actual}</span></span>
                  )}
                </div>
              </div>
              {/* Expanded Summary */}
              <AnimatePresence>
                {expandedNews === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg dark:bg-black/40 dark:border-[#00D9A5]/20">
                      <p className="text-base text-slate-700 leading-relaxed dark:text-white/90">
                        <span className="text-[#00D9A5] font-bold block mb-1">Prospettiva</span>
                        {item.summary}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </TechCard>


      {/* Strategy Suggestions - Filtered by Selected Strategies */}
      <StrategySelectorPanel strategies={strategies} expandedNews={expandedNews} setExpandedNews={setExpandedNews} />
      <Link
        to="/strategies"
        className="block mt-3 text-center text-base text-[#00D9A5] hover:underline"
      >
        Vedi tutte le strategie →
      </Link>
    </div>
  );
};

// Daily Bias Header - Compact with inline expandable items (zoom in/out)
const DailyBiasHeader = ({ analyses, vix, regime, nextEvent }) => {
  const { subscription } = useAuth();
  const [expandedItem, setExpandedItem] = useState(null);

  const bullishCount = analyses ? Object.values(analyses).filter(a => a.direction === 'Up').length : 0;
  const bearishCount = analyses ? Object.values(analyses).filter(a => a.direction === 'Down').length : 0;
  const overallBias = bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL';

  // Details content for each metric
  const details = {
    bias: {
      title: 'Daily Bias',
      description: `Sentiment complessivo del mercato basato sull'analisi di ${bullishCount + bearishCount} asset.`,
      stats: [
        { label: 'Bullish', value: bullishCount, color: 'text-[#00D9A5]' },
        { label: 'Bearish', value: bearishCount, color: 'text-red-400' },
        { label: 'Neutral', value: (analyses ? Object.keys(analyses).length : 0) - bullishCount - bearishCount, color: 'text-yellow-400' }
      ],
      interpretation: overallBias === 'BULLISH'
        ? 'Mercato orientato al rialzo. Considera posizioni long su asset forti.'
        : overallBias === 'BEARISH'
          ? 'Mercato orientato al ribasso. Cautela su posizioni long, valuta short.'
          : 'Mercato neutrale. Attendi conferme direzionali prima di operare.'
    },
    vix: {
      title: 'VIX - Volatility Index',
      description: `Indice di volatilità attuale: ${vix?.current || '-'}. Misura le aspettative di volatilità del mercato nei prossimi 30 giorni.`,
      stats: [
        { label: 'Current', value: vix?.current || '-', color: vix?.current > 22 ? 'text-red-400' : vix?.current > 18 ? 'text-yellow-400' : 'text-[#00D9A5]' },
        { label: 'Change', value: `${vix?.change > 0 ? '+' : ''}${vix?.change || 0}%`, color: vix?.change > 0 ? 'text-red-400' : 'text-[#00D9A5]' },
        { label: 'Status', value: vix?.current > 22 ? 'High' : vix?.current > 18 ? 'Normal' : 'Low', color: vix?.current > 22 ? 'text-red-400' : vix?.current > 18 ? 'text-yellow-400' : 'text-[#00D9A5]' }
      ],
      interpretation: !vix?.current
        ? 'Caricamento dati...'
        : vix.current > 22
          ? 'Alta volatilità: mercato nervoso, aumenta il rischio. Riduci size posizioni.'
          : vix.current > 18
            ? 'Volatilità moderata: mercato in movimento, usa stop loss adeguati.'
            : 'Bassa volatilità: mercato calmo, ideale per strategie range-bound.'
    },
    regime: {
      title: 'Market Regime',
      description: `Regime di mercato corrente: ${regime?.toUpperCase() || '-'}. Indica il comportamento generale degli investitori.`,
      stats: [
        { label: 'Mode', value: regime?.toUpperCase() || '-', color: regime === 'risk-on' ? 'text-[#00D9A5]' : regime === 'risk-off' ? 'text-red-400' : 'text-yellow-400' },
        { label: 'Sentiment', value: regime === 'risk-on' ? 'Positive' : regime === 'risk-off' ? 'Defensive' : 'Mixed', color: 'text-white/70' },
        { label: 'Action', value: regime === 'risk-on' ? 'Growth' : regime === 'risk-off' ? 'Safe Haven' : 'Neutral', color: 'text-white/70' }
      ],
      interpretation: regime === 'risk-on'
        ? 'Risk-ON: Investitori favoriscono asset rischiosi (azioni, crypto). Sentiment positivo.'
        : regime === 'risk-off'
          ? 'Risk-OFF: Fuga verso beni rifugio (bonds, oro). Cautela e protezione capitali.'
          : 'Neutrale: Mercato indeciso. Monitora per cambiamenti direzionali.'
    }
  };

  // Plan badge styling mapping
  const planColors = {
    'pro': { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-500', icon: Crown },
    'plus': { border: 'border-[#00D9A5]/30', bg: 'bg-[#00D9A5]/10', text: 'text-[#00D9A5]', icon: Zap },
    'essential': { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-500', icon: Shield },
    'free': { border: 'border-slate-500/30', bg: 'bg-slate-500/10', text: 'text-slate-400', icon: Activity }
  };

  const planName = subscription?.plan_name || 'Free Trader';
  const planSlug = subscription?.plan_slug || 'free';
  const slugBase = planSlug.split('-')[0].toLowerCase();
  const style = planColors[slugBase] || planColors.free;
  const PlanIcon = style.icon;

  const toggleItem = (item) => {
    setExpandedItem(expandedItem === item ? null : item);
  };

  return (
    <div
      className="space-y-2"
      onMouseLeave={() => expandedItem && setExpandedItem(null)}
    >
      {/* Main Header Row */}
      <div className="flex items-center justify-between p-3 rounded-lg font-apple bg-white !border !border-slate-400 shadow-[0_20px_50px_rgb(0,0,0,0.1)] dark:bg-white/5 dark:!border-white/5 dark:glass-edge dark:shadow-none">
        {/* Left side: Bias + VIX + Regime */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Daily Bias */}
          <button
            onClick={() => toggleItem('bias')}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded-lg transition-all cursor-pointer",
              expandedItem === 'bias' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20 tab-border-highlight" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Target className="w-5 h-5 text-[#00D9A5]" />
            <span className="text-base text-slate-500 dark:text-white/50">Bias:</span>
            <span className={cn(
              "text-lg font-bold",
              overallBias === 'BULLISH' ? "text-[#00D9A5]" : overallBias === 'BEARISH' ? "text-red-400" : "text-yellow-400"
            )}>
              {overallBias}
            </span>
            <span className="text-base text-slate-400 dark:text-white/40">
              (<span className="text-[#00D9A5]">▲{bullishCount}</span> <span className="text-red-400">▼{bearishCount}</span>)
            </span>
            <ChevronDown className={cn(
              "w-4 h-4 text-slate-400 dark:text-white/40 transition-transform",
              expandedItem === 'bias' && "rotate-180"
            )} />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />

          {/* VIX */}
          <button
            onClick={() => toggleItem('vix')}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded-lg transition-all cursor-pointer",
              expandedItem === 'vix' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Shield className="w-5 h-5 text-[#00D9A5]" />
            <span className="text-base text-slate-500 dark:text-white/50">VIX</span>
            <span className={cn(
              "text-lg font-bold font-mono",
              vix?.current > 22 ? "text-red-400" : vix?.current > 18 ? "text-yellow-400" : "text-[#00D9A5]"
            )}>
              {vix?.current || '-'}
            </span>
            <ChevronDown className={cn(
              "w-4 h-4 text-slate-400 dark:text-white/40 transition-transform",
              expandedItem === 'vix' && "rotate-180"
            )} />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />

          {/* Regime */}
          <button
            onClick={() => toggleItem('regime')}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded-lg transition-all cursor-pointer",
              expandedItem === 'regime' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Activity className="w-5 h-5 text-[#00D9A5]" />
            <span className="text-base text-slate-500 dark:text-white/50">Regime:</span>
            <span className={cn(
              "text-lg font-bold",
              regime === 'risk-off' ? "text-red-400" : regime === 'risk-on' ? "text-[#00D9A5]" : "text-yellow-400"
            )}>
              {regime?.toUpperCase() || '-'}
            </span>
            <ChevronDown className={cn(
              "w-4 h-4 text-slate-400 dark:text-white/40 transition-transform",
              expandedItem === 'regime' && "rotate-180"
            )} />
          </button>
        </div>

        {/* Right side: News + Subscription Plan Badge */}
        <div className="flex items-center gap-6">
          {nextEvent && (
            <div className="flex items-center gap-2 text-base pl-4 border-l border-slate-200 dark:border-white/10 h-6">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 font-bold uppercase tracking-wider">{nextEvent.event}</span>
              <span className="text-white/40">{nextEvent.countdown}</span>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all hover:brightness-110 cursor-default",
              style.bg, style.border, style.text
            )}
          >
            <PlanIcon className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{planName}</span>
          </motion.div>
        </div>
      </div>

      {/* Expanded Details Panel - News-style summary */}
      <AnimatePresence>
        {expandedItem && details[expandedItem] && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-black/40 rounded-lg border border-[#00D9A5]/20">
              {/* Compact Summary */}
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="p-2 bg-[#00D9A5]/10 rounded-lg">
                  {expandedItem === 'bias' && <Target className="w-5 h-5 text-[#00D9A5]" />}
                  {expandedItem === 'vix' && <Shield className="w-5 h-5 text-[#00D9A5]" />}
                  {expandedItem === 'regime' && <Activity className="w-5 h-5 text-[#00D9A5]" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-[#00D9A5] mb-1">
                    {details[expandedItem].title}
                  </h4>

                  {/* Inline Stats */}
                  <div className="flex items-center gap-4 mb-2 text-base">
                    {details[expandedItem].stats.map((stat, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="text-white/40">{stat.label}:</span>
                        <span className={cn("font-bold font-mono", stat.color)}>{stat.value}</span>
                      </span>
                    ))}
                  </div>

                  {/* Interpretation as summary */}
                  <p className="text-base text-slate-700 leading-relaxed dark:text-white/90">
                    <span className="text-[#00D9A5] font-bold">Prospettiva: </span>
                    {details[expandedItem].interpretation}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [multiSourceData, setMultiSourceData] = useState(null);
  const [cotSummary, setCotSummary] = useState(null);
  const [engineData, setEngineData] = useState(null); // Renamed from engineCards to engineData
  const [loading, setLoading] = useState(true);
  const [favoriteCharts, setFavoriteCharts] = useState(['XAUUSD', 'NAS100', 'SP500']);
  const [favoriteCOT, setFavoriteCOT] = useState(['NAS100', 'SP500']);
  const [optionsSelectedAsset, setOptionsSelectedAsset] = useState('XAUUSD');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Typewriter animation state
  const [introPhase, setIntroPhase] = useState('typing'); // 'typing' | 'visible' | 'done'
  const [typedChars, setTypedChars] = useState(0);
  const [headerHidden, setHeaderHidden] = useState(false);
  const biasBarRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      const [multiRes, cotRes, engineRes] = await Promise.all([
        axios.get(`${API}/analysis/multi-source`),
        axios.get(`${API}/cot/data`).catch(() => ({ data: null })),
        axios.get(`${API}/engine/cards`, { headers: authHeader }).catch(() => ({ data: null }))
      ]);

      setMultiSourceData(multiRes.data);
      setCotSummary(cotRes.data);
      if (engineRes.data && Array.isArray(engineRes.data) && engineRes.data.length > 0) {
        setEngineData(engineRes.data); // Set engineData here
      } else {
        setEngineData([]); // Ensure it's an empty array if no data
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Live update every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const { analyses, vix, regime, next_event } = multiSourceData || {};

  // Mock data for demo mode when backend is unavailable
  const mockAnalyses = useMemo(() => ({
    'XAUUSD': { price: 5055.2, direction: 'Up', confidence: 58, impulse: 'Rallenta', drivers: [{ name: 'Safe Haven', impact: 'Bullish' }, { name: 'Long liquidation', impact: 'Cautela' }] },
    'NAS100': { price: 21450, direction: 'Up', confidence: 55, impulse: 'Laterale', drivers: [{ name: 'NFP forte', impact: 'Positivo' }, { name: 'Tech weakness', impact: 'Cautela' }] },
    'SP500': { price: 6941.5, direction: 'Up', confidence: 52, impulse: 'Laterale', drivers: [{ name: 'NFP Beat', impact: 'Supportivo' }, { name: 'Fed hawkish', impact: 'Freno' }] },
    'EURUSD': { price: 1.1870, direction: 'Up', confidence: 65, impulse: 'Prosegue', drivers: [{ name: 'USD Debole', impact: 'Bullish' }, { name: 'ECB Hawkish', impact: 'Supportivo' }] },
    'BTCUSD': { price: 67230, direction: 'Down', confidence: 68, impulse: 'Sell-off', drivers: [{ name: 'Risk-off crypto', impact: 'Bearish' }, { name: 'Liquidazioni', impact: 'Pressione' }] },
  }), []);

  // Use real data if available, otherwise fallback to mock data
  const analysesData = analyses || mockAnalyses;

  // Build assets array for chart tabs (no VIX)
  const assetsList = useMemo(() => Object.entries(analysesData).map(([symbol, data]) => {
    // Find engine data for this symbol
    const assetEngineData = engineData?.find(card => card.asset === symbol);

    return {
      symbol,
      price: data.price,
      direction: assetEngineData?.direction === 'UP' ? 'Up' : assetEngineData?.direction === 'DOWN' ? 'Down' : data.direction,
      confidence: assetEngineData?.probability ?? data.confidence,
      impulse: assetEngineData?.impulse ?? data.impulse,
      explanation: data.drivers?.map(d => `${d.name}: ${d.impact}`).join('. '),
      scores: assetEngineData?.scores || {},
      drivers: assetEngineData?.drivers || [],
      sparkData: [30, 35, 28, 42, 38, 55, 48, 52]
    };
  }), [analysesData, engineData]);

  // Options mock data
  const optionsData = useMemo(() => ({
    call_ratio: 52,
    put_ratio: 48,
    bias: 'neutral'
  }), []);

  // Mock COT data for demo mode
  const mockCotData = useMemo(() => ({
    data: {
      'NAS100': {
        bias: 'Bear',
        categories: {
          asset_manager: { long: 58000, short: 82000 }
        }
      },
      'SP500': {
        bias: 'Bear',
        categories: {
          asset_manager: { long: 95000, short: 214941 }
        }
      },
      'XAUUSD': {
        bias: 'Bull',
        categories: {
          managed_money: { long: 115000, short: 52000 }
        }
      },
      'EURUSD': {
        bias: 'Bull',
        categories: {
          asset_manager: { long: 185000, short: 48000 }
        }
      },
    }
  }), []);

  // Use real COT data only when at least one symbol is available
  const hasLiveCotData = cotSummary?.data && Object.keys(cotSummary.data).length > 0;
  const cotDataToUse = hasLiveCotData ? cotSummary : mockCotData;

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buongiorno';
    if (hour < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  };

  // Build the full intro text for the typewriter
  const traderName = user?.name || 'Demo Trader';
  const greeting = getGreeting();
  const introLines = useMemo(() => [
    { text: `${greeting}, `, highlight: traderName, id: 'greeting' },
    { text: '"La mente è tutto. Ciò che pensi, diventi." — Buddha', id: 'quote' },
    { text: 'Karion AI LIVE', id: 'status' },
  ], [greeting, traderName]);

  // Calculate total characters for all lines
  const totalChars = useMemo(() => {
    return introLines.reduce((acc, line) => {
      return acc + line.text.length + (line.highlight?.length || 0);
    }, 0);
  }, [introLines]);

  // Typewriter animation effect
  useEffect(() => {
    if (introPhase !== 'typing') return;

    const speed = Math.max(20, Math.min(50, 2500 / totalChars)); // Adjust speed to fit in ~2.5s

    if (typedChars < totalChars) {
      const timer = setTimeout(() => {
        setTypedChars(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    } else {
      // All typed — hold for 1.5s then scroll
      setIntroPhase('visible');
    }
  }, [typedChars, totalChars, introPhase]);

  // After "visible" phase, wait then scroll
  useEffect(() => {
    if (introPhase !== 'visible') return;

    const scrollTimer = setTimeout(() => {
      setIntroPhase('done');
      if (biasBarRef.current) {
        biasBarRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // After scroll animation finishes, hide the header completely
      setTimeout(() => {
        setHeaderHidden(true);
      }, 800);
    }, 1500);

    return () => clearTimeout(scrollTimer);
  }, [introPhase]);

  // Helper: get visible text for a given line based on how many chars have been typed
  const getVisibleText = (lineIndex) => {
    let charsBefore = 0;
    for (let i = 0; i < lineIndex; i++) {
      charsBefore += introLines[i].text.length + (introLines[i].highlight?.length || 0);
    }
    const line = introLines[lineIndex];
    const fullLen = line.text.length + (line.highlight?.length || 0);
    const charsForThisLine = Math.max(0, Math.min(fullLen, typedChars - charsBefore));

    if (charsForThisLine <= 0) return { main: '', highlighted: '', showCursor: false };

    const mainLen = line.text.length;
    const highlightLen = line.highlight?.length || 0;

    if (charsForThisLine <= mainLen) {
      return {
        main: line.text.slice(0, charsForThisLine),
        highlighted: '',
        showCursor: typedChars < totalChars && charsForThisLine === Math.max(0, Math.min(fullLen, typedChars - charsBefore))
      };
    } else {
      return {
        main: line.text,
        highlighted: line.highlight?.slice(0, charsForThisLine - mainLen) || '',
        showCursor: typedChars < totalChars && charsForThisLine === Math.max(0, Math.min(fullLen, typedChars - charsBefore))
      };
    }
  };

  const cursorBlink = introPhase === 'typing' ? 'animate-pulse' : '';

  return (
    <div className="dashboard-page" data-testid="dashboard-page" id="dashboard-main">
      {/* Header - Typewriter Animation */}
      {!headerHidden && (
        <motion.div
          className="mb-6 flex items-start justify-between gap-4"
          animate={introPhase === 'done' ? { opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' } : { opacity: 1, height: 'auto' }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white/95">
              {introPhase !== 'done' ? (
                <>
                  {getVisibleText(0).main}
                  <span className="text-[#00D9A5]">{getVisibleText(0).highlighted}</span>
                  {getVisibleText(0).showCursor && (
                    <span className={cn("inline-block w-[2px] h-[1em] bg-[#00D9A5] ml-0.5 align-middle", cursorBlink)} />
                  )}
                </>
              ) : (
                <>
                  {getGreeting()}, <span className="text-[#00D9A5]">{user?.name || 'trader'}</span>
                </>
              )}
            </h1>
            {introPhase !== 'done' ? (
              <p className="text-base text-white/50 mt-1 italic min-h-[1.5em]">
                {getVisibleText(1).main}
                {getVisibleText(1).showCursor && (
                  <span className={cn("inline-block w-[2px] h-[1em] bg-white/50 ml-0.5 align-middle", cursorBlink)} />
                )}
              </p>
            ) : (
              <p className="text-base text-white/50 mt-1 italic">
                "La mente è tutto. Ciò che pensi, diventi." — Buddha
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-base text-white/50">
              <span className="flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D9A5] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00D9A5]"></span>
                </span>
                {introPhase !== 'done' ? (
                  <>
                    {getVisibleText(2).main}
                    {getVisibleText(2).showCursor && (
                      <span className={cn("inline-block w-[2px] h-[1em] bg-white/50 ml-0.5 align-middle", cursorBlink)} />
                    )}
                  </>
                ) : (
                  'Karion AI LIVE'
                )}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Daily Bias + VIX + Regime - Compact Row */}
      <div className="mb-6" ref={biasBarRef} style={{ scrollMarginTop: '16px' }}>
        <DailyBiasHeader
          analyses={analysesData}
          vix={vix || { current: 17.62, change: -0.96 }}
          regime={regime || 'risk-on'}
          nextEvent={next_event || { event: 'US Core CPI m/m', countdown: '13h' }}
        />
      </div>

      {/* Main Grid: Center + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CENTER: Charts + COT + Options */}
        <div className="lg:col-span-2 space-y-6">

          {/* Asset Charts Grid */}
          <AssetChartPanel
            assets={assetsList}
            favoriteCharts={favoriteCharts}
            onFavoriteChange={setFavoriteCharts}
            animationsReady={headerHidden}
            onSyncAsset={useCallback((symbol) => {
              // Sync COT Favorites
              if (cotDataToUse?.data?.[symbol]) {
                setFavoriteCOT(prev => [symbol, ...prev.filter(s => s !== symbol)].slice(0, 3));
              }
              // Sync Options Asset
              setOptionsSelectedAsset(symbol);
            }, [cotDataToUse])}
          />

          {/* Options + COT Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <OptionsPanel
              optionsData={optionsData}
              animationsReady={headerHidden}
              selectedAsset={optionsSelectedAsset}
              onAssetChange={setOptionsSelectedAsset}
            />
            <COTPanel cotData={cotDataToUse} favoriteCOT={favoriteCOT} onFavoriteCOTChange={setFavoriteCOT} animationsReady={headerHidden} />
          </div>
        </div>

        {/* RIGHT SIDEBAR: News + Activity + Strategies */}
        <div className="lg:col-span-1">
          <ActivitySidebar />
        </div>
      </div>
    </div>
  );
}
