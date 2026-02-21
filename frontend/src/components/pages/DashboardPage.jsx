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
  Scale, Layers, Newspaper, ChevronDown, ChevronUp, ChevronRight, Gauge,
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
import { detailedStrategies } from '../../data/strategies';

const isMobileLiteMotion = () => {
  if (typeof window === 'undefined') return false;
  const isSmallScreen = window.matchMedia('(max-width: 1024px)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isSmallScreen || prefersReduced;
};

// Typewriter Text Component - reveals text character by character
const TypewriterText = ({ text, speed = 25, delay = 0, className, children }) => {
  const [displayedChars, setDisplayedChars] = useState(0);
  const content = text || (typeof children === 'string' ? children : '');
  const liteMotion = isMobileLiteMotion();

  useEffect(() => {
    if (!content) return;
    if (liteMotion) {
      setDisplayedChars(content.length);
      return;
    }
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
  }, [content, speed, delay, liteMotion]);

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
  const liteMotion = isMobileLiteMotion();

  useEffect(() => {
    if (liteMotion) {
      setDisplay(isDecimal ? Math.round(numVal * 10) / 10 : Math.round(numVal));
      return;
    }
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
  }, [numVal, duration, delay, isDecimal, liteMotion]);

  return <span className={className}>{prefix}{display}{suffix}</span>;
};

// Seasonality rules (shared with Macro -> Volatility & Bias)
const SEASONALITY_RULES = {
  weeks: {
    1: { bias: 'RANGE', description: 'Poco direzionale' },
    2: { bias: 'ACCUMULATION', description: 'Accumula e inizia lo slancio' },
    3: { bias: 'TREND', description: 'Continua lo slancio' },
    4: { bias: 'EXPANSION', description: 'Molto direzionale' }
  },
  days: {
    Monday: { bias: 'RANGE_EXPANSION', note: 'Ranging ed espansione solo dopo sbilanciamenti' },
    Tuesday: { bias: 'ACCUMULATION', note: 'Accumulo o ribilanciamento' },
    Wednesday: { bias: 'EXPANSION', note: 'Espansione in ribilanciamento' },
    Thursday: { bias: 'ACCUMULATION', note: 'Accumulo o ribilanciamento' },
    Friday: { bias: 'REVERSAL_RISK', note: 'Espansione, possibile inversione su zone importanti' }
  }
};

// Statistical bias (indices only)
const STAT_BIAS = {
  NAS100: { weekly_bias: 'NEUTRAL', monthly_bias: 'BULLISH' },
  SP500: { weekly_bias: 'BEARISH', monthly_bias: 'NEUTRAL' }
};

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;
let hasPlayedDashboardIntro = false;

const PRICE_DECIMALS = {
  EURUSD: 5
};

const STATIC_OPTIONS_DATA = {
  XAUUSD: {
    call_ratio: 55, put_ratio: 45, net_flow: 52, bias: 'bullish',
    call_million: 128, put_million: 105, net_million: 23,
    call_change: -5.2, put_change: 8.4, net_change: -12.5,
    gamma_exposure: 55, gamma_billion: 0.9,
    gamma_flip: 2375,
    gex_profile: [
      { strike: 2625, put: -12, call: 6, net: -6 },
      { strike: 2575, put: -26, call: 18, net: -8 },
      { strike: 2525, put: -44, call: 30, net: -14 },
      { strike: 2475, put: -62, call: 92, net: 30 },
      { strike: 2425, put: -58, call: 118, net: 60 },
      { strike: 2375, put: -174, call: 276, net: 102 },
      { strike: 2325, put: -152, call: 288, net: 136 },
      { strike: 2275, put: -104, call: 168, net: 64 },
      { strike: 2225, put: -70, call: 76, net: 6 },
      { strike: 2175, put: -54, call: 58, net: 4 }
    ],
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
    gamma_flip: 19700,
    gex_profile: [
      { strike: 20100, put: -26, call: 8, net: -18 },
      { strike: 20000, put: -52, call: 20, net: -32 },
      { strike: 19900, put: -66, call: 34, net: -32 },
      { strike: 19800, put: -92, call: 64, net: -28 },
      { strike: 19700, put: -106, call: 118, net: 12 },
      { strike: 19600, put: -84, call: 138, net: 54 },
      { strike: 19500, put: -62, call: 124, net: 62 },
      { strike: 19400, put: -58, call: 82, net: 24 },
      { strike: 19300, put: -42, call: 60, net: 18 },
      { strike: 19200, put: -30, call: 44, net: 14 }
    ],
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
    gamma_flip: 5900,
    gex_profile: [
      { strike: 6100, put: -42, call: 20, net: -22 },
      { strike: 6050, put: -76, call: 36, net: -40 },
      { strike: 6000, put: -108, call: 64, net: -44 },
      { strike: 5950, put: -128, call: 118, net: -10 },
      { strike: 5900, put: -122, call: 172, net: 50 },
      { strike: 5850, put: -88, call: 194, net: 106 },
      { strike: 5800, put: -64, call: 156, net: 92 },
      { strike: 5750, put: -52, call: 112, net: 60 },
      { strike: 5700, put: -40, call: 82, net: 42 },
      { strike: 5650, put: -28, call: 60, net: 32 }
    ],
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
    gamma_flip: 1.185,
    gex_profile: [
      { strike: 1.205, put: -16, call: 24, net: 8 },
      { strike: 1.2, put: -28, call: 42, net: 14 },
      { strike: 1.195, put: -36, call: 58, net: 22 },
      { strike: 1.19, put: -44, call: 72, net: 28 },
      { strike: 1.185, put: -48, call: 86, net: 38 },
      { strike: 1.18, put: -42, call: 78, net: 36 },
      { strike: 1.175, put: -34, call: 64, net: 30 },
      { strike: 1.17, put: -26, call: 52, net: 26 },
      { strike: 1.165, put: -20, call: 40, net: 20 },
      { strike: 1.16, put: -14, call: 30, net: 16 }
    ],
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
    gamma_flip: 78000,
    gex_profile: [
      { strike: 94000, put: -36, call: 16, net: -20 },
      { strike: 90000, put: -58, call: 26, net: -32 },
      { strike: 86000, put: -82, call: 38, net: -44 },
      { strike: 82000, put: -114, call: 60, net: -54 },
      { strike: 78000, put: -136, call: 88, net: -48 },
      { strike: 74000, put: -144, call: 76, net: -68 },
      { strike: 70000, put: -126, call: 64, net: -62 },
      { strike: 66000, put: -98, call: 50, net: -48 },
      { strike: 62000, put: -72, call: 36, net: -36 },
      { strike: 58000, put: -48, call: 24, net: -24 }
    ],
    interpretation: [
      'BTCUSD flusso fortemente bearish.',
      'Sell-off da $100K a $67K, put premium dominante.',
      'Liquidazioni long cascata, supporto critico $65K.'
    ]
  }
};

const getCotReleaseKey = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload.data;
  if (!data || typeof data !== 'object') return null;
  const firstEntry = Object.values(data).find((entry) => entry && typeof entry === 'object');
  return firstEntry?.release_date || firstEntry?.as_of_date || null;
};

const parseNumericValue = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number(value);
  const raw = value.trim();
  if (!raw) return NaN;

  const normalized = raw.includes('.') && raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  return Number(normalized);
};

const formatAssetPrice = (value, symbol) => {
  const numeric = parseNumericValue(value);
  if (!Number.isFinite(numeric)) return '-';
  const decimals = PRICE_DECIMALS[symbol] ?? 2;
  return numeric.toLocaleString('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const formatGammaScale = (value) => {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}M`;
  return `${Math.round(value)}K`;
};

const formatStrikeLevel = (value) => {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) < 10) {
    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
};

const TRADINGVIEW_MINI_SYMBOL = {
  XAUUSD: 'FOREXCOM:XAUUSD',
  NAS100: 'CAPITALCOM:US100',
  SP500: 'CAPITALCOM:US500',
  DOW: 'CAPITALCOM:US30',
  EURUSD: 'FX:EURUSD',
  BTCUSD: 'BINANCE:BTCUSDT'
};
const TV_CANDLE_UP = '#22c55e';
const TV_CANDLE_DOWN = '#ef4444';

const buildTradingViewMiniUrl = (assetSymbol, { interval = '15', interactive = false } = {}) => {
  const tvSymbol = TRADINGVIEW_MINI_SYMBOL[assetSymbol];
  if (!tvSymbol) return null;
  const overrides = {
    "mainSeriesProperties.style": 1,
    "mainSeriesProperties.candleStyle.upColor": TV_CANDLE_UP,
    "mainSeriesProperties.candleStyle.downColor": TV_CANDLE_DOWN,
    "mainSeriesProperties.candleStyle.drawWick": true,
    "mainSeriesProperties.candleStyle.drawBorder": true,
    "mainSeriesProperties.candleStyle.wickUpColor": TV_CANDLE_UP,
    "mainSeriesProperties.candleStyle.wickDownColor": TV_CANDLE_DOWN,
    "mainSeriesProperties.candleStyle.borderUpColor": TV_CANDLE_UP,
    "mainSeriesProperties.candleStyle.borderDownColor": TV_CANDLE_DOWN
  };
  const params = new URLSearchParams({
    symbol: tvSymbol,
    interval,
    hidesidetoolbar: interactive ? '0' : '1',
    symboledit: interactive ? '1' : '0',
    saveimage: interactive ? '1' : '0',
    toolbarbg: interactive ? '0f1720' : 'f1f3f6',
    studies: '[]',
    theme: 'dark',
    style: '1',
    timezone: 'exchange',
    withdateranges: interactive ? '1' : '0',
    showpopupbutton: interactive ? '1' : '0',
    studies_overrides: '{}',
    overrides: JSON.stringify(overrides),
    locale: 'it'
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
};

const TradingViewMiniChart = ({ assetSymbol, title, interval = '15', interactive = false }) => {
  const src = buildTradingViewMiniUrl(assetSymbol, { interval, interactive });
  if (!src) return null;
  return (
    <iframe
      title={title || `tv-mini-${assetSymbol}`}
      src={src}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      loading="lazy"
      allowFullScreen
    />
  );
};

const normalizeStrategyId = (rawId) => {
  if (!rawId) return rawId;
  if (rawId === 'rate-vol-alignment') return 'rate-volatility';
  if (rawId === 'multi-day-ra') return 'multi-day-rejection';
  return rawId;
};

// Mobile detection hook
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
};

// Asset Charts Grid (2-3 charts visible at once)
const AssetChartPanel = ({ assets, favoriteCharts, onFavoriteChange, animationsReady = false, onSyncAsset }) => {
  // State with LocalStorage Persistence
  const [viewMode, setViewMode] = useState('focus');
  const [selectedAsset, setSelectedAsset] = useState(() => localStorage.getItem('dashboard_selectedAsset') || null);
  const [showSelector, setShowSelector] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [chartLineColor, setChartLineColor] = useState(() => localStorage.getItem('dashboard_chartLineColor') || '#00D9A5');
  const [syncEnabled, setSyncEnabled] = useState(() => localStorage.getItem('dashboard_syncEnabled') === 'true');
  const [mobileChartIndex, setMobileChartIndex] = useState(0);
  const isMobile = useIsMobile();

  // Persist State Changes
  useEffect(() => {
    localStorage.setItem('dashboard_syncEnabled', syncEnabled);
  }, [syncEnabled]);

  useEffect(() => {
    if (viewMode !== 'focus') {
      setViewMode('focus');
      return;
    }
    localStorage.setItem('dashboard_viewMode', 'focus');
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
    if (isMobile) {
      // Mobile: allow only 1 favorite at a time — switch to this one
      onFavoriteChange([symbol]);
      setMobileChartIndex(0);
      return;
    }
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
  const now = new Date();
  const weekNum = Math.min(4, Math.floor((now.getDate() - 1) / 7) + 1);
  const dayKey = now.toLocaleDateString('en-US', { weekday: 'long' });
  const weekRule = SEASONALITY_RULES.weeks[weekNum] || {};
  const dayRule = SEASONALITY_RULES.days[dayKey] || {};
  const isIndex = currentAsset?.symbol === 'NAS100' || currentAsset?.symbol === 'SP500';
  const monthlyBias = currentAsset?.symbol ? STAT_BIAS[currentAsset.symbol]?.monthly_bias : null;
  const toFiniteNumber = (value, fallback = 0) => {
    const parsed = typeof value === 'string' ? parseFloat(value.replace('%', '').trim()) : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const safePrice = toFiniteNumber(currentAsset?.analysisPrice ?? currentAsset?.price, 0);
  const safeAtr = toFiniteNumber(currentAsset?.atr, 0);
  const safeChangePct = toFiniteNumber(currentAsset?.analysisChange ?? currentAsset?.change, 0);
  const safeDayChangePoints = toFiniteNumber(currentAsset?.dayChangePoints, NaN);
  const safeMonthChangePoints = toFiniteNumber(currentAsset?.monthChangePoints, 0);

  const atrValue = safeAtr > 0 ? safeAtr : (safePrice > 0 ? safePrice * 0.01 : 0);
  const dayMovePoints = Number.isFinite(safeDayChangePoints)
    ? Math.abs(safeDayChangePoints)
    : Math.abs(safePrice * safeChangePct / 100);
  const atrRemaining = Math.max(0, atrValue - dayMovePoints);
  const atrProgress = atrValue > 0 ? Math.min(100, (dayMovePoints / atrValue) * 100) : 0;
  const monthMovePoints = safeMonthChangePoints;
  const formatPoints = (val) => {
    if (!Number.isFinite(val)) return '-';
    const absVal = Math.abs(val);
    if (currentAsset?.symbol === 'EURUSD') return absVal.toFixed(5);
    return absVal >= 100 ? Math.round(absVal).toLocaleString() : absVal.toFixed(1);
  };
  const seasonalityBias = (() => {
    if (isIndex) return null;
    if (!atrValue) return 'Neutral';
    if (monthMovePoints >= atrValue * 1.5) return 'Espansione';
    if (monthMovePoints <= -atrValue * 1.5) return 'Distribuzione';
    if (Math.abs(monthMovePoints) <= atrValue * 0.5) return 'Accumulo';
    return 'Slancio';
  })();
  const dayBiasNormalized = dayRule.note
    ? `${dayRule.note.charAt(0).toLowerCase()}${dayRule.note.slice(1)}`
    : '—';
  const statisticalBiasSummary = isIndex
    ? `Week ${weekNum} ${weekRule.description || '—'}, giornata statistica di ${dayBiasNormalized}, bias mensile ${monthlyBias || '—'}`
    : `Seasonality ${seasonalityBias} • MTD ${formatPoints(monthMovePoints)} pts`;
  const currentSymbol = currentAsset?.symbol || null;
  const currentConfidence = Math.round(toFiniteNumber(currentAsset?.confidence, 0));
  const statisticalNarrative = useMemo(() => {
    if (!currentSymbol) return 'Dati in questo momento non disponibili.';

    const directionalTone = dailyOutlook?.conclusionType === 'bullish'
      ? 'impostazione rialzista'
      : dailyOutlook?.conclusionType === 'bearish'
        ? 'impostazione ribassista'
        : 'fase laterale';
    const atrTone = atrProgress >= 70
      ? 'gran parte del range medio giornaliero e gia stata percorsa'
      : atrProgress >= 35
        ? 'il range medio giornaliero e in espansione regolare'
        : 'resta spazio tecnico per ulteriori estensioni';

    if (isIndex) {
      return `Oggi su ${currentSymbol} la lettura multi-sorgente segnala ${directionalTone} con confidenza prudente (${currentConfidence}%). Il contesto statistico resta coerente con ${weekRule.description || 'uno scenario neutrale'} e ${dayRule.note ? dayRule.note.toLowerCase() : 'una sessione di ribilanciamento'}. Finora ${atrTone}.`;
    }

    return `Su ${currentSymbol} lo scenario e ${directionalTone} con confidenza ${currentConfidence}%. La stagionalita corrente indica fase ${seasonalityBias?.toLowerCase() || 'neutrale'} e finora ${atrTone}.`;
  }, [
    atrProgress,
    currentConfidence,
    currentSymbol,
    dailyOutlook?.conclusionType,
    dayRule.note,
    isIndex,
    seasonalityBias,
    weekRule.description
  ]);

  const chartColors = ['#00D9A5', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

  const handleFocusAsset = (symbol) => {
    setSelectedAsset(symbol);
    setViewMode('focus');
  };

  return (
    <TechCard className="dashboard-panel-glass-boost font-apple glass-edge panel-left-edge fine-gray-border p-4 relative w-full transition-all duration-300 lg:w-[46%] lg:mr-auto min-h-[474px] pb-[74px]">
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

      <div
        className={cn(
          "transition-all duration-200",
          showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
        )}
      >
        <div className="flex items-center justify-between mb-5">
        <div className="relative flex items-center gap-2">
          <div className="flex items-center gap-3 select-none">
            <div className={cn(
              "p-2 rounded-lg border transition-all",
              viewMode === 'focus'
                ? "bg-[#00D9A5]/10 border-[#00D9A5]/20 font-bold"
                : "bg-white/5 border-white/10 dark:bg-white/5 dark:border-white/10"
            )}>
              <BarChart3 className="w-5 h-5 text-[#00D9A5]" />
            </div>
            <div className="text-left">
              <h4 className={cn(
                "text-lg font-bold transition-colors select-none",
                viewMode === 'focus' ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-white/80"
              )}>
                {viewMode === 'focus' ? 'Screening' : 'Screening'}
              </h4>
              <p className="text-xs text-slate-400 dark:text-white/40 leading-none mt-1">
                Dettagli asset
              </p>
            </div>
          </div>
          {/* Info Button */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
          >
            <Info className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest dark:text-white/30">Seleziona Asset {isMobile ? '(1)' : `(${favoriteCharts.length}/3)`}</span>
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
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="min-h-[364px] lg:min-h-[403px]"
          >
            {/* MOBILE: single zoomed chart with navigation */}
            {isMobile ? (
              <div className="relative">
                {/* Navigation arrows */}
                {assets.length > 1 && (
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setMobileChartIndex((prev) => (prev - 1 + assets.length) % assets.length)}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      {assets.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setMobileChartIndex(i)}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-all",
                            i === mobileChartIndex ? "bg-[#00D9A5] w-4" : "bg-white/20"
                          )}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setMobileChartIndex((prev) => (prev + 1) % assets.length)}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {/* Single chart card — zoomed */}
                {(() => {
                  const asset = assets[mobileChartIndex % assets.length];
                  if (!asset) return null;
                  const color = chartColors[mobileChartIndex % chartColors.length];
                  return (
                    <button
                      onClick={() => handleFocusAsset(asset.symbol)}
                      className="w-full group relative p-3 bg-white rounded-2xl !border !border-slate-400 shadow-[0_20px_50px_rgb(0,0,0,0.1)] transition-all text-left overflow-hidden dark:bg-white/[0.03] dark:!border-white/10 dark:shadow-none font-apple"
                    >
                      <div className="mb-2 relative z-10 flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-bold text-white mb-1 tracking-tight">{asset.symbol}</h3>
                          <span className="text-xl font-bold text-white tracking-tight">
                            {formatAssetPrice(asset.price, asset.symbol)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] font-black text-white uppercase tracking-[0.2em] leading-none mb-1">Confidenza</span>
                          <span className="text-base font-black leading-none text-[#00D9A5]">{asset.confidence}%</span>
                        </div>
                      </div>
                      <div className="h-28 -ml-2 relative z-10 overflow-hidden rounded-lg mb-2">
                        {animationsReady && (
                          asset.symbol === 'XAUUSD' ? (
                            <TradingViewMiniChart assetSymbol={asset.symbol} title={`tv-mobile-${asset.symbol}`} />
                          ) : (
                            <GlowingChart
                              data={asset.sparkData || [30, 45, 35, 60, 42, 70, 55, 65, 50, 75]}
                              width={380}
                              height={140}
                              color={color}
                              showPrice={false}
                            />
                          )
                        )}
                      </div>
                      <div className="relative z-10">
                        <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border",
                          getDailyOutlook(asset).conclusionType === 'bullish' ? "bg-[#00D9A5]/10 border-[#00D9A5]/20 text-[#00D9A5]" :
                            getDailyOutlook(asset).conclusionType === 'bearish' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                              "bg-yellow-500/10 border-yellow-500/20 text-yellow-500"
                        )}>
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            getDailyOutlook(asset).conclusionType === 'bullish' ? "bg-[#00D9A5]" :
                              getDailyOutlook(asset).conclusionType === 'bearish' ? "bg-red-500" : "bg-yellow-500"
                          )} />
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none">
                            {getDailyOutlook(asset).conclusion}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })()}
              </div>
            ) : (
              /* DESKTOP: original grid view */
              <div className={cn(
                "grid gap-3",
                visibleAssets.length === 2 ? "grid-cols-2" : "grid-cols-3"
              )}>
                {visibleAssets.map((asset, index) => {
                  const color = chartColors[index % chartColors.length];
                  return (
                    <button
                      key={asset.symbol}
                      onClick={() => handleFocusAsset(asset.symbol)}
                      className="group relative p-3 bg-white rounded-2xl !border !border-slate-400 shadow-[0_20px_50px_rgb(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgb(0,0,0,0.15)] transition-all text-left overflow-hidden dark:bg-white/[0.03] dark:!border-white/10 dark:hover:!border-white/20 dark:shadow-none font-apple"
                    >
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-100 to-transparent opacity-0 group-hover:opacity-100 transition-opacity dark:from-white/5" />

                      <div className="mb-2 relative z-10 flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-bold text-white mb-1 tracking-tight">{asset.symbol}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-white tracking-tight">
                              {formatAssetPrice(asset.price, asset.symbol)}
                            </span>
                          </div>
                        </div>

                        {/* Confidence Percentage - Repositioned to Top Right */}
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] leading-none mb-1">Confidenza</span>
                          <span className="text-base font-black leading-none text-[#00D9A5]">
                            {asset.confidence}%
                          </span>
                        </div>
                      </div>

                      <div className="h-[55px] -ml-4 relative z-10 overflow-hidden rounded-lg mb-2">
                        {animationsReady && (
                          asset.symbol === 'XAUUSD' ? (
                            <TradingViewMiniChart assetSymbol={asset.symbol} title={`tv-grid-${asset.symbol}`} />
                          ) : (
                            <GlowingChart
                              data={asset.sparkData || [30, 45, 35, 60, 42, 70, 55, 65, 50, 75]}
                              width={400}
                              height={110}
                              color={color}
                              showPrice={false}
                            />
                          )
                        )}
                      </div>

                      <div className="relative z-10 space-y-2 mt-2">
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
                        <ul className="space-y-1.5">
                          {getDailyOutlook(asset).outlookLines.slice(0, 3).map((line, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm font-semibold text-white/95 leading-relaxed tracking-tight">
                              <div className="mt-2 w-1 h-1 rounded-full bg-[#00D9A5]/60 shadow-[0_0_8px_#00D9A5]/40 flex-shrink-0" />
                              <TypewriterText text={line} speed={20} delay={500 + i * 800} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="focus"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="animate-in fade-in slide-in-from-bottom-2 duration-[800ms] min-h-[364px] lg:min-h-[403px]"
          >
            {currentAsset.symbol === 'XAUUSD' ? (
              <div className="w-full aspect-[16/8] rounded-2xl overflow-hidden border border-white/10 bg-[#0B0F17]">
                {animationsReady ? (
                  <TradingViewMiniChart
                    assetSymbol={currentAsset.symbol}
                    title={`tv-focus-${currentAsset.symbol}`}
                    interval="15"
                    interactive
                  />
                ) : (
                  <div className="w-full h-full rounded-lg bg-white/5 animate-pulse" />
                )}
              </div>
            ) : (
              <>
                {/* Focus View Header - Compact */}
                <div className="flex flex-wrap items-center justify-between mb-5 gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-widest leading-none select-none">
                      {currentAsset.symbol}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-white tracking-tight">
                        {formatAssetPrice(currentAsset.price, currentAsset.symbol)}
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
                <div className="h-[55px] mb-4 relative group overflow-hidden">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 rounded-2xl border border-white/10 bg-[#13171C]/85 p-4">
                  <div className="md:col-span-2">
                    <h5 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-4">Analisi statistica</h5>
                    <div className="space-y-4">
                      <p className="text-base font-semibold text-white/95 leading-relaxed tracking-tight">
                        {statisticalNarrative}
                      </p>
                      <p className="text-sm text-white/70 leading-relaxed tracking-tight">
                        Contesto: {isIndex ? `${weekRule.description || '—'} • ${dayRule.note || '—'} • Bias mensile ${monthlyBias || '—'}` : `Seasonality ${seasonalityBias}`} • ATR {Math.round(atrProgress)}%
                      </p>
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
                    </div>
                  </div>

                  <div className="flex flex-col justify-between">
                    <div>
                      <h5 className="text-sm font-bold text-white uppercase tracking-[0.2em] mb-4">Metriche Rapide</h5>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-white uppercase font-black tracking-[0.2em] mb-2 leading-none">ATR Daily Range</p>
                          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${atrProgress}%` }}
                              className="h-full rounded-full bg-[#00D9A5] transition-all duration-700"
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-white/70 font-bold">
                            <span>Percorso: {formatPoints(dayMovePoints)} pts ({Math.round(atrProgress)}%)</span>
                            <span>Rimanente: {formatPoints(atrRemaining)} pts ({Math.max(0, 100 - Math.round(atrProgress))}%)</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs text-white uppercase font-black tracking-[0.2em]">Statistical Bias</p>
                          <p className="text-base font-bold text-[#00D9A5] leading-relaxed">{statisticalBiasSummary}</p>
                        </div>
                      </div>

                      {/* Source Breakdown removed per request */}
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
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

const FearGreedPanel = React.memo(({ analyses, vix, regime, compact = true }) => {
  const vixCurrentValue = Number.isFinite(Number(vix?.current)) ? Number(vix?.current) : 18;

  const model = useMemo(() => {
    const entries = Object.values(analyses || {});
    const total = Math.max(entries.length, 1);
    let bullish = 0;
    let bearish = 0;
    let directionalConviction = 0;

    entries.forEach((item) => {
      const dir = String(item?.direction || '').toLowerCase();
      const confRaw = Number(item?.confidence);
      const conf = Number.isFinite(confRaw) ? Math.max(0, Math.min(100, confRaw)) : 50;
      if (dir === 'up') {
        bullish += 1;
        directionalConviction += conf / 100;
      } else if (dir === 'down') {
        bearish += 1;
        directionalConviction -= conf / 100;
      }
    });

    const biasDelta = (bullish - bearish) / total;
    const biasScore = Math.round(Math.max(0, Math.min(100, 50 + (biasDelta * 34))));

    const normalizedVix = Math.min(Math.max(vixCurrentValue, 12), 32);
    const vixScore = Math.round(Math.max(0, Math.min(100, 100 - (((normalizedVix - 12) / 20) * 100))));

    const regimeScore = regime === 'risk-on' ? 74 : regime === 'risk-off' ? 28 : 50;
    const convictionScore = Math.round(Math.max(0, Math.min(100, 50 + ((directionalConviction / total) * 28))));

    const score = Math.round(
      (biasScore * 0.34) +
      (vixScore * 0.33) +
      (regimeScore * 0.23) +
      (convictionScore * 0.10)
    );

    let label = 'Neutral';
    let tone = 'neutral';
    if (score >= 76) {
      label = 'Extreme Greed';
      tone = 'greed';
    } else if (score >= 58) {
      label = 'Greed';
      tone = 'greed';
    } else if (score <= 24) {
      label = 'Extreme Fear';
      tone = 'fear';
    } else if (score <= 42) {
      label = 'Fear';
      tone = 'fear';
    }

    return {
      score,
      label,
      tone,
      riskPressure: Math.max(0, Math.min(100, 100 - score)),
      drivers: {
        bias: biasScore,
        vix: vixScore,
        regime: regimeScore,
        conviction: convictionScore
      }
    };
  }, [analyses, regime, vixCurrentValue]);

  const toneClass = model.tone === 'greed'
    ? 'text-[#00D9A5]'
    : model.tone === 'fear'
      ? 'text-red-300'
      : 'text-yellow-300';
  const barClass = model.tone === 'greed'
    ? 'bg-gradient-to-r from-[#00D9A5]/65 to-[#00D9A5]'
    : model.tone === 'fear'
      ? 'bg-gradient-to-r from-red-400/65 to-red-300'
      : 'bg-gradient-to-r from-yellow-400/65 to-yellow-300';

  const needleAngle = -140 + ((model.score / 100) * 280);

  return (
    <TechCard className={cn(
      "dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border font-apple relative",
      compact ? "p-3 h-auto" : "p-4 min-h-[470px]"
    )}>
      <div className={cn("flex items-start justify-between", compact ? "mb-2.5" : "mb-4")}>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg border border-white/20 bg-white/[0.08]">
            <Gauge className={cn("text-[#64E9FF]", compact ? "w-4 h-4" : "w-5 h-5")} />
          </div>
          <div>
            <p className={cn("font-medium text-white/95 leading-none", compact ? "text-sm" : "text-base")}>Fear & Greed Index</p>
            <p className={cn("uppercase tracking-[0.13em] text-white/45 mt-1", compact ? "text-[10px]" : "text-[11px]")}>Retail Sentiment Risk</p>
          </div>
        </div>
        <span className={cn("font-black leading-none", toneClass, compact ? "text-2xl" : "text-4xl")}>{model.score}</span>
      </div>

      <div className={cn("relative mx-auto", compact ? "h-48 w-48" : "h-56 w-56")}>
        <div className="absolute inset-0 rounded-full p-[12px] bg-[conic-gradient(from_220deg,rgba(248,113,113,0.96)_0deg,rgba(250,204,21,0.95)_155deg,rgba(0,217,165,0.98)_300deg,rgba(0,217,165,0.25)_360deg)] shadow-[0_0_38px_rgba(0,0,0,0.45)]">
          <div className="h-full w-full rounded-full border border-white/10 bg-[#080B10]/95 flex flex-col items-center justify-center text-center">
            <p className={cn("uppercase tracking-widest text-white/40", compact ? "text-[10px]" : "text-xs")}>Sentiment</p>
            <p className={cn("font-black leading-none mt-1", toneClass, compact ? "text-3xl" : "text-5xl")}>{model.score}</p>
            <p className={cn("mt-2 uppercase tracking-[0.12em] font-semibold", toneClass, compact ? "text-[10px]" : "text-xs")}>{model.label}</p>
          </div>
        </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="absolute h-[2px] origin-center rounded-full bg-gradient-to-r from-[#64E9FF]/10 via-[#64E9FF] to-[#64E9FF] shadow-[0_0_12px_rgba(100,233,255,0.8)] transition-transform duration-700"
            style={{
              width: compact ? '78px' : '92px',
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: 'center center'
            }}
          />
          <div className={cn(
            "absolute rounded-full border border-white/50 bg-[#64E9FF] shadow-[0_0_16px_rgba(100,233,255,0.85)]",
            compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"
          )} />
        </div>
      </div>

      <div className={cn("h-2.5 rounded-full bg-white/10 border border-white/10 overflow-hidden", compact ? "mt-3" : "mt-4")}>
        <div className={cn("h-full transition-all duration-500", barClass)} style={{ width: `${model.score}%` }} />
      </div>

      <div className={cn("mt-2 grid grid-cols-2 gap-2", compact ? "text-[10px]" : "text-[11px]")}>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <p className="uppercase tracking-widest text-white/45">Rischio</p>
          <p className="mt-1 text-white text-lg font-semibold">{model.riskPressure}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <p className="uppercase tracking-widest text-white/45">Regime</p>
          <p className="mt-1 text-white text-lg font-semibold">{regime?.toUpperCase() || '-'}</p>
        </div>
      </div>

      <div className={cn("mt-2.5 grid grid-cols-4 gap-1.5", compact ? "text-[10px]" : "text-[11px]")}>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/70">Bias <span className="text-white font-semibold">{model.drivers.bias}</span></div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/70">VIX <span className="text-white font-semibold">{model.drivers.vix}</span></div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/70">Regime <span className="text-white font-semibold">{model.drivers.regime}</span></div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-white/70">Conv. <span className="text-white font-semibold">{model.drivers.conviction}</span></div>
      </div>
    </TechCard>
  );
});

// COT Summary Panel - Premium Carousel Style
const COTPanel = React.memo(({ cotData, favoriteCOT, onFavoriteCOTChange, animationsReady = false }) => {
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
    const squeezeRisk = data?.bias === 'Bear'
      ? Math.min(95, 55 + (crowding * 0.45))
      : data?.bias === 'Bull'
        ? Math.max(20, 65 - ((ratio - 50) * 0.8))
        : 50;
    return {
      confidence: Math.round(confidence),
      crowding: Math.round(crowding),
      squeezeRisk: Math.round(squeezeRisk)
    };
  };

  const metrics = getMetrics(data, pos);

  // Generate interpretive text - 4 bullet points technical summary
  const getInterpretation = (data, metrics) => {
    if (!data) {
      return [
        'Dati COT in questo momento non disponibili.',
        'Aggiornamento in attesa della prossima pubblicazione ufficiale.',
        'Verifica fonti esterne e sincronizzazione backend.',
        'Nessuna lettura direzionale finche i dati non tornano disponibili.'
      ];
    }
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
      <TechCard className="dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border p-4 h-full font-apple bg-[#0F1115] border-[#1C1F26] rounded-[32px] shadow-2xl relative flex items-center justify-center">
        <p className="text-sm text-white/60 text-center">COT non disponibile al momento.</p>
      </TechCard>
    );
  }

  return (
    <TechCard className="dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border p-3 h-full font-apple bg-[#0F1115] border-[#1C1F26] rounded-[32px] shadow-2xl relative flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className={cn(
          "flex items-center gap-2 transition-all duration-200",
          showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
        )}>
          <Users className="w-5 h-5 text-[#00D9A5]" />
          <span className="font-medium text-base text-white/90">COT Institutional</span>
          {/* Info Button */}
          <div className="relative">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-1.5 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
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
              className="absolute inset-3 z-50 bg-[#0B0E14]/74 backdrop-blur-[10px] rounded-[24px]"
            >
              {/* Glass effect content layer */}
              <div className="relative px-8 py-6 bg-[#0A0D12]/86 border border-[#00D9A5]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
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
        <div className={cn(
          "flex items-center gap-4 transition-all duration-200",
          showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
        )}>
          <div className="relative" onMouseLeave={() => setShowSelector(false)}>
            <button
              onMouseEnter={() => setShowSelector(true)}
              onClick={() => setShowSelector(!showSelector)}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
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

      <div className={cn(
        "flex-1 flex flex-col -mt-[18px] transition-all duration-200",
        showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
      )}>
        {/* Main Title & Value */}
        {/* Compact Title Row & Chart */}
        {/* Left Aligned Compact Row */}
        {/* Left Stack Title & NetPos */}
        {/* Left Stack Title & NetPos - Big & Spaced */}
        <div className="flex flex-col items-start px-1 mb-0 relative top-[18px] shrink-0">
          <h2 className="text-xl font-bold text-white leading-none mb-0.5">{currentSymbol || '-'}</h2>
          <div className="flex flex-col items-start mt-0.5 relative top-[14px]">
            <span className="text-xs text-white/70 font-bold uppercase tracking-wider leading-none mb-1">Net Position</span>
            <span className={cn(
              "text-3xl font-bold tracking-tighter leading-none",
              netPos >= 0 ? "text-[#00D9A5]" : "text-red-400"
            )}>{formattedNetPos}</span>
          </div>
        </div>

        {/* Rolling Bias Section */}
        <div className="mb-0 -mt-[30px] px-0">
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
        <div className="flex items-start justify-evenly px-0 -mt-2 mb-1">
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
});




// Options Flow Panel - Enhanced Interactive
const OptionsPanel = React.memo(({ animationsReady = false, selectedAsset: propAsset, onAssetChange }) => {
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

  const currentData = STATIC_OPTIONS_DATA[selectedAsset] || STATIC_OPTIONS_DATA.XAUUSD;

  return (
    <TechCard className="dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border p-3 h-auto self-start font-apple relative">
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
            className="absolute inset-3 z-50 bg-[#0B0E14]/74 backdrop-blur-[10px] rounded-[24px]"
          >
            <div className="relative px-8 py-6 bg-[#0A0D12]/86 border border-[#00D9A5]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
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

      <div className={cn(
        "transition-all duration-200",
        showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
      )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#00D9A5]" />
          <span className="font-medium text-base text-white/90">Options Flow</span>
          {/* Info Button */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
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
      </div>

    </TechCard>
  );
});

const GammaExposurePanel = React.memo(({ selectedAsset: propAsset, onAssetChange, compact = false }) => {
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
  const currentData = STATIC_OPTIONS_DATA[selectedAsset] || STATIC_OPTIONS_DATA.XAUUSD;
  const gexProfile = useMemo(() => currentData.gex_profile || [], [currentData]);

  const maxGamma = useMemo(() => {
    const max = gexProfile.reduce((acc, row) => {
      const rowMax = Math.max(Math.abs(row.put || 0), Math.abs(row.call || 0), Math.abs(row.net || 0));
      return Math.max(acc, rowMax);
    }, 0);
    return Math.max(max, 1);
  }, [gexProfile]);

  return (
    <TechCard className={cn(
      "dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border font-apple relative",
      compact ? "p-3.5 h-auto" : "p-3 h-full"
    )}>
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
            className="absolute inset-3 z-50 bg-[#0B0E14]/74 backdrop-blur-[10px] rounded-[24px]"
          >
            <div className="relative px-8 py-6 bg-[#0A0D12]/86 border border-[#00D9A5]/30 rounded-[24px] shadow-2xl w-full h-full overflow-y-auto scrollbar-thin font-apple">
              <div className="flex items-center justify-between mb-5">
                <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida GEX</h4>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
              <div className="space-y-5 text-left">
                <p className="text-lg text-white leading-relaxed font-normal">
                  Il <span className="text-[#00D9A5] font-semibold">GEX (Gamma Exposure)</span> mostra dove i market maker sono più esposti per strike.
                  Quando il gamma è concentrato, il prezzo tende a reagire su quelle aree.
                </p>
                <ul className="space-y-4 text-left">
                  <li className="flex items-start gap-3">
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-[#B574FF] shadow-[0_0_8px_#B574FF] flex-shrink-0" />
                    <p className="text-lg text-white leading-relaxed font-normal">
                      <span className="font-semibold text-[#B574FF]">Put Gamma</span>: pressione dealer sul lato ribassista.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-[#E3C98A] shadow-[0_0_8px_#E3C98A] flex-shrink-0" />
                    <p className="text-lg text-white leading-relaxed font-normal">
                      <span className="font-semibold text-[#E3C98A]">Call Gamma</span>: supporto lato rialzista.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-[#FF4D7A] shadow-[0_0_8px_#FF4D7A] flex-shrink-0" />
                    <p className="text-lg text-white leading-relaxed font-normal">
                      <span className="font-semibold text-[#FF4D7A]">Net Gamma</span>: sintesi netta per strike, utile per identificare zone di assorbimento o accelerazione.
                    </p>
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        "transition-all duration-200",
        showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
      )}>
      <div className={cn("flex items-center justify-between px-1", compact ? "mb-2.5" : "mb-3")}>
        <div className="flex items-baseline gap-2">
          <span className={cn("font-bold text-white", compact ? "text-[22px] leading-none" : "text-xl")}>{selectedAsset}</span>
          <span className={cn("uppercase tracking-widest text-white/40", compact ? "text-sm" : "text-xs")}>Strike Ladder</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              "rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100",
              compact ? "p-1.5" : "p-1.5"
            )}
          >
            <Info className={cn("text-white", compact ? "w-4 h-4" : "w-3.5 h-3.5")} />
          </button>

          <div className="relative" onMouseLeave={() => setShowSelector(false)}>
            <button
              onClick={() => setShowSelector(!showSelector)}
              className={cn(
                "rounded-lg transition-colors border bg-slate-100 border-slate-200 hover:bg-slate-200 dark:bg-white/5 dark:border-white/20 dark:hover:bg-white/10",
                compact ? "p-1.5" : "p-1.5"
              )}
            >
              <Eye className={cn("text-slate-500 dark:text-white/60", compact ? "w-4 h-4" : "w-4 h-4")} />
            </button>
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
      </div>

      <div className={cn("flex flex-wrap items-center text-white/65", compact ? "mb-2 gap-3 text-sm" : "mb-2 gap-3 text-[11px]")}>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("rounded-full bg-[#B574FF]", compact ? "w-2.5 h-2.5" : "w-2 h-2")} />
          Put Gamma
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("rounded-full bg-[#E3C98A]", compact ? "w-2.5 h-2.5" : "w-2 h-2")} />
          Call Gamma
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("rounded-full bg-[#FF4D7A]", compact ? "w-2.5 h-2.5" : "w-2 h-2")} />
          Net Gamma
        </span>
      </div>

      <div className={cn("rounded-xl bg-white/[0.03] border border-white/10", compact ? "p-2" : "p-2.5")}>
        <div className={cn("space-y-1.5 overflow-y-auto scrollbar-thin pr-1", compact ? "max-h-[280px]" : "max-h-[240px]")}>
          {gexProfile.map((row, idx) => {
            const putWidth = Math.min((Math.abs(row.put || 0) / maxGamma) * 50, 50);
            const callWidth = Math.min((Math.abs(row.call || 0) / maxGamma) * 50, 50);
            const netValue = typeof row.net === 'number' ? row.net : (row.call || 0) + (row.put || 0);
            const netWidth = Math.min((Math.abs(netValue) / maxGamma) * 50, 50);
            const isNetPositive = netValue >= 0;

            return (
              <div key={`${row.strike}-${idx}`} className={cn("grid items-center gap-2", compact ? "grid-cols-[64px_1fr]" : "grid-cols-[64px_1fr]")}>
                <span className={cn("text-right font-medium text-white/55", compact ? "text-sm" : "text-[11px]")}>{formatStrikeLevel(row.strike)}</span>
                <div className={cn("relative rounded-md bg-black/20 overflow-hidden", compact ? "h-[18px]" : "h-3.5")}>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />

                  {putWidth > 0 && (
                    <div
                      className={cn(
                        "absolute right-1/2 top-1/2 -translate-y-1/2 rounded-l-sm bg-[#B574FF]/95",
                        compact ? "h-[8px]" : "h-[7px]"
                      )}
                      style={{ width: `${putWidth}%` }}
                    />
                  )}

                  {callWidth > 0 && (
                    <div
                      className={cn(
                        "absolute left-1/2 top-1/2 -translate-y-1/2 rounded-r-sm bg-[#E3C98A]/95",
                        compact ? "h-[8px]" : "h-[7px]"
                      )}
                      style={{ width: `${callWidth}%` }}
                    />
                  )}

                  {netWidth > 0 && (
                    <div
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 bg-[#FF4D7A]/95",
                        compact ? "h-[6px]" : "h-[5px]",
                        isNetPositive ? "left-1/2 rounded-r-sm" : "right-1/2 rounded-l-sm"
                      )}
                      style={{ width: `${netWidth}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={cn("mt-2 grid items-center gap-2", compact ? "grid-cols-[64px_1fr]" : "grid-cols-[64px_1fr]")}>
          <span />
          <div className={cn("flex items-center justify-between text-white/45", compact ? "text-sm" : "text-[10px]")}>
            <span>-{formatGammaScale(maxGamma)}</span>
            <span>0</span>
            <span>{formatGammaScale(maxGamma)}</span>
          </div>
        </div>
      </div>

      <div className={cn("rounded-xl bg-white/5 border border-white/10", compact ? "mt-2 p-2" : "mt-2.5 p-2.5")}>
        <div className="flex items-center justify-between mb-1">
          <span className={cn("text-white/80 font-medium", compact ? "text-base" : "text-sm")}>Gamma Exposure</span>
          <span className={cn(
            "font-bold",
            compact ? "text-xl" : "text-base",
            currentData.gamma_billion >= 0 ? "text-[#00D9A5]" : "text-red-400"
          )}>
            {currentData.gamma_billion >= 0 ? '+' : ''}{currentData.gamma_billion}B
          </span>
        </div>
        <div className={cn("bg-white/10 rounded-full overflow-hidden", compact ? "h-2.5" : "h-2")}>
          <div
            className={cn(
              "h-full rounded-full transition-all",
              currentData.gamma_exposure >= 50 ? "bg-[#00D9A5]" : "bg-red-400"
            )}
            style={{ width: `${currentData.gamma_exposure}%` }}
          />
        </div>
      </div>

      <div className={cn("rounded-xl bg-white/5 border border-white/10 flex items-center justify-between", compact ? "mt-2.5 p-2.5" : "mt-3 p-3")}>
        <div>
          <p className={cn("uppercase tracking-widest text-white/45", compact ? "text-sm" : "text-xs")}>Gamma Flip</p>
          <p className={cn("font-semibold text-white", compact ? "text-lg" : "text-base")}>{formatStrikeLevel(currentData.gamma_flip)}</p>
        </div>
        <div className="text-right">
          <p className={cn("uppercase tracking-widest text-white/45", compact ? "text-sm" : "text-xs")}>Gamma Score</p>
          <p className={cn(
            compact ? "text-lg font-semibold" : "text-base font-semibold",
            currentData.gamma_exposure >= 50 ? "text-[#00D9A5]" : "text-red-400"
          )}>
            {currentData.gamma_exposure}%
          </p>
        </div>
      </div>
      </div>
    </TechCard>
  );
});

// Strategy Selector Panel - data from Strategy Projection Engine
const StrategySelectorPanel = ({ projections = [], strategiesCatalog = [], expandedNews, setExpandedNews }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [selectedStrategies, setSelectedStrategies] = useState([]);

  const availableStrategies = useMemo(() => {
    if (Array.isArray(strategiesCatalog) && strategiesCatalog.length > 0) {
      return strategiesCatalog
        .map((strategy) => ({
          id: normalizeStrategyId(strategy.id),
          name: strategy.name,
          shortName: strategy.short_name || strategy.shortName || strategy.name?.slice(0, 2)?.toUpperCase() || 'ST',
          winRate: strategy.win_rate ?? strategy.winRate ?? 0,
        }))
        .sort((a, b) => b.winRate - a.winRate);
    }

    return detailedStrategies
      .filter((strategy) => !strategy.isModulator)
      .map((strategy) => ({
        id: normalizeStrategyId(strategy.id),
        name: strategy.name,
        shortName: strategy.shortName,
        winRate: strategy.winRate ?? 0,
      }))
      .sort((a, b) => b.winRate - a.winRate);
  }, [strategiesCatalog]);

  useEffect(() => {
    if (availableStrategies.length === 0) {
      setSelectedStrategies([]);
      return;
    }

    const validIds = new Set(availableStrategies.map((s) => s.id));
    setSelectedStrategies((prev) => {
      const normalizedPrev = prev.map(normalizeStrategyId).filter((id) => validIds.has(id));
      if (normalizedPrev.length > 0) return normalizedPrev;
      return availableStrategies.slice(0, 3).map((strategy) => strategy.id);
    });
  }, [availableStrategies]);

  const normalizedSignals = useMemo(() => {
    return (projections || [])
      .map((signal) => ({
        strategyId: normalizeStrategyId(signal.strategy_id || signal.strategyId),
        asset: signal.asset,
        bias: signal.bias || 'Neutral',
        winRate: signal.win_rate ?? signal.winRate ?? 0,
        probability: signal.probability ?? signal.win_rate ?? signal.winRate ?? 0,
        summary: signal.summary || '',
        trigger: signal.trigger || 'N/A',
        confidence: signal.confidence || 'N/A',
        entry: signal.entry || null,
        exit: signal.exit || null,
      }))
      .filter((signal) => signal.asset !== 'BTCUSD');
  }, [projections]);

  const filteredSignals = useMemo(() => {
    return normalizedSignals
      .filter((signal) => selectedStrategies.includes(signal.strategyId))
      .sort((a, b) => b.probability - a.probability);
  }, [normalizedSignals, selectedStrategies]);

  const toggleStrategy = (strategyId) => {
    const normalized = normalizeStrategyId(strategyId);
    if (selectedStrategies.includes(normalized)) {
      if (selectedStrategies.length > 1) {
        setSelectedStrategies(selectedStrategies.filter((id) => id !== normalized));
      }
      return;
    }
    setSelectedStrategies([...selectedStrategies, normalized]);
  };

  const selectAll = () => setSelectedStrategies(availableStrategies.map((strategy) => strategy.id));
  const selectNone = () => {
    if (availableStrategies.length === 0) return;
    setSelectedStrategies([availableStrategies[0].id]);
  };

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
                  {availableStrategies.map((strategy) => (
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
                      <span className="truncate pr-2">{strategy.name}</span>
                      <span className="text-xs opacity-60">{strategy.winRate}%</span>
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
            const strategy = availableStrategies.find((st) => st.id === s.strategyId);
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
                        style={{ width: `${s.probability}%` }}
                      />
                    </div>
                    <span className="text-xs text-white/60">{s.probability}%</span>
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
                        {s.entry?.zone && s.exit && (
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
                            <span>Entry: {s.entry.zone[0]} - {s.entry.zone[1]}</span>
                            <span>Confidence: {s.confidence}</span>
                            <span>SL: {s.exit.stop_loss}</span>
                            <span>TP1/TP2: {s.exit.take_profit_1} / {s.exit.take_profit_2}</span>
                          </div>
                        )}
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

const CALENDAR_WEEKDAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const CALENDAR_WEEKDAY_MAP = {
  lun: 1,
  mar: 2,
  mer: 3,
  gio: 4,
  ven: 5,
  sab: 6,
  dom: 0
};

const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const inferEventDate = (event, baseDate, fallbackOffset = 0) => {
  const rawDate = event?.timestamp || event?.datetime || event?.date || event?.published_at;
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const countdown = String(event?.countdown || '').toLowerCase();
  const dayMatch = countdown.match(/(\d+)\s*giorn/);
  if (dayMatch) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + Number(dayMatch[1]));
    return d;
  }

  const timeLabel = String(event?.time || '');
  const weekdayMatch = timeLabel.match(/^(lun|mar|mer|gio|ven|sab|dom)/i);
  if (weekdayMatch) {
    const targetWeekday = CALENDAR_WEEKDAY_MAP[weekdayMatch[1].toLowerCase()];
    if (typeof targetWeekday === 'number') {
      const d = new Date(baseDate);
      const delta = (targetWeekday - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + delta);
      return d;
    }
  }

  const d = new Date(baseDate);
  d.setDate(d.getDate() + (fallbackOffset % 3));
  return d;
};

const FALLBACK_NEWS_EVENTS = [
  { title: 'NFP (Jan)', time: '14:30', impact: 'high', currency: 'USD', forecast: '65K', previous: '256K', actual: '130K', countdown: 'Uscito', summary: 'Payrolls a 130K, il doppio delle attese. Disoccupazione scesa a 4.3%. Mercato prezza taglio Fed a luglio, non più giugno.' },
  { title: 'Unemployment Rate', time: '14:30', impact: 'high', currency: 'USD', forecast: '4.4%', previous: '4.4%', actual: '4.3%', countdown: 'Uscito', summary: 'Tasso disoccupazione migliorato. Mercato lavoro solido nonostante revisioni al ribasso del 2025 (-862K).' },
  { title: 'Average Hourly Earnings', time: '14:30', impact: 'high', currency: 'USD', forecast: '3.5%', previous: '3.6%', actual: '3.7%', countdown: 'Uscito', summary: 'Salari in crescita 3.7% YoY, sopra inflazione. Pressione hawkish sulla Fed.' },
  { title: 'Fed Speeches', time: '16:00', impact: 'medium', currency: 'USD', forecast: '-', previous: '-', actual: null, countdown: '15m', summary: 'Diversi policymaker Fed in programma. Tono atteso post-NFP forte: cautela sui tagli.' },
  { title: 'US 10Y Auction', time: '19:00', impact: 'medium', currency: 'USD', forecast: '4.18%', previous: '4.14%', actual: null, countdown: '3h', summary: 'Asta Treasury 10Y. Yield salito a 4.18% dopo NFP. Monitorare domanda istituzionale.' },
  { title: 'CPI (Jan)', time: 'Ven 14:30', impact: 'high', currency: 'USD', forecast: '2.5%', previous: '2.9%', actual: null, countdown: '2 giorni', summary: 'Dato inflazione cruciale dopo NFP forte. Se sopra attese, taglio Fed rinviato ulteriormente.' },
  { title: 'CBO Budget Outlook', time: '18:00', impact: 'medium', currency: 'USD', forecast: '-', previous: '-', actual: null, countdown: '2h', summary: 'Pubblicazione outlook fiscale CBO. Focus su deficit e traiettoria debito pubblico USA.' },
];

// News & Activity Sidebar
const ActivitySidebar = ({ news, strategiesProjections, strategiesCatalog, newsSummaries }) => {
  const [expandedNews, setExpandedNews] = useState(null);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(todayKey);
  const newsData = useMemo(() => {
    return Array.isArray(news) && news.length > 0 ? news : FALLBACK_NEWS_EVENTS;
  }, [news]);

  const normalizedNewsData = useMemo(() => {
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    return newsData
      .map((item, index) => {
        const eventDate = inferEventDate(item, baseDate, index);
        return {
          ...item,
          _newsIndex: index,
          _date: eventDate,
          _dateKey: toDateKey(eventDate),
          _sortTs: item?.timestamp ? new Date(item.timestamp).getTime() : eventDate.getTime()
        };
      })
      .sort((a, b) => a._sortTs - b._sortTs);
  }, [newsData]);

  const eventsByDay = useMemo(() => {
    return normalizedNewsData.reduce((acc, item) => {
      if (!item._dateKey) return acc;
      if (!acc[item._dateKey]) acc[item._dateKey] = [];
      acc[item._dateKey].push(item);
      return acc;
    }, {});
  }, [normalizedNewsData]);

  useEffect(() => {
    if (selectedCalendarDay !== todayKey) return;
    if (eventsByDay[selectedCalendarDay]) return;
    const firstDay = Object.keys(eventsByDay).sort()[0];
    if (firstDay) setSelectedCalendarDay(firstDay);
  }, [eventsByDay, selectedCalendarDay, todayKey]);

  const calendarModel = useMemo(() => {
    const anchor = normalizedNewsData[0]?._date || new Date();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const prevMonthEnd = new Date(year, month, 0);
    const leadingDays = (monthStart.getDay() + 6) % 7; // Monday-first
    const cells = [];

    for (let i = 0; i < leadingDays; i++) {
      const day = prevMonthEnd.getDate() - leadingDays + i + 1;
      const date = new Date(year, month - 1, day);
      cells.push({ date, day, inCurrentMonth: false });
    }

    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const date = new Date(year, month, day);
      cells.push({ date, day, inCurrentMonth: true });
    }

    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      const date = new Date(year, month + 1, nextDay);
      cells.push({ date, day: nextDay, inCurrentMonth: false });
      nextDay++;
    }

    const monthLabelRaw = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(monthStart);
    const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);

    return { cells, monthLabel, year };
  }, [normalizedNewsData]);

  return (
    <div className="space-y-4">
      <TechCard className="dashboard-panel-glass-boost p-4 font-apple glass-edge panel-left-edge fine-gray-border lg:w-[110%] lg:-ml-[4%] lg:relative lg:z-10">
        <div className="mb-4">
          <p className="text-3xl font-bold text-white/90 tracking-tight leading-none">{calendarModel.monthLabel}</p>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-3">
          {CALENDAR_WEEKDAY_LABELS.map((label, idx) => (
            <div key={`${label}-${idx}`} className="text-center text-base text-white/50 font-semibold">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-2">
          {calendarModel.cells.map((cell) => {
            const dateKey = toDateKey(cell.date);
            const dayEvents = eventsByDay[dateKey] || [];
            const hasEvents = dayEvents.length > 0;
            const hasHighImpact = dayEvents.some((ev) => String(ev.impact).toLowerCase() === 'high');
            const isSelected = selectedCalendarDay === dateKey;
            const isToday = todayKey === dateKey;

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedCalendarDay(dateKey)}
                className={cn(
                  "relative mx-auto h-9 w-9 rounded-full text-lg font-semibold transition-all flex items-center justify-center border border-transparent",
                  cell.inCurrentMonth ? "text-white/90" : "text-white/25",
                  !hasEvents && !isSelected && cell.inCurrentMonth && "hover:bg-white/10",
                  hasHighImpact && "bg-[linear-gradient(180deg,rgba(239,68,68,0.28)_0%,rgba(239,68,68,0.12)_100%)] backdrop-blur-[6px] border-red-300/52 ring-1 ring-red-300/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_0_18px_rgba(239,68,68,0.24)] text-white",
                  isSelected && !hasEvents && "bg-white/[0.14] ring-1 ring-white/35",
                  isToday && "ring-1 ring-[#64E9FF]/90 shadow-[0_0_10px_rgba(100,233,255,0.7)]"
                )}
              >
                {cell.day}
                {hasEvents && !hasHighImpact && (
                  <span className={cn(
                    "absolute -bottom-1 h-1.5 w-1.5 rounded-full",
                    "bg-[#00D9A5]"
                  )} />
                )}
              </button>
            );
          })}
        </div>

      </TechCard>

      <div>
        {/* News Section */}
        <TechCard className="dashboard-panel-glass-boost p-4 font-apple flex flex-col glass-edge panel-left-edge fine-gray-border lg:h-[730px] lg:w-[110%] lg:-ml-[4%] lg:relative lg:z-10" style={{ maxHeight: '730px' }}>
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
                  "p-2.5 rounded-lg transition-all cursor-pointer border-[0.85px] border-slate-300 bg-slate-50 dark:bg-white/[0.06] dark:border-[rgba(255,255,255,0.16)] dark:border-t-[rgba(255,255,255,0.28)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-slate-100 dark:hover:bg-white/[0.09]",
                  expandedNews === i && "ring-1 ring-slate-300 dark:ring-white/24"
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
                      <div className="mt-3 p-3 bg-white border-[0.85px] border-slate-300 rounded-lg dark:bg-white/[0.06] dark:border-[rgba(255,255,255,0.16)] dark:border-t-[rgba(255,255,255,0.28)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
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
      </div>

      {/* 3h News Cycle Summary */}
      {newsSummaries?.three_hour && (
        <TechCard className="p-4 font-apple">
          <h4 className="text-sm font-medium text-white/90 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#00D9A5]" />
            Sintesi 3H News Cycle
          </h4>
          <p className="text-sm text-white/70 leading-relaxed">{newsSummaries.three_hour}</p>
        </TechCard>
      )}

      {/* Strategy Suggestions - from Strategy Projection Engine */}
      <StrategySelectorPanel
        projections={strategiesProjections}
        strategiesCatalog={strategiesCatalog}
        expandedNews={expandedNews}
        setExpandedNews={setExpandedNews}
      />
      <Link
        to="/app/strategy"
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
      <div className="dashboard-panel-glass-boost bias-panel-border glass-edge panel-left-edge fine-gray-border flex items-center justify-between p-2 sm:p-3 rounded-lg font-apple bg-white shadow-[0_20px_50px_rgb(0,0,0,0.1)] dark:bg-[#0F1115] dark:shadow-none">
        {/* Left side: Bias + VIX + Regime */}
        <div className="flex flex-nowrap items-center gap-1 sm:gap-3">
          {/* Daily Bias */}
          <button
            onClick={() => toggleItem('bias')}
            className={cn(
              "flex items-center gap-0.5 sm:gap-2 px-1 py-0.5 sm:px-2 sm:py-1 rounded-lg transition-all cursor-pointer",
              expandedItem === 'bias' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20 tab-border-highlight" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Target className="w-2.5 h-2.5 sm:w-5 sm:h-5 text-[#00D9A5]" />
            <span className="text-[8px] sm:text-base text-slate-500 dark:text-white/50">Bias:</span>
            <span className={cn(
              "text-[9px] sm:text-lg font-bold",
              overallBias === 'BULLISH' ? "text-[#00D9A5]" : overallBias === 'BEARISH' ? "text-red-400" : "text-yellow-400"
            )}>
              {overallBias}
            </span>
            <span className="hidden sm:inline text-base text-slate-400 dark:text-white/40">
              (<span className="text-[#00D9A5]">▲{bullishCount}</span> <span className="text-red-400">▼{bearishCount}</span>)
            </span>
            <ChevronDown className={cn(
              "w-3 h-3 sm:w-4 sm:h-4 text-slate-400 dark:text-white/40 transition-transform hidden sm:block",
              expandedItem === 'bias' && "rotate-180"
            )} />
          </button>

          <div className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-white/10" />

          {/* VIX */}
          <button
            onClick={() => toggleItem('vix')}
            className={cn(
              "flex items-center gap-0.5 sm:gap-2 px-1 py-0.5 sm:px-2 sm:py-1 rounded-lg transition-all cursor-pointer",
              expandedItem === 'vix' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Shield className="w-2.5 h-2.5 sm:w-5 sm:h-5 text-[#00D9A5]" />
            <span className="text-[8px] sm:text-base text-slate-500 dark:text-white/50">VIX</span>
            <span className={cn(
              "text-[9px] sm:text-lg font-bold font-mono",
              vix?.current > 22 ? "text-red-400" : vix?.current > 18 ? "text-yellow-400" : "text-[#00D9A5]"
            )}>
              {vix?.current || '-'}
            </span>
            <ChevronDown className={cn(
              "w-3 h-3 sm:w-4 sm:h-4 text-slate-400 dark:text-white/40 transition-transform hidden sm:block",
              expandedItem === 'vix' && "rotate-180"
            )} />
          </button>

          <div className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-white/10" />

          {/* Regime */}
          <button
            onClick={() => toggleItem('regime')}
            className={cn(
              "flex items-center gap-0.5 sm:gap-2 px-1 py-0.5 sm:px-2 sm:py-1 rounded-lg transition-all cursor-pointer",
              expandedItem === 'regime' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <Activity className="w-2.5 h-2.5 sm:w-5 sm:h-5 text-[#00D9A5]" />
            <span className="text-[8px] sm:text-base text-slate-500 dark:text-white/50">Regime:</span>
            <span className={cn(
              "text-[9px] sm:text-lg font-bold",
              regime === 'risk-off' ? "text-red-400" : regime === 'risk-on' ? "text-[#00D9A5]" : "text-yellow-400"
            )}>
              {regime?.toUpperCase() || '-'}
            </span>
            <ChevronDown className={cn(
              "w-3 h-3 sm:w-4 sm:h-4 text-slate-400 dark:text-white/40 transition-transform hidden sm:block",
              expandedItem === 'regime' && "rotate-180"
            )} />
          </button>
        </div>

        {/* Right side: News + Subscription Plan Badge */}
        <div className="hidden sm:flex items-center gap-6">
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
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-2 text-sm sm:text-base">
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
  const isSmallMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 640px)').matches;
  }, []);
  const [multiSourceData, setMultiSourceData] = useState(null);
  const [cotSummary, setCotSummary] = useState(null);
  const [engineData, setEngineData] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [strategyProjections, setStrategyProjections] = useState([]);
  const [strategiesCatalog, setStrategiesCatalog] = useState([]);
  const [newsBriefing, setNewsBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favoriteCharts, setFavoriteCharts] = useState(['XAUUSD', 'NAS100', 'SP500']);
  const [favoriteCOT, setFavoriteCOT] = useState(['NAS100', 'SP500']);
  const [optionsSelectedAsset, setOptionsSelectedAsset] = useState('XAUUSD');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const playIntro = !isSmallMobile && !hasPlayedDashboardIntro;
  const cotReleaseKeyRef = useRef(null);

  // Typewriter animation state
  const [introPhase, setIntroPhase] = useState(() => (playIntro ? 'typing' : 'done')); // 'typing' | 'visible' | 'done'
  const [typedChars, setTypedChars] = useState(0);
  const [headerHidden, setHeaderHidden] = useState(() => !playIntro);
  const biasBarRef = useRef(null);

  useEffect(() => {
    if (!hasPlayedDashboardIntro) {
      hasPlayedDashboardIntro = true;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      const [multiRes, engineRes, strategyRes, strategyCatalogRes, newsRes] = await Promise.all([
        axios.get(`${API}/analysis/multi-source`),
        axios.get(`${API}/engine/cards`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/strategy/projections`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/strategy/catalog`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/news/briefing`, { headers: authHeader }).catch(() => ({ data: null })),
      ]);

      setMultiSourceData(multiRes.data);
      setEngineData(Array.isArray(engineRes.data) ? engineRes.data : []);
      setStrategiesCatalog(Array.isArray(strategyCatalogRes.data?.strategies) ? strategyCatalogRes.data.strategies : []);
      setStrategyProjections(Array.isArray(strategyRes.data?.projections) ? strategyRes.data.projections : []);

      const directNews = newsRes.data || null;
      const fallbackNews = strategyRes.data?.events ? strategyRes.data : null;
      setNewsBriefing(directNews || fallbackNews);

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

  const fetchCotData = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/cot/data`);
      const payload = response?.data;
      if (!payload || typeof payload !== 'object') return;

      const nextReleaseKey = getCotReleaseKey(payload);
      if (cotReleaseKeyRef.current === null) {
        cotReleaseKeyRef.current = nextReleaseKey || 'initial-load';
        setCotSummary(payload);
        return;
      }

      if (nextReleaseKey && nextReleaseKey !== cotReleaseKeyRef.current) {
        cotReleaseKeyRef.current = nextReleaseKey;
        setCotSummary(payload);
      }
    } catch (error) {
      console.error('Error fetching COT data:', error);
    }
  }, []);

  useEffect(() => {
    fetchCotData();
    const interval = setInterval(fetchCotData, 3 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchCotData]);

  const fetchLivePrices = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/market/prices`);
      if (response?.data && typeof response.data === 'object') {
        setLivePrices(response.data);
      }
    } catch (error) {
      console.error('Error fetching live prices:', error);
    }
  }, []);

  useEffect(() => {
    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 8000);
    return () => clearInterval(interval);
  }, [fetchLivePrices]);

  const { analyses, vix, regime, next_event } = multiSourceData || {};

  // Mock data for demo mode when backend is unavailable
  const mockAnalyses = useMemo(() => ({
    'XAUUSD': { price: 5055.2, direction: 'Up', confidence: 58, impulse: 'Rallenta', drivers: [{ name: 'Safe Haven', impact: 'Bullish' }, { name: 'Long liquidation', impact: 'Cautela' }] },
    'NAS100': { price: 21450, direction: 'Up', confidence: 55, impulse: 'Laterale', drivers: [{ name: 'NFP forte', impact: 'Positivo' }, { name: 'Tech weakness', impact: 'Cautela' }] },
    'SP500': { price: 6941.5, direction: 'Up', confidence: 52, impulse: 'Laterale', drivers: [{ name: 'NFP Beat', impact: 'Supportivo' }, { name: 'Fed hawkish', impact: 'Freno' }] },
    'EURUSD': { price: 1.1870, direction: 'Up', confidence: 65, impulse: 'Prosegue', drivers: [{ name: 'USD Debole', impact: 'Bullish' }, { name: 'ECB Hawkish', impact: 'Supportivo' }] },
  }), []);

  // Use real data if available, otherwise fallback to mock data
  const analysesData = analyses || mockAnalyses;

  // Build assets array for chart tabs (no VIX)
  const assetsList = useMemo(() => Object.entries(analysesData).map(([symbol, data]) => {
    // Find engine data for this symbol
    const assetEngineData = engineData?.find(card => card.asset === symbol);
    const live = livePrices?.[symbol];

    return {
      symbol,
      analysisPrice: data.price,
      analysisChange: data.change ?? 0,
      price: live?.price ?? data.price,
      change: live?.change ?? data.change ?? 0,
      direction: assetEngineData?.direction === 'UP' ? 'Up' : assetEngineData?.direction === 'DOWN' ? 'Down' : data.direction,
      confidence: assetEngineData?.probability ?? data.confidence,
      impulse: assetEngineData?.impulse ?? data.impulse,
      explanation: data.drivers?.map(d => `${d.name}: ${d.impact}`).join('. '),
      scores: assetEngineData?.scores || {},
      drivers: assetEngineData?.drivers || [],
      atr: assetEngineData?.atr,
      dayChangePoints: assetEngineData?.day_change_points,
      dayChangePct: assetEngineData?.day_change_pct,
      monthChangePoints: assetEngineData?.month_change_points,
      monthChangePct: assetEngineData?.month_change_pct,
      sparkData: [30, 35, 28, 42, 38, 55, 48, 52]
    };
  }), [analysesData, engineData, livePrices]);

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
    if (introPhase !== 'typing' || isSmallMobile) return;

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
  }, [typedChars, totalChars, introPhase, isSmallMobile]);

  // After "visible" phase, wait then scroll
  useEffect(() => {
    if (introPhase !== 'visible' || isSmallMobile) return;

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
  }, [introPhase, isSmallMobile]);

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
    <div className="dashboard-page max-sm:px-2" data-testid="dashboard-page" id="dashboard-main">
      {/* Header - Typewriter Animation */}
      {!headerHidden && (
        <motion.div
          className="mb-6 flex items-start justify-between gap-4"
          animate={introPhase === 'done' ? { opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' } : { opacity: 1, height: 'auto' }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <div>
            <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-white/95">
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

      <div
        className="mb-3 sm:mb-6 max-sm:sticky max-sm:z-20"
        ref={biasBarRef}
        style={{ scrollMarginTop: '16px', top: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
      >
        <DailyBiasHeader
          analyses={analysesData}
          vix={vix || { current: 17.62, change: -0.96 }}
          regime={regime || 'risk-on'}
          nextEvent={next_event || { event: 'US Core CPI m/m', countdown: '13h' }}
        />
      </div>

      {/* Main Grid: Center + GEX + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:mr-2 lg:items-start">
        {/* CENTER: Charts + COT + Options */}
        <div className="lg:col-span-8 space-y-6">

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

          {/* COT Row */}
          <div className="lg:w-[51%] lg:mr-auto">
            <COTPanel cotData={cotDataToUse} favoriteCOT={favoriteCOT} onFavoriteCOTChange={setFavoriteCOT} animationsReady={headerHidden} />
          </div>
        </div>

        {/* GEX Column (left of News) */}
        <div className="lg:col-span-2 self-start space-y-4 lg:w-[106%] lg:-ml-[8%] lg:relative lg:z-20">
          <div className="relative">
            <div className="hidden lg:block lg:absolute lg:top-0 lg:right-full lg:mr-5 lg:w-[112%]">
              <FearGreedPanel
                analyses={analysesData}
                vix={vix || { current: 17.62, change: -0.96 }}
                regime={regime || 'risk-on'}
                compact={false}
              />
            </div>

            <div className="lg:hidden mb-4">
              <FearGreedPanel
                analyses={analysesData}
                vix={vix || { current: 17.62, change: -0.96 }}
                regime={regime || 'risk-on'}
                compact
              />
            </div>

            <GammaExposurePanel
              selectedAsset={optionsSelectedAsset}
              onAssetChange={setOptionsSelectedAsset}
              compact
            />
          </div>
          <OptionsPanel
            animationsReady={headerHidden}
            selectedAsset={optionsSelectedAsset}
            onAssetChange={setOptionsSelectedAsset}
          />
        </div>

        {/* RIGHT SIDEBAR: News + Activity + Strategies */}
        <div className="lg:col-span-2">
          <ActivitySidebar
            news={newsBriefing?.events}
            newsSummaries={newsBriefing?.summaries}
            strategiesProjections={strategyProjections}
            strategiesCatalog={strategiesCatalog}
          />
        </div>
      </div>
    </div>
  );
}
