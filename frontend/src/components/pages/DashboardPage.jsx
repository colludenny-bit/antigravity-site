import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useMarket } from '../../contexts/MarketContext';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Activity,
  Target, Shield, AlertTriangle, RefreshCw, Lightbulb, Clock,
  BarChart3, Eye, Minus, Users, ArrowUpRight, ArrowDownRight,
  Scale, Layers, Newspaper, ChevronDown, ChevronUp, ChevronRight, Gauge,
  Zap, Calendar, ChevronLeft, Info, X, Crown, Sparkles
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

const BACKEND_URL_RAW = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '');
const IS_LOCAL_HOST = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SAFE_BACKEND_URL = !IS_LOCAL_HOST && /localhost|127\.0\.0\.1/.test(BACKEND_URL_RAW) ? '' : BACKEND_URL_RAW;
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
  const skipEntryMotion = liteMotion || hasPlayedDashboardEntryMotion;

  useEffect(() => {
    if (!content) return;
    if (skipEntryMotion) {
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
  }, [content, speed, delay, skipEntryMotion]);

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
  const skipEntryMotion = liteMotion || hasPlayedDashboardEntryMotion;

  useEffect(() => {
    if (skipEntryMotion) {
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
  }, [numVal, duration, delay, isDecimal, skipEntryMotion]);

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

const API = `${SAFE_BACKEND_URL}/api`;
let hasPlayedDashboardIntro = false;
let hasPlayedDashboardEntryMotion = false;

const dashboardInitial = (variant) => (hasPlayedDashboardEntryMotion ? false : variant);

const DASHBOARD_FETCH_INTERVALS_MS = {
  core: 30 * 1000,
  cot: 3 * 60 * 60 * 1000,
  livePrices: 8 * 1000,
  marketBreadth: (4 * 60 + 1) * 60 * 1000
};

const MARKET_BREADTH_CONFIG = {
  selectorKeys: ['NAS100', 'SP500', 'XAUUSD', 'EURUSD'],
  updateCadenceLabel: 'ogni 4 ore e 1 minuto',
  timeframeLabel: '4H'
};

const DEFAULT_BREADTH_THRESHOLDS = {
  bullish_ma50_min: 70,
  bullish_ma200_min: 60,
  weak_ma50_max: 35,
  weak_ma200_max: 40
};

const resolveBreadthThresholds = (breadthData) => {
  const src = breadthData?.source?.thresholds || {};
  const bullish_ma50_min = Number(src?.bullish_ma50_min);
  const bullish_ma200_min = Number(src?.bullish_ma200_min);
  const weak_ma50_max = Number(src?.weak_ma50_max);
  const weak_ma200_max = Number(src?.weak_ma200_max);
  return {
    bullish_ma50_min: Number.isFinite(bullish_ma50_min) ? bullish_ma50_min : DEFAULT_BREADTH_THRESHOLDS.bullish_ma50_min,
    bullish_ma200_min: Number.isFinite(bullish_ma200_min) ? bullish_ma200_min : DEFAULT_BREADTH_THRESHOLDS.bullish_ma200_min,
    weak_ma50_max: Number.isFinite(weak_ma50_max) ? weak_ma50_max : DEFAULT_BREADTH_THRESHOLDS.weak_ma50_max,
    weak_ma200_max: Number.isFinite(weak_ma200_max) ? weak_ma200_max : DEFAULT_BREADTH_THRESHOLDS.weak_ma200_max
  };
};

const deriveBreadthBias = (breadthNode, thresholds = DEFAULT_BREADTH_THRESHOLDS) => {
  if (!breadthNode || typeof breadthNode !== 'object') return 'UNKNOWN';

  const aboveMa50Pct = Number(breadthNode?.above_ma50?.pct);
  const aboveMa200Pct = Number(breadthNode?.above_ma200?.pct);
  if (Number.isFinite(aboveMa50Pct) && Number.isFinite(aboveMa200Pct)) {
    if (aboveMa50Pct >= thresholds.bullish_ma50_min && aboveMa200Pct >= thresholds.bullish_ma200_min) return 'BULLISH';
    if (aboveMa50Pct <= thresholds.weak_ma50_max && aboveMa200Pct <= thresholds.weak_ma200_max) return 'BEARISH';
    return 'NEUTRAL';
  }

  const regime = String(breadthNode?.breadth_regime || '').toLowerCase();
  if (regime === 'broad-bullish') return 'BULLISH';
  if (regime === 'broad-weakness') return 'BEARISH';
  if (regime) return 'NEUTRAL';
  return 'UNKNOWN';
};

const BREADTH_RISK_SCORING = {
  vixSafeMaxExclusive: 15,
  vixMediumMaxInclusive: 25,
  ma50StrongMinExclusive: 60,
  ma50MediumMinInclusive: 40,
  ma50MediumMaxInclusive: 60,
  ma200BonusMinExclusive: 70,
  safeScoreMin: 4,
  mediumScoreMin: 2
};

const BREADTH_DIVERGENCE_RULES = {
  lookbackDays: 20,
  declineSessions: 5,
  minDropPctPoints: 5,
  nearHighRatio: 0.99
};

const BREADTH_RISK_LEVEL_STYLE = {
  SAFE: {
    tone: 'SAFE',
    className: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_26px_rgba(16,185,129,0.2)]'
  },
  MEDIUM: {
    tone: 'MEDIUM',
    className: 'border-yellow-300/60 bg-yellow-500/14 text-yellow-200 shadow-[0_0_26px_rgba(234,179,8,0.22)]'
  },
  HIGH: {
    tone: 'HIGH',
    className: 'border-red-400/60 bg-red-500/15 text-red-200 shadow-[0_0_26px_rgba(239,68,68,0.2)]'
  }
};

const asFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const scoreBreadthVix = (vixValue) => {
  if (!Number.isFinite(vixValue)) return 0;
  if (vixValue < BREADTH_RISK_SCORING.vixSafeMaxExclusive) return 2;
  if (vixValue <= BREADTH_RISK_SCORING.vixMediumMaxInclusive) return 1;
  return 0;
};

const scoreBreadthMa50 = (ma50Value) => {
  if (!Number.isFinite(ma50Value)) return 0;
  if (ma50Value > BREADTH_RISK_SCORING.ma50StrongMinExclusive) return 2;
  if (
    ma50Value >= BREADTH_RISK_SCORING.ma50MediumMinInclusive
    && ma50Value <= BREADTH_RISK_SCORING.ma50MediumMaxInclusive
  ) return 1;
  return 0;
};

const scoreBreadthMa200Bonus = (ma200Value) => {
  if (!Number.isFinite(ma200Value)) return 0;
  return ma200Value > BREADTH_RISK_SCORING.ma200BonusMinExclusive ? 1 : 0;
};

const extractDailyMa50Series = (indexData) => {
  const historyRows = Array.isArray(indexData?.history) ? indexData.history : [];
  const dailyMap = new Map();

  historyRows.forEach((point) => {
    const rawDate = String(point?.date || '');
    const dayKey = rawDate.length >= 10 ? rawDate.slice(0, 10) : '';
    if (!dayKey) return;

    const price = asFiniteNumber(point?.price);
    const ma50 = asFiniteNumber(point?.above_ma50_pct);
    if (!Number.isFinite(price) || !Number.isFinite(ma50)) return;

    dailyMap.set(dayKey, { dayKey, price, ma50 });
  });

  if (dailyMap.size === 0) {
    const fallbackDay = String(indexData?.as_of_date || '').slice(0, 10);
    const fallbackPrice = asFiniteNumber(indexData?.latest_price);
    const fallbackMa50 = asFiniteNumber(indexData?.above_ma50?.pct);
    if (fallbackDay && Number.isFinite(fallbackPrice) && Number.isFinite(fallbackMa50)) {
      dailyMap.set(fallbackDay, { dayKey: fallbackDay, price: fallbackPrice, ma50: fallbackMa50 });
    }
  }

  const ordered = Array.from(dailyMap.values()).slice(-BREADTH_DIVERGENCE_RULES.lookbackDays);
  return ordered.map((row) => ({
    ...row,
    label: row.dayKey.length >= 10 ? `${row.dayKey.slice(8, 10)}/${row.dayKey.slice(5, 7)}` : row.dayKey
  }));
};

const buildBreadthRiskSnapshot = (indexData, vixCurrent) => {
  const vixValue = asFiniteNumber(vixCurrent);
  const ma50Value = asFiniteNumber(indexData?.above_ma50?.pct);
  const ma200Value = asFiniteNumber(indexData?.above_ma200?.pct);

  const vixScore = scoreBreadthVix(vixValue);
  const ma50Score = scoreBreadthMa50(ma50Value);
  const ma200Bonus = scoreBreadthMa200Bonus(ma200Value);
  const totalScore = vixScore + ma50Score + ma200Bonus;

  const level = totalScore >= BREADTH_RISK_SCORING.safeScoreMin
    ? 'SAFE'
    : totalScore >= BREADTH_RISK_SCORING.mediumScoreMin
      ? 'MEDIUM'
      : 'HIGH';

  const ma50Series = extractDailyMa50Series(indexData);
  const ma50Values = ma50Series
    .map((row) => asFiniteNumber(row?.ma50))
    .filter((value) => Number.isFinite(value));
  const priceValues = ma50Series
    .map((row) => asFiniteNumber(row?.price))
    .filter((value) => Number.isFinite(value));
  const latestPrice = priceValues.length > 0
    ? priceValues[priceValues.length - 1]
    : asFiniteNumber(indexData?.latest_price);
  const high20d = priceValues.length > 0 ? Math.max(...priceValues) : null;
  const near20dHigh = Number.isFinite(latestPrice) && Number.isFinite(high20d)
    ? latestPrice >= (high20d * BREADTH_DIVERGENCE_RULES.nearHighRatio)
    : false;

  const requiredPoints = BREADTH_DIVERGENCE_RULES.declineSessions + 1;
  const recentMa50 = ma50Values.slice(-requiredPoints);
  let breadthDecline = false;
  if (recentMa50.length === requiredPoints) {
    const consecutiveDrop = recentMa50.every((value, idx) => (
      idx === 0 || (Number.isFinite(value) && Number.isFinite(recentMa50[idx - 1]) && value < recentMa50[idx - 1])
    ));
    const totalDrop = recentMa50[0] - recentMa50[recentMa50.length - 1];
    breadthDecline = consecutiveDrop && totalDrop >= BREADTH_DIVERGENCE_RULES.minDropPctPoints;
  }

  return {
    vixValue,
    ma50Value,
    ma200Value,
    vixScore,
    ma50Score,
    ma200Bonus,
    totalScore,
    level,
    levelStyle: BREADTH_RISK_LEVEL_STYLE[level] || BREADTH_RISK_LEVEL_STYLE.MEDIUM,
    divergenceActive: near20dHigh && breadthDecline,
    ma50Series
  };
};

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

const EMPTY_OPTIONS_NODE = {
  call_ratio: 50,
  put_ratio: 50,
  net_flow: 50,
  bias: 'neutral',
  call_million: 0,
  put_million: 0,
  net_million: 0,
  call_change: 0,
  put_change: 0,
  net_change: 0,
  flow_shift_to_puts: 0,
  gamma_exposure: 0,
  gamma_billion: 0,
  gamma_flip: null,
  gex_profile: [],
  source: 'unavailable'
};

const COT_LEGACY_FALLBACK_URL = 'https://www.cftc.gov/dea/futures/deacmelf.htm';

const getCotReleaseKey = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const legacyCode = payload?.legacy_report?.report_code;
  if (legacyCode) return String(legacyCode);
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

const getLiveOptionsNode = (optionsData, symbol) => {
  const node = optionsData?.[symbol];
  if (node && typeof node === 'object') {
    return { ...EMPTY_OPTIONS_NODE, ...node, data_unavailable: false };
  }
  return { ...EMPTY_OPTIONS_NODE, symbol, data_unavailable: true };
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

const formatSignedGammaExposure = (value) => {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}M`;
  if (abs >= 100) return `${sign}${abs.toFixed(0)}K`;
  return `${sign}${abs.toFixed(1)}K`;
};

const formatStrikeLevel = (value) => {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) < 10) {
    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
};

const TRADINGVIEW_MINI_SYMBOL = {
  XAUUSD: 'OANDA:XAUUSD',
  NAS100: 'CAPITALCOM:US100',
  US100: 'CAPITALCOM:US100',
  SP500: 'CAPITALCOM:US500',
  US500: 'CAPITALCOM:US500',
  DOW: 'CAPITALCOM:US30',
  US30: 'CAPITALCOM:US30',
  EURUSD: 'OANDA:EURUSD',
  BTCUSD: 'BINANCE:BTCUSDT',
  BTCUSDT: 'BINANCE:BTCUSDT'
};
const TV_CANDLE_UP = '#22c55e';
const TV_CANDLE_DOWN = '#ef4444';
const TV_BULL_GOLD = '#E3C98A';
const TV_PRICE_PURPLE = '#A78BFA';

const buildTradingViewMiniUrl = (assetSymbol, { interval = '15', interactive = false } = {}) => {
  const normalizedSymbol = String(assetSymbol || '').toUpperCase();
  const tvSymbol = TRADINGVIEW_MINI_SYMBOL[normalizedSymbol];
  if (!tvSymbol) return null;
  const fixedInterval = '5';
  const overrides = {
    "mainSeriesProperties.style": 2,
    "mainSeriesProperties.lineStyle.color": TV_PRICE_PURPLE,
    "mainSeriesProperties.lineStyle.linewidth": 2,
    "mainSeriesProperties.lineStyle.priceSource": "close",
    "mainSeriesProperties.priceLineColor": TV_PRICE_PURPLE,
    "mainSeriesProperties.showPriceLine": true,
    "mainSeriesProperties.statusViewStyle.symbolTextSource": "description",
    "scalesProperties.textColor": "#E8EDF3",
    "scalesProperties.showSeriesLastValue": false,
    "scalesProperties.showSymbolLabels": false,
    "paneProperties.legendProperties.showSeriesTitle": false,
    "paneProperties.legendProperties.showSeriesOHLC": false,
    "paneProperties.legendProperties.showBarChange": false,
    "paneProperties.backgroundType": "solid",
    "paneProperties.background": "#0B0F17",
    "paneProperties.vertGridProperties.color": "rgba(0, 0, 0, 0)",
    "paneProperties.vertGridProperties.style": 0,
    "paneProperties.horzGridProperties.color": "rgba(0, 0, 0, 0)",
    "paneProperties.horzGridProperties.style": 0,
    "paneProperties.rightOffset": 14,
    "mainSeriesProperties.candleStyle.upColor": TV_CANDLE_UP,
    "mainSeriesProperties.candleStyle.downColor": TV_CANDLE_DOWN,
    "mainSeriesProperties.candleStyle.drawWick": true,
    "mainSeriesProperties.candleStyle.drawBorder": true,
    "mainSeriesProperties.candleStyle.wickUpColor": TV_CANDLE_UP,
    "mainSeriesProperties.candleStyle.wickDownColor": TV_CANDLE_DOWN,
    "mainSeriesProperties.candleStyle.borderUpColor": TV_CANDLE_UP,
    "mainSeriesProperties.candleStyle.borderDownColor": TV_CANDLE_DOWN
  };
  const studiesOverrides = {
    "VolumeWeightedAveragePrice.plot.color": "#FFD166",
    "VolumeWeightedAveragePrice.plot.linewidth": 2,
    "Volume Weighted Average Price.plot.color": "#FFD166",
    "Volume Weighted Average Price.plot.linewidth": 2,
    "VolumeWeightedMovingAverage.plot.color": "#7DD3FC",
    "VolumeWeightedMovingAverage.plot.linewidth": 2
  };
  const params = new URLSearchParams({
    symbol: tvSymbol,
    interval: fixedInterval,
    hidesidetoolbar: interactive ? '0' : '1',
    hide_top_toolbar: interactive ? '0' : '1',
    hide_legend: interactive ? '0' : '1',
    hide_volume: interactive ? '0' : '1',
    hidevolume: interactive ? '0' : '1',
    symboledit: interactive ? '1' : '0',
    saveimage: interactive ? '1' : '0',
    toolbarbg: interactive ? '0f1720' : 'f1f3f6',
    studies: '["VolumeWeightedAveragePrice@tv-basicstudies","VWAP@tv-basicstudies","VolumeWeightedMovingAverage@tv-basicstudies"]',
    theme: 'dark',
    style: '2',
    timezone: 'exchange',
    withdateranges: interactive ? '1' : '0',
    showpopupbutton: interactive ? '1' : '0',
    studies_overrides: JSON.stringify(studiesOverrides),
    overrides: JSON.stringify(overrides),
    locale: 'it'
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
};

const TradingViewMiniChart = ({ assetSymbol, title, interval = '15', interactive = false, resetNonce = 0 }) => {
  const src = buildTradingViewMiniUrl(assetSymbol, { interval, interactive });
  if (!src) return null;
  return (
    <iframe
      key={`${assetSymbol}-${resetNonce}`}
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
const AssetChartPanel = ({
  assets,
  favoriteCharts,
  onFavoriteChange,
  animationsReady = false,
  onSyncAsset,
  vix,
  regime,
  cotData = null,
  breadthData = null,
  optionsData = null,
  newsEvents = null,
  newsSentiment = null,
  nextEvent = null,
  className = ''
}) => {
  // State with LocalStorage Persistence
  const [viewMode, setViewMode] = useState('focus');
  const [selectedAsset, setSelectedAsset] = useState(() => localStorage.getItem('dashboard_selectedAsset') || null);
  const [showSelector, setShowSelector] = useState(false);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showDeepInsight, setShowDeepInsight] = useState(false);
  const [chartLineColor, setChartLineColor] = useState(() => localStorage.getItem('dashboard_chartLineColor') || '#00D9A5');
  const [syncEnabled, setSyncEnabled] = useState(() => localStorage.getItem('dashboard_syncEnabled') === 'true');
  const [mobileChartIndex, setMobileChartIndex] = useState(0);
  const [tvResetNonce, setTvResetNonce] = useState(0);
  const isMobile = useIsMobile();
  const tvResetTimerRef = useRef(null);
  const safeAssets = useMemo(
    () => (Array.isArray(assets)
      ? assets.filter((asset) => asset && typeof asset === 'object' && typeof asset.symbol === 'string' && asset.symbol.trim() !== '')
      : []),
    [assets]
  );

  // Load Cloud Preferences on Mount
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const res = await api.get('/user/preferences');
        if (res.data) {
          if (res.data.selected_asset) setSelectedAsset(res.data.selected_asset);
          if (res.data.sync_enabled !== undefined) setSyncEnabled(res.data.sync_enabled);
          if (res.data.chart_line_color) setChartLineColor(res.data.chart_line_color);
        }
      } catch (err) {
        console.warn('Preferences keep local-only (fallback)');
      }
    };
    loadPrefs();
  }, []);

  useEffect(() => {
    if (safeAssets.length === 0) return;
    const hasSelected = selectedAsset && safeAssets.some((asset) => asset.symbol === selectedAsset);
    if (!hasSelected) {
      setSelectedAsset(safeAssets[0].symbol);
    }
  }, [safeAssets, selectedAsset]);

  // Sync Preferences to Cloud
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await api.post('/user/preferences', {
          selected_asset: selectedAsset,
          sync_enabled: syncEnabled,
          chart_line_color: chartLineColor,
          theme: 'dark' // Fixed default for now
        });
      } catch (err) {
        console.error('Failed to sync preferences');
      }
    }, 2000); // 2s debounce

    return () => clearTimeout(timer);
  }, [selectedAsset, syncEnabled, chartLineColor]);

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
    if (selectedAsset && favoriteCharts[0] !== selectedAsset && typeof onFavoriteChange === 'function') {
      onFavoriteChange([selectedAsset]);
    }
  }, [selectedAsset, favoriteCharts, onFavoriteChange]); // Keep favorites synced with selected asset

  useEffect(() => {
    localStorage.setItem('dashboard_chartLineColor', chartLineColor);
  }, [chartLineColor]);

  useEffect(() => {
    return () => {
      if (tvResetTimerRef.current) clearTimeout(tvResetTimerRef.current);
    };
  }, []);

  // Filter to show only favorite charts in grid
  const visibleAssets = useMemo(() => {
    const favorites = safeAssets.filter((asset) => favoriteCharts.includes(asset.symbol));
    return favorites.length > 0 ? favorites : safeAssets.slice(0, 3);
  }, [safeAssets, favoriteCharts]);

  const toggleFavorite = (symbol) => {
    if (!favoriteCharts.includes(symbol)) {
      onFavoriteChange([symbol]);
      setMobileChartIndex(0);
      setSelectedAsset(symbol);
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

  const currentAsset = selectedAsset
    ? safeAssets.find((asset) => asset.symbol === selectedAsset) || safeAssets[0]
    : safeAssets[0];
  const dailyOutlook = currentAsset ? getDailyOutlook(currentAsset) : null;
  const now = new Date();
  const weekNum = Math.min(4, Math.floor((now.getDate() - 1) / 7) + 1);
  const dayKey = now.toLocaleDateString('en-US', { weekday: 'long' });
  const weekRule = SEASONALITY_RULES.weeks[weekNum] || {};
  const dayRule = SEASONALITY_RULES.days[dayKey] || {};
  const isIndex = currentAsset?.symbol === 'NAS100' || currentAsset?.symbol === 'SP500';
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
    ? `Week ${weekNum} ${weekRule.description || '—'}, giornata statistica di ${dayBiasNormalized}`
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
  const screeningFocusFallbackNarrative = (() => {
    if (!currentAsset) return 'Screening in aggiornamento.';

    const assetLabelMap = {
      NAS100: 'Nasdaq',
      SP500: 'S&P 500',
      XAUUSD: 'Oro',
      EURUSD: 'EUR/USD',
      DOW: 'Dow Jones',
      BTCUSD: 'Bitcoin'
    };
    const assetLabel = assetLabelMap[currentAsset.symbol] || currentAsset.symbol;
    const directionLabel = currentAsset.direction === 'Up'
      ? 'rialzista'
      : currentAsset.direction === 'Down'
        ? 'ribassista'
        : 'neutrale';
    const drivers = Array.isArray(currentAsset?.drivers) ? currentAsset.drivers : [];
    const rawPositioning = Number(currentAsset?.scores?.positioning);
    const hasPositioning = Number.isFinite(rawPositioning);
    const positioningNet = hasPositioning ? Math.round(rawPositioning - 50) : null;
    const positioningSide = hasPositioning && positioningNet < 0 ? 'short' : 'long';
    const rawVolatility = Number(currentAsset?.scores?.volatility);
    const hasVolatility = Number.isFinite(rawVolatility);
    const volatilityLabel = hasVolatility
      ? (rawVolatility >= 65 ? 'alta' : rawVolatility >= 45 ? 'moderata' : 'contenuta')
      : null;
    const stressDriver = drivers.some((d) => {
      const name = String(d?.name || d || '').toLowerCase();
      const impact = String(d?.impact || '').toLowerCase();
      const isRiskNode = name.includes('vix') || name.includes('regime') || name.includes('volatil') || name.includes('risk');
      const stressImpact = impact.includes('bear') || impact.includes('down') || impact.includes('high') || impact.includes('stress');
      return isRiskNode && stressImpact;
    });
    const vixLevel = Number(vix?.current);
    const regimeLower = String(regime || '').toLowerCase();
    const vixRiskFloor = Number.isFinite(vixLevel)
      ? (vixLevel >= 24 ? 78 : vixLevel >= 20 ? 62 : vixLevel >= 16 ? 46 : 34)
      : 0;
    const regimeRiskFloor = regimeLower === 'risk-off' ? 74 : regimeLower === 'risk-on' ? 42 : 0;
    const riskScore = Math.max(hasVolatility ? rawVolatility : 0, stressDriver ? 72 : 0, vixRiskFloor, regimeRiskFloor);
    const riskLabel = riskScore >= 70 ? 'elevato' : riskScore >= 50 ? 'moderato' : 'contenuto';
    const regimeTone = stressDriver ? 'regime di rischio teso' : 'regime operativo stabile';
    const positioningText = hasPositioning
      ? `Posizionamento istituzionale ${positioningSide} al ${Math.abs(positioningNet)}% netto.`
      : 'Posizionamento istituzionale: dato CFTC non disponibile.';
    const volatilityText = hasVolatility
      ? `Volatilita attesa ${volatilityLabel}; ${regimeTone}.`
      : `Volatilita attesa: dato non disponibile nel feed live; ${regimeTone}.`;
    const discretionarySummary = String(currentAsset?.discretionaryContext?.summary || '').trim();
    const dynamicLine = discretionarySummary || 'Contesto dinamico in aggiornamento.';

    const line1 = `Bias ${directionLabel} al ${currentConfidence}% con rischio ${riskLabel}.`;
    const line2 = `${positioningText}\n${volatilityText}`;
    const line3 = dynamicLine;

    return `${line1}\n${line2}\n${line3}`;
  })();
  const deepInsightNarrative = useMemo(() => {
    const deepAsset = currentAsset || safeAssets.find((a) => a?.symbol === 'NAS100');
    if (!deepAsset) return 'Analisi Deep Insight in aggiornamento.';

    const symbol = deepAsset.symbol || 'NAS100';
    const assetLabelMap = {
      NAS100: 'Nasdaq',
      SP500: 'S&P 500',
      XAUUSD: 'Oro',
      EURUSD: 'EUR/USD',
      BTCUSD: 'Bitcoin'
    };
    const assetLabel = assetLabelMap[symbol] || symbol;

    const normalizeBias = (raw) => {
      const txt = String(raw || '').toUpperCase();
      if (txt.includes('BULL')) return 'BULLISH';
      if (txt.includes('BEAR')) return 'BEARISH';
      if (txt.includes('RISK_ON')) return 'BULLISH';
      if (txt.includes('RISK_OFF')) return 'BEARISH';
      return 'NEUTRAL';
    };
    const biasScore = (bias) => (bias === 'BULLISH' ? 1 : bias === 'BEARISH' ? -1 : 0);
    const biasToText = (bias) => (
      bias === 'BULLISH' ? 'rialzista' : bias === 'BEARISH' ? 'ribassista' : 'neutrale'
    );

    const confidence = Math.round(toFiniteNumber(deepAsset?.confidence, 0));
    const priceText = formatAssetPrice(deepAsset?.price, symbol);
    const vixValue = Number(vix?.current);
    const regimeKey = String(regime || 'neutral').toLowerCase();
    const structuralRisk = Math.max(
      Number.isFinite(vixValue) ? (vixValue >= 24 ? 78 : vixValue >= 20 ? 58 : vixValue >= 16 ? 42 : 30) : 0,
      regimeKey === 'risk-off' ? 72 : regimeKey === 'risk-on' ? 36 : 48
    );
    const riskLabel = structuralRisk >= 70 ? 'elevato' : structuralRisk >= 50 ? 'moderato' : 'contenuto';
    const riskBias = regimeKey === 'risk-off' || (Number.isFinite(vixValue) && vixValue >= 24)
      ? 'BEARISH'
      : (regimeKey === 'risk-on' && Number.isFinite(vixValue) && vixValue <= 16)
        ? 'BULLISH'
        : 'NEUTRAL';

    const screeningBias = deepAsset.direction === 'Up' ? 'BULLISH' : deepAsset.direction === 'Down' ? 'BEARISH' : 'NEUTRAL';
    const optionsNode = optionsData?.[symbol] || null;
    const netM = Number(optionsNode?.net_million);
    const callChange = Number(optionsNode?.call_change);
    const putChange = Number(optionsNode?.put_change);
    const ratioSkew = Number(optionsNode?.ratio_skew);
    const flowShiftToPuts = Number.isFinite(Number(optionsNode?.flow_shift_to_puts))
      ? Number(optionsNode?.flow_shift_to_puts)
      : (Number.isFinite(putChange) && Number.isFinite(callChange) ? putChange - callChange : NaN);

    const optionsBiasFromApi = normalizeBias(optionsNode?.bias);
    let optionsBias = optionsBiasFromApi;
    if (Number.isFinite(flowShiftToPuts)) {
      if (flowShiftToPuts >= 3) optionsBias = 'BEARISH';
      else if (flowShiftToPuts <= -3) optionsBias = 'BULLISH';
      else if (Number.isFinite(ratioSkew) && ratioSkew >= 8) optionsBias = 'BEARISH';
      else if (Number.isFinite(ratioSkew) && ratioSkew <= -8) optionsBias = 'BULLISH';
      else if (optionsBiasFromApi !== 'NEUTRAL') optionsBias = optionsBiasFromApi;
      else if (Number.isFinite(netM) && Math.abs(netM) >= 12) optionsBias = netM > 0 ? 'BULLISH' : 'BEARISH';
      else optionsBias = 'NEUTRAL';
    }

    const gexProfile = Array.isArray(optionsNode?.gex_profile) ? optionsNode.gex_profile : [];
    const gexNet = gexProfile.reduce((acc, row) => acc + toFiniteNumber(row?.net, 0), 0);
    const gexBias = gexNet > 0 ? 'BULLISH' : gexNet < 0 ? 'BEARISH' : 'NEUTRAL';

    const breadthNode = breadthData?.indices?.[symbol] || null;
    const breadthThresholds = resolveBreadthThresholds(breadthData);
    const breadthBiasRaw = deriveBreadthBias(breadthNode, breadthThresholds);
    const breadthBias = breadthBiasRaw === 'UNKNOWN' ? 'NEUTRAL' : breadthBiasRaw;

    const cotNode = cotData?.data?.[symbol] || null;
    const cotBias = normalizeBias(cotNode?.bias);
    const macroNewsBiasRaw = normalizeBias(newsSentiment || 'NEUTRAL');
    const regimeMacroBias = normalizeBias(regime || 'NEUTRAL');
    const macroBlendScore = (biasScore(macroNewsBiasRaw) * 0.7) + (biasScore(regimeMacroBias) * 0.3);
    const macroBias = macroBlendScore >= 0.2 ? 'BULLISH' : macroBlendScore <= -0.2 ? 'BEARISH' : 'NEUTRAL';

    const dailySignals = [screeningBias, optionsBias, gexBias, riskBias];
    const dailyBull = dailySignals.filter((b) => b === 'BULLISH').length;
    const dailyBear = dailySignals.filter((b) => b === 'BEARISH').length;
    const dailyCompositeBias = dailyBull > dailyBear ? 'BULLISH' : dailyBear > dailyBull ? 'BEARISH' : 'NEUTRAL';
    const dailyConvergence = Math.max(dailyBull, dailyBear);
    const convergenceText = dailyConvergence >= 3 ? 'convergenza forte' : dailyConvergence === 2 ? 'convergenza parziale' : 'convergenza debole';

    const generalScore = (biasScore(cotBias) * 0.5) + (biasScore(breadthBias) * 0.3) + (biasScore(macroBias) * 0.2);
    const generalBias = generalScore >= 0.2 ? 'BULLISH' : generalScore <= -0.2 ? 'BEARISH' : 'NEUTRAL';

    let optionsLine = 'Il flusso opzioni non e disponibile in live: la lettura intraday pesa di piu su prezzo, rischio e gamma.';
    if (optionsNode) {
      const nearFlatShift = Number.isFinite(flowShiftToPuts) && Math.abs(flowShiftToPuts) < 0.5;
      const nearFlatChanges = Number.isFinite(callChange) && Number.isFinite(putChange)
        ? (Math.abs(callChange) < 0.5 && Math.abs(putChange) < 0.5)
        : false;
      const is0dte = Boolean(optionsNode?.is_0dte);
      const dteDays = Number(optionsNode?.dte_days);
      const expiryTag = is0dte
        ? ' (focus 0DTE)'
        : (Number.isFinite(dteDays) && dteDays > 0 && dteDays <= 3 ? ` (scadenza ${dteDays}g)` : '');

      let optionsFlowState = 'flussi direzionali in evoluzione';
      if (nearFlatShift && nearFlatChanges) {
        optionsFlowState = 'flussi di sessione stabili';
      } else if (Number.isFinite(flowShiftToPuts) && flowShiftToPuts >= 3) {
        optionsFlowState = 'aumento di coperture lato PUT';
      } else if (Number.isFinite(flowShiftToPuts) && flowShiftToPuts <= -3) {
        optionsFlowState = 'aumento di esposizione lato CALL';
      }

      let participationState = '';
      if (Number.isFinite(ratioSkew) && ratioSkew >= 8) participationState = ' con partecipazione sbilanciata sui PUT';
      else if (Number.isFinite(ratioSkew) && ratioSkew <= -8) participationState = ' con partecipazione sbilanciata sui CALL';

      let premiumState = '';
      if (Number.isFinite(netM) && Math.abs(netM) >= 5) {
        premiumState = netM > 0 ? ' e premio netto ancora in accumulo' : ' e premio netto in scarico/protezione';
      }

      optionsLine = `Il flusso opzioni${expiryTag} e ${biasToText(optionsBias)}: ${optionsFlowState}${participationState}${premiumState}.`;
    }

    let gexLine = 'GEX non disponibile sul feed attuale.';
    if (gexProfile.length > 0) {
      const regimeNote = gexNet >= 0
        ? 'regime di compressione/mean reversion'
        : 'regime di espansione con rischio di accelerazioni';
      if (optionsBias !== 'NEUTRAL' && gexBias !== 'NEUTRAL' && optionsBias !== gexBias) {
        gexLine = `GEX ${biasToText(gexBias)} (${regimeNote}) in divergenza con le opzioni: scenario piu tecnico e meno lineare.`;
      } else {
        gexLine = `GEX ${biasToText(gexBias)} (${regimeNote}) in coerenza con la lettura intraday dominante.`;
      }
    }

    let flowSignalLine = 'Il flusso opzioni e GEX non sono disponibili sul feed attuale.';
    if (optionsNode && gexProfile.length > 0) {
      flowSignalLine = `Il flusso opzioni e ${biasToText(optionsBias)}, GEX ${biasToText(gexBias)}.`;
    } else if (optionsNode) {
      flowSignalLine = `Il flusso opzioni e ${biasToText(optionsBias)}, GEX non disponibile.`;
    } else if (gexProfile.length > 0) {
      flowSignalLine = `Il flusso opzioni non e disponibile, GEX ${biasToText(gexBias)}.`;
    }

    const weekText = weekRule?.description || 'n/d';
    const dayText = dayRule?.note || 'n/d';
    const statsLine = `Contesto statistico: settimana ${weekText.toLowerCase()}, giornata ${dayText.toLowerCase()}; prevale una dinamica di ribilanciamento con possibili falsi breakout prima della direzione piena.`;

    const dateKey = (date) => {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    const isReleasedEvent = (event) => {
      const countdown = String(event?.countdown || '').toLowerCase();
      const actual = String(event?.actual ?? '').trim();
      return countdown.includes('uscito') || (actual && actual !== '-' && actual !== 'null');
    };
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    const todayKey = dateKey(baseDate);
    const normalizedEvents = (Array.isArray(newsEvents) ? newsEvents : [])
      .map((event, idx) => {
        const evDate = inferEventDate(event, baseDate, idx);
        return { ...event, _dateKey: dateKey(evDate) };
      });
    const pendingHighToday = normalizedEvents
      .filter((event) => String(event?.impact || '').toLowerCase() === 'high' && event._dateKey === todayKey && !isReleasedEvent(event));
    const macroWindowCountdown = String(nextEvent?.countdown || '').trim().toLowerCase();
    const macroHourMatch = macroWindowCountdown.match(/(\d+)\s*h/);
    const macroMinuteMatch = macroWindowCountdown.match(/(\d+)\s*m/);
    const nearMacroWindow = Boolean(macroMinuteMatch) || (macroHourMatch && Number(macroHourMatch[1]) <= 3);
    const macroRiskWindow = pendingHighToday.length > 0 || nearMacroWindow;

    let newsLine = 'Agenda macro senza trigger immediati ad alto impatto.';
    if (pendingHighToday.length > 0) {
      const topEvents = pendingHighToday.slice(0, 2).map((event) => String(event?.title || 'evento macro')).join(', ');
      newsLine = `Agenda macro sensibile (${topEvents}): possibile aumento di volatilita e riclassificazione rapida della bias intraday.`;
    } else if (nextEvent?.event) {
      const nextCountdown = String(nextEvent?.countdown || '').trim();
      const hourMatch = nextCountdown.toLowerCase().match(/(\d+)\s*h/);
      const minMatch = nextCountdown.toLowerCase().match(/(\d+)\s*m/);
      const isNear = Boolean(minMatch) || (hourMatch && Number(hourMatch[1]) <= 3);
      newsLine = isNear
        ? `Prossimo evento macro vicino (${nextEvent.event}): possibile volatilita tattica nel breve.`
        : `Prossimo evento macro monitorato: ${nextEvent.event}.`;
    }

    let correlationLine = '';
    if (symbol === 'NAS100') {
      const goldAsset = safeAssets.find((asset) => asset?.symbol === 'XAUUSD');
      if (goldAsset) {
        const sameDirection = goldAsset.direction && deepAsset.direction && goldAsset.direction === deepAsset.direction;
        correlationLine = sameDirection
          ? 'La correlazione Oro/Nasdaq (84%) conferma lo scenario corrente.'
          : 'La correlazione Oro/Nasdaq (84%) e in divergenza, quindi serve conferma prezzo/flussi.';
      }
    }

    let macroWeeklyLabel = biasToText(macroBias);
    if (macroRiskWindow && macroBias === 'NEUTRAL') {
      macroWeeklyLabel = 'finestra macro sensibile';
    } else if (macroRiskWindow) {
      macroWeeklyLabel = `${biasToText(macroBias)} con finestra macro sensibile`;
    }
    const cotBiasLabel = cotBias === 'BULLISH' ? 'long' : cotBias === 'BEARISH' ? 'short' : 'neutrale';
    const cotLine = `COT bias settimanale ${cotBiasLabel}.`;
    const weeklyStatsLine = `Statistica weekly COT/Breadth/Macro-News: COT ${biasToText(cotBias)}, breadth ${biasToText(breadthBias)}, macro-news ${macroWeeklyLabel}.`;

    return `${assetLabel}: bias intraday ${biasToText(dailyCompositeBias)} al ${confidence}%.
Rischio ${riskLabel}. Bias settimanale ${biasToText(generalBias)}.

${flowSignalLine}
${cotLine}
Driver intraday essenziali: ${optionsLine} ${gexLine} Quadro attuale a ${convergenceText} tra i driver di giornata.

${weeklyStatsLine}
${statsLine}
${correlationLine ? `${correlationLine}\n` : ''}${newsLine}`;
  }, [safeAssets, currentAsset, cotData, breadthData, optionsData, newsEvents, newsSentiment, nextEvent, vix?.current, regime, weekRule?.description, dayRule?.note]);

  const screeningFocusNarrative = useMemo(() => {
    const source = String(deepInsightNarrative || '')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!source) return screeningFocusFallbackNarrative;

    const candidates = source
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^statistica weekly/i.test(line))
      .filter((line) => !/^contesto statistico:/i.test(line))
      .filter((line) => !/^agenda macro/i.test(line));

    const selectedLines = [];
    const leadLine = candidates[0];
    const riskLine = candidates.find((line) => /^rischio/i.test(line));
    const cotLine = candidates.find((line) => /^cot bias settimanale/i.test(line));
    const weeklyLine = candidates.find((line) => /^bias settimanale/i.test(line));
    const flowLine = candidates.find((line) => /flusso opzioni|gex/i.test(line));

    if (leadLine) selectedLines.push(leadLine);
    if (riskLine && !selectedLines.includes(riskLine)) selectedLines.push(riskLine);
    if (flowLine && !selectedLines.includes(flowLine)) selectedLines.push(flowLine);
    if (cotLine && !selectedLines.includes(cotLine)) selectedLines.push(cotLine);
    if (weeklyLine && !selectedLines.includes(weeklyLine)) selectedLines.push(weeklyLine);

    for (const line of candidates) {
      if (selectedLines.length >= 4) break;
      if (!selectedLines.includes(line)) selectedLines.push(line);
    }

    const compactLines = selectedLines.slice(0, 4).map((line) => (
      line.length > 220 ? `${line.slice(0, 217).trimEnd()}...` : line
    ));

    if (!compactLines.length) return screeningFocusFallbackNarrative;
    return compactLines.join('\n');
  }, [deepInsightNarrative, screeningFocusFallbackNarrative]);

  const quickMetrics = useMemo(() => {
    const weekText = String(weekRule?.description || 'Poco direzionale').toLowerCase();
    const dayText = String(dayRule?.note || 'Espansione in ribilanciamento').toLowerCase();
    const context = `Settimana ${weekText}; ${dayText}. Possibili falsi breakout prima della direzione piena.`;

    return { context };
  }, [weekRule?.description, dayRule?.note]);

  const chartColors = ['#00D9A5', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

  const handleFocusAsset = (symbol) => {
    setSelectedAsset(symbol);
    setViewMode('focus');
  };

  const scheduleChartAutoReset = useCallback(() => {
    if (tvResetTimerRef.current) clearTimeout(tvResetTimerRef.current);
    tvResetTimerRef.current = setTimeout(() => {
      setTvResetNonce((prev) => prev + 1);
    }, 5 * 60 * 1000);
  }, []);

  if (!currentAsset) {
    return (
      <TechCard className={cn(
        "dashboard-panel-glass-boost font-apple glass-edge panel-left-edge fine-gray-border p-4 pb-[20px] relative w-full transition-all duration-300 min-h-[616px]",
        className
      )}>
        <div className="h-full min-h-[560px] rounded-2xl border border-white/10 bg-[#0B0F17]/80 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Activity className="w-6 h-6 text-[#00D9A5] animate-pulse mx-auto" />
            <p className="text-sm text-white/60">Screening in aggiornamento...</p>
          </div>
        </div>
      </TechCard>
    );
  }

  return (
    <TechCard className={cn(
      "dashboard-panel-glass-boost font-apple glass-edge panel-left-edge fine-gray-border p-4 pb-[20px] relative w-full transition-all duration-300 min-h-[616px]",
      className
    )}>
      {/* Info Tooltip - Genie Effect */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
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
        <div className="flex items-center justify-between mb-5 relative">
          <div className="relative flex items-center gap-2">
            <div className="flex items-center gap-2.5 select-none">
              <BarChart3 className="w-5 h-5 text-[#00D9A5]" />
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-white/95 tracking-tight font-apple">
                    Screening
                  </span>
                  {/* Info Button */}
                  <button
                    onClick={() => setShowInfo(!showInfo)}
                    className="p-1 rounded-lg bg-black/10 dark:bg-white/[0.14] border border-black/10 dark:border-white/[0.28] backdrop-blur-[18px] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-black/20 dark:hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
                  >
                    <Info className="w-3 h-3 text-slate-800 dark:text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <div className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl shadow-sm flex items-center justify-center mt-[-2px]">
              <span className="font-apple text-[14px] sm:text-[15px] font-semibold text-white/95 tracking-[0.06em] uppercase leading-none">
                {currentAsset?.symbol}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-3">
              {/* Bias Outlook Badge */}
              {viewMode === 'focus' && currentAsset && (
                <div className="text-right">
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
                  <Eye className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {showSelector && (
                    <motion.div
                      initial={dashboardInitial({ opacity: 0, y: -10, scale: 0.95 })}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute right-0 top-full z-50 p-3 bg-white/95 border border-slate-200/50 rounded-xl shadow-2xl min-w-[220px] backdrop-blur-xl dark:bg-[#0B0F17]/95 dark:border-white/10"
                    >
                      {/* Asset Selection Section */}
                      <div className="mb-2 px-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest dark:text-white/30">Seleziona Asset</span>
                      </div>
                      <div className="space-y-1 mb-4">
                        {safeAssets.map((a) => (
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
                            "w-8 h-4 rounded-full relative transition-colors duration-300",
                            syncEnabled ? "bg-[#00D9A5]" : "bg-slate-200 dark:bg-white/10"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 shadow-sm",
                              syncEnabled ? "translate-x-4" : "translate-x-0"
                            )} />
                          </div>
                        </button>
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
              initial={dashboardInitial({ opacity: 0, scale: 0.98 })}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="min-h-[364px] lg:min-h-[403px]"
            >
              {/* MOBILE: single zoomed chart with navigation */}
              {isMobile ? (
                <div className="relative">
                  {/* Navigation arrows */}
                  {safeAssets.length > 1 && (
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setMobileChartIndex((prev) => (prev - 1 + safeAssets.length) % safeAssets.length)}
                        className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1.5">
                        {safeAssets.map((_, i) => (
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
                        onClick={() => setMobileChartIndex((prev) => (prev + 1) % safeAssets.length)}
                        className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {/* Single chart card — zoomed */}
                  {(() => {
                    if (safeAssets.length === 0) return null;
                    const safeIndex = ((mobileChartIndex % safeAssets.length) + safeAssets.length) % safeAssets.length;
                    const asset = safeAssets[safeIndex];
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
                            <TradingViewMiniChart assetSymbol={asset.symbol} title={`tv-mobile-${asset.symbol}`} />
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
                            <TradingViewMiniChart assetSymbol={asset.symbol} title={`tv-grid-${asset.symbol}`} />
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
              initial={dashboardInitial({ opacity: 0, y: 10 })}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="animate-in fade-in slide-in-from-bottom-2 duration-[800ms] min-h-[364px] lg:min-h-[403px]"
            >
              <div className="relative">
                <div className={cn(
                  "space-y-3 transition-all duration-200",
                  showDeepInsight && "blur-[6px] opacity-25 pointer-events-none select-none"
                )}>
                  <div
                    className="relative w-full aspect-[16/7.5] rounded-2xl overflow-hidden border-x border-y border-x-white/10 border-y-white/5 bg-[#0B0F17]"
                    onMouseEnter={scheduleChartAutoReset}
                    onMouseDown={scheduleChartAutoReset}
                    onWheel={scheduleChartAutoReset}
                    onTouchStart={scheduleChartAutoReset}
                  >

                    {animationsReady ? (
                      <TradingViewMiniChart
                        assetSymbol={currentAsset.symbol}
                        title={`tv-focus-${currentAsset.symbol}`}
                        interval="15"
                        interactive={false}
                        resetNonce={tvResetNonce}
                      />
                    ) : (
                      <div className="w-full h-full rounded-lg bg-white/5 animate-pulse" />
                    )}
                  </div>

                  <div className="relative rounded-2xl border border-white/10 bg-[#13171C]/85 px-4 py-3 font-apple shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
                    <div className="pointer-events-none absolute left-0 top-[2px] bottom-[2px] w-[2px] bg-[#D1D5DB] rounded-tl-[16px] rounded-bl-[16px] rounded-tr-[2px] rounded-br-[2px]" />
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
                      <p className="text-[16px] font-medium text-white/95 leading-relaxed tracking-[0.01em] whitespace-pre-line">
                        <TypewriterText text={screeningFocusNarrative} speed={18} delay={400} />
                      </p>
                      <div className="min-w-0 lg:w-[244px] lg:max-w-[244px] justify-self-end font-apple">
                        <p className="text-[16px] leading-none font-semibold tracking-[0.01em] text-white/92 mb-2">
                          Contesto
                        </p>
                        <p className="text-[15px] leading-[1.45] font-normal antialiased whitespace-normal break-words text-[#00D9A5]">
                          {quickMetrics.context}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeepInsight((prev) => !prev)}
                      className="relative z-10 mt-3 w-full inline-flex items-center justify-between h-8 px-3 rounded-[8px] border border-[#00D9A5]/45 bg-[#0E221F]/75 text-[#7EF8DB] text-[12px] font-semibold uppercase tracking-[0.12em] shadow-[0_0_14px_rgba(0,217,165,0.18)] hover:bg-[#12312C]/80 transition-colors"
                    >
                      <span>Deep Insight - Analisi Tecnica</span>
                      {showDeepInsight ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {showDeepInsight && (
                    <motion.div
                      initial={dashboardInitial({ opacity: 0, y: 6 })}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute inset-0 z-30 rounded-2xl bg-[#05080D]/72 backdrop-blur-[8px] p-3"
                    >
                      <div className="h-full rounded-xl border border-[#00D9A5]/22 bg-[#0F1118]/98 px-4 py-3 overflow-y-auto no-scrollbar font-apple text-[17px]">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[17px] font-semibold tracking-[0.01em] text-[#7EF8DB]">Deep Insight - Analisi Tecnica</p>
                          <button
                            type="button"
                            onClick={() => setShowDeepInsight(false)}
                            className="text-[17px] font-medium text-white/80 hover:text-white transition-colors"
                          >
                            Chiudi
                          </button>
                        </div>
                        <p className="text-[17px] font-medium text-white/92 leading-relaxed whitespace-pre-line tracking-[0.01em]">
                          {deepInsightNarrative}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TechCard >
  );
};

const MarketBreadthPanel = ({ breadthData, vix, className = '' }) => {
  const MA50_COLOR = '#00D9A5';
  const MA200_COLOR = '#E3C98A';
  const APPLE_FONT_STACK = '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const [selectedIndex, setSelectedIndex] = useState('NAS100');
  const [showSelector, setShowSelector] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showRiskBack, setShowRiskBack] = useState(false);
  const breadthIndices = useMemo(() => breadthData?.indices || {}, [breadthData]);
  const breadthTimestampIso = breadthData?.timestamp || null;

  const rotateToNextFace = useCallback(() => {
    setShowInfo(false);
    setShowSelector(false);
    setShowRiskBack((prev) => !prev);
  }, []);

  const handleFaceClick = useCallback((event) => {
    const target = event?.target;
    if (target && typeof target.closest === 'function' && target.closest('button,a,input,select,textarea,[role="button"]')) {
      return;
    }
    rotateToNextFace();
  }, [rotateToNextFace]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      rotateToNextFace();
    }, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [rotateToNextFace]);

  const formatBreadthPct = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? `${num.toFixed(1)}%` : '—';
  };

  const formatPrice = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    if (num >= 1000) return num.toLocaleString('it-IT', { maximumFractionDigits: 0 });
    return num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getBreadthTone = (indexData) => {
    if (!indexData) {
      return {
        label: 'Dati non disponibili',
        className: 'text-yellow-300 border-yellow-300/20 bg-yellow-500/10'
      };
    }
    if (indexData.breadth_regime === 'broad-bullish') {
      return {
        label: 'Ampio supporto',
        className: 'text-[#00D9A5] border-[#00D9A5]/20 bg-[#00D9A5]/10'
      };
    }
    if (indexData.breadth_regime === 'broad-weakness') {
      return {
        label: 'Rialzo fragile',
        className: 'text-red-300 border-red-300/20 bg-red-500/10'
      };
    }
    return {
      label: 'Partecipazione mista',
      className: 'text-yellow-300 border-yellow-300/20 bg-yellow-500/10'
    };
  };

  const indexConfigs = useMemo(() => ({
    NAS100: { label: 'NASDAQ 100', short: 'NAS', priceColor: '#67D8FF' },
    SP500: { label: 'S&P 500', short: 'SPX', priceColor: '#67D8FF' },
    XAUUSD: { label: 'Gold Spot', short: 'XAU', priceColor: '#67D8FF' },
    EURUSD: { label: 'Euro / Dollar', short: 'EURUSD', priceColor: '#67D8FF' }
  }), []);
  const selectorIndexKeys = useMemo(() => MARKET_BREADTH_CONFIG.selectorKeys, []);

  const selectedData = breadthIndices[selectedIndex] || null;
  const selectedDataResolved = useMemo(() => {
    if (!selectedData) return null;
    return {
      ...selectedData,
      history: Array.isArray(selectedData.history) ? selectedData.history : []
    };
  }, [selectedData]);
  const selectedTone = getBreadthTone(selectedDataResolved);
  const selectedCfg = indexConfigs[selectedIndex] || indexConfigs.NAS100;
  const usePriceMALines = selectedIndex === 'XAUUSD' || selectedIndex === 'EURUSD';
  const breadthRiskIndexData = breadthIndices.SP500 || selectedDataResolved || null;
  const breadthRiskSnapshot = useMemo(
    () => buildBreadthRiskSnapshot(breadthRiskIndexData, vix?.current),
    [breadthRiskIndexData, vix?.current]
  );
  const breadthRiskMa50Label = Number.isFinite(breadthRiskSnapshot.ma50Value)
    ? `${breadthRiskSnapshot.ma50Value.toFixed(1)}%`
    : 'N/A';
  const breadthRiskMa200Label = Number.isFinite(breadthRiskSnapshot.ma200Value)
    ? `${breadthRiskSnapshot.ma200Value.toFixed(1)}%`
    : 'N/A';
  const breadthRiskMa50Pct = Number.isFinite(breadthRiskSnapshot.ma50Value)
    ? Math.max(0, Math.min(100, breadthRiskSnapshot.ma50Value))
    : 0;
  const breadthRiskMa200Pct = Number.isFinite(breadthRiskSnapshot.ma200Value)
    ? Math.max(0, Math.min(100, breadthRiskSnapshot.ma200Value))
    : 0;
  const breadthRiskAsOf = String(breadthRiskIndexData?.as_of_date || '').trim();

  const chartData = useMemo(() => {
    const history = Array.isArray(selectedDataResolved?.history) ? selectedDataResolved.history : [];
    if (history.length > 0) {
      const normalized = history
        .map((point) => {
          const dateRaw = String(point?.date || '');
          const hasIntradayTime = dateRaw.length >= 16 && dateRaw.includes(':');
          const dateLabel = dateRaw.length >= 10
            ? (hasIntradayTime
              ? `${dateRaw.slice(8, 10)}/${dateRaw.slice(5, 7)} ${dateRaw.slice(11, 13)}h`
              : `${dateRaw.slice(8, 10)}/${dateRaw.slice(5, 7)}`)
            : dateRaw;
          return {
            date: dateRaw,
            dateLabel,
            price: Number(point?.price),
            ma50: Number(point?.above_ma50_pct),
            ma200: Number(point?.above_ma200_pct),
            ma50Price: Number(point?.ma50_value),
            ma200Price: Number(point?.ma200_value),
            coverage: Number(point?.coverage_pct),
            processed: Number(point?.processed)
          };
        })
        .filter((row) => {
          if (usePriceMALines) {
            return Number.isFinite(row.price) && Number.isFinite(row.ma50Price) && Number.isFinite(row.ma200Price);
          }
          return Number.isFinite(row.ma50) && Number.isFinite(row.ma200);
        });
      if (normalized.length > 0) return normalized;
    }

    const fallbackDate = breadthTimestampIso ? breadthTimestampIso.slice(0, 10) : '';
    const fallbackPrice = Number(selectedDataResolved?.latest_price);
    const fallbackMa50 = Number(selectedDataResolved?.above_ma50?.pct);
    const fallbackMa200 = Number(selectedDataResolved?.above_ma200?.pct);
    const fallbackMa50Price = Number(selectedDataResolved?.latest_ma50);
    const fallbackMa200Price = Number(selectedDataResolved?.latest_ma200);
    const fallbackCoverage = Number(selectedDataResolved?.coverage_pct);
    const fallbackProcessed = Number(selectedDataResolved?.processed);

    const hasAny = [
      fallbackPrice, fallbackMa50, fallbackMa200, fallbackMa50Price, fallbackMa200Price
    ].some((v) => Number.isFinite(v));
    if (!hasAny) return [];

    return [{
      date: fallbackDate,
      dateLabel: fallbackDate ? `${fallbackDate.slice(8, 10)}/${fallbackDate.slice(5, 7)}` : 'NOW',
      price: Number.isFinite(fallbackPrice) ? fallbackPrice : null,
      ma50: Number.isFinite(fallbackMa50) ? fallbackMa50 : null,
      ma200: Number.isFinite(fallbackMa200) ? fallbackMa200 : null,
      ma50Price: Number.isFinite(fallbackMa50Price) ? fallbackMa50Price : null,
      ma200Price: Number.isFinite(fallbackMa200Price) ? fallbackMa200Price : null,
      coverage: Number.isFinite(fallbackCoverage) ? fallbackCoverage : null,
      processed: Number.isFinite(fallbackProcessed) ? fallbackProcessed : null
    }];
  }, [breadthTimestampIso, selectedDataResolved, usePriceMALines]);

  const hasPriceSeries = chartData.some((row) => Number.isFinite(row.price));
  const firstPoint = chartData[0] || null;
  const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const priceDeltaPct = (Number.isFinite(firstPoint?.price) && Number.isFinite(latestPoint?.price) && firstPoint.price > 0)
    ? ((latestPoint.price - firstPoint.price) / firstPoint.price) * 100
    : null;
  const breadthSpread = usePriceMALines
    ? (Number.isFinite(latestPoint?.ma50Price) && Number.isFinite(latestPoint?.ma200Price)
      ? latestPoint.ma50Price - latestPoint.ma200Price
      : null)
    : (Number.isFinite(latestPoint?.ma50) && Number.isFinite(latestPoint?.ma200)
      ? latestPoint.ma50 - latestPoint.ma200
      : null);
  const coverageNow = Number.isFinite(latestPoint?.coverage)
    ? latestPoint.coverage
    : Number(selectedDataResolved?.coverage_pct);
  const processedNow = Number.isFinite(latestPoint?.processed)
    ? latestPoint.processed
    : Number(selectedDataResolved?.processed);
  const totalNow = Number(selectedDataResolved?.total_components);
  const latestPriceValue = Number.isFinite(latestPoint?.price) ? Number(latestPoint.price) : null;
  const ma50BadgeValue = usePriceMALines
    ? formatPrice(latestPoint?.ma50Price)
    : formatBreadthPct(latestPoint?.ma50);
  const ma200BadgeValue = usePriceMALines
    ? formatPrice(latestPoint?.ma200Price)
    : formatBreadthPct(latestPoint?.ma200);

  const summaryLine = (() => {
    if (!latestPoint) return 'Storico in aggiornamento.';
    if (usePriceMALines) {
      if (!Number.isFinite(latestPoint?.price) || !Number.isFinite(latestPoint?.ma50Price) || !Number.isFinite(latestPoint?.ma200Price)) {
        return 'Serie medie in caricamento.';
      }
      if (latestPoint.price > latestPoint.ma50Price && latestPoint.ma50Price > latestPoint.ma200Price) {
        return 'Prezzo sopra MA50 e MA200: struttura di trend solida.';
      }
      if (latestPoint.price < latestPoint.ma50Price && latestPoint.ma50Price < latestPoint.ma200Price) {
        return 'Prezzo sotto MA50 e MA200: struttura debole.';
      }
      return 'Prezzo in transizione rispetto alle medie principali.';
    }
    if (!Number.isFinite(priceDeltaPct) || !Number.isFinite(breadthSpread)) {
      return 'Lettura breadth disponibile, linea prezzo in attesa dati.';
    }
    if (priceDeltaPct > 0 && breadthSpread < 6) {
      return 'Prezzo in salita ma breadth corto: partecipazione non ampia.';
    }
    if (priceDeltaPct < 0 && breadthSpread > 10) {
      return 'Prezzo debole con breadth in tenuta: possibile accumulo sotto traccia.';
    }
    return 'Prezzo e breadth allineati: struttura interna coerente.';
  })();

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-white/15 bg-[#0F1319]/95 px-3 py-2 shadow-xl">
        <p className="text-[10px] uppercase tracking-[0.15em] text-white/50 font-bold">{label || row?.date || '-'}</p>
        <p className="text-xs text-white/90 mt-1">
          Prezzo: <span className="font-bold" style={{ color: selectedCfg.priceColor }}>{formatPrice(row?.price)}</span>
        </p>
        {usePriceMALines ? (
          <>
            <p className="text-xs text-white/90">
              MA50: <span className="font-bold" style={{ color: MA50_COLOR }}>{formatPrice(row?.ma50Price)}</span>
            </p>
            <p className="text-xs text-white/90">
              MA200: <span className="font-bold" style={{ color: MA200_COLOR }}>{formatPrice(row?.ma200Price)}</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-white/90">
              % &gt; MA50: <span className="font-bold" style={{ color: MA50_COLOR }}>{formatBreadthPct(row?.ma50)}</span>
            </p>
            <p className="text-xs text-white/90">
              % &gt; MA200: <span className="font-bold" style={{ color: MA200_COLOR }}>{formatBreadthPct(row?.ma200)}</span>
            </p>
          </>
        )}
      </div>
    );
  };

  return (
    <TechCard className={cn(
      "dashboard-panel-glass-boost font-apple glass-edge panel-left-edge fine-gray-border p-4 relative w-full transition-all duration-300 min-h-[616px] [perspective:1600px]",
      className
    )}>
      <AnimatePresence mode="wait" initial={false}>
        {!showRiskBack ? (
          <motion.div
            key="breadth-front"
            initial={dashboardInitial({ opacity: 0, rotateY: -85, scale: 0.985 })}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 85, scale: 0.985 }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
            className="relative min-h-[584px]"
            onClick={handleFaceClick}
          >
            <AnimatePresence>
              {showInfo && (
                <motion.div
                  initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
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
                      <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida Market Breadth</h4>
                      <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                        <X className="w-5 h-5 text-white/50" />
                      </button>
                    </div>
                    <div className="space-y-5 text-left">
                      <p className="text-lg text-white leading-relaxed font-normal">
                        Il <span className="text-[#00D9A5] font-semibold">Market Breadth</span> misura la partecipazione interna del mercato:
                        quante azioni sono sopra MA50 e MA200 mentre l'indice si muove.
                      </p>
                      <ul className="space-y-4 text-left">
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-[#67D8FF] shadow-[0_0_8px_#67D8FF] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold text-[#67D8FF]">Linea prezzo</span>: andamento dell'asset selezionato (NAS, SPX, XAU, EURUSD).
                          </p>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold text-[#00D9A5]">% sopra MA50</span>: ampiezza di breve/medio periodo.
                          </p>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-[#E3C98A] shadow-[0_0_8px_#E3C98A] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold text-[#E3C98A]">% sopra MA200</span>: solidita strutturale del trend.
                          </p>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="mt-2.5 w-2 h-2 rounded-full bg-white/70 shadow-[0_0_8px_rgba(255,255,255,0.4)] flex-shrink-0" />
                          <p className="text-lg text-white leading-relaxed font-normal">
                            <span className="font-semibold text-white">Delta Prezzo</span>: variazione percentuale tra primo e ultimo punto della serie visibile.
                          </p>
                        </li>
                      </ul>
                    </div>
                  </div>
                </motion.div >
              )}
            </AnimatePresence>

            <div className={cn(
              "transition-all duration-200",
              showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-start gap-2.5">
                  <Layers className="w-5 h-5 text-[#00D9A5] mt-[1px]" />
                  <div>
                    <div className="inline-flex items-center gap-2">
                      <h4 className="font-medium text-base text-white/90 leading-none">Market Breadth</h4>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowInfo((prev) => !prev);
                        }}
                        className="p-1 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
                        aria-label="Informazioni Market Breadth"
                        title="Informazioni Market Breadth"
                        aria-expanded={showInfo}
                      >
                        <Info className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.15em]", selectedTone.className)}>
                    {selectedTone.label}
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowSelector((prev) => !prev);
                      }}
                      className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                      aria-label="Seleziona asset market breadth"
                      aria-expanded={showSelector}
                    >
                      <Eye className="w-4 h-4 text-white" />
                    </button>
                    <AnimatePresence>
                      {showSelector && (
                        <motion.div
                          initial={dashboardInitial({ opacity: 0, y: -6, scale: 0.96 })}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.16 }}
                          className="absolute right-0 top-full mt-1 z-40 min-w-[124px] rounded-xl border border-white/15 bg-[#0F1319]/95 p-1.5 shadow-2xl"
                        >
                          {selectorIndexKeys.map((key) => {
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setSelectedIndex(key);
                                  setShowSelector(false);
                                }}
                                className={cn(
                                  "w-full text-left px-2 py-1.5 rounded-md text-[10px] font-black uppercase tracking-[0.13em] transition-colors",
                                  selectedIndex === key
                                    ? "bg-[#00D9A5]/20 text-[#00D9A5]"
                                    : "text-white/75 hover:bg-white/10 hover:text-white"
                                )}
                              >
                                {indexConfigs[key].short}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      rotateToNextFace();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#8A70FF]/55 bg-[#211836]/70 text-[#DCCFFF] text-[10px] font-black uppercase tracking-[0.12em] hover:bg-[#2A2142]/80 transition-all"
                    title="Apri Market Breadth Risk"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Risk
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span
                    className="-translate-y-[4px] text-[20px] md:text-[21px] font-semibold uppercase tracking-[-0.015em] leading-none text-white/90"
                    style={{ fontFamily: '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
                  >
                    {selectedIndex}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-md border border-[#00D9A5]/50 bg-[#00D9A5]/10 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.07em] text-[#00D9A5]">
                      MA50
                      <span className="font-extrabold tracking-normal normal-case text-[13px] leading-none">{ma50BadgeValue}</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md border border-[#67D8FF]/50 bg-[#67D8FF]/12 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.07em] text-[#67D8FF]">
                      Prezzo
                      <span className="font-extrabold tracking-normal normal-case text-[13px] leading-none">{formatPrice(latestPoint?.price)}</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-md border border-[#E3C98A]/50 bg-[#E3C98A]/10 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.07em] text-[#E3C98A]">
                      MA200
                      <span className="font-extrabold tracking-normal normal-case text-[13px] leading-none">{ma200BadgeValue}</span>
                    </span>
                  </div>
                </div>
                <div className="relative h-[274px] w-full rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.015)_100%)] p-2 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 2, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                      <XAxis
                        dataKey="dateLabel"
                        tick={{ fill: 'rgba(255,255,255,0.52)', fontSize: 11, fontWeight: 700, fontFamily: '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={22}
                      />
                      <YAxis
                        yAxisId="price"
                        orientation="left"
                        hide={!hasPriceSeries}
                        width={56}
                        tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 10, fontWeight: 700, fontFamily: '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
                        axisLine={false}
                        tickLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => formatPrice(value)}
                      />
                      <YAxis
                        yAxisId="breadth"
                        orientation="right"
                        width={46}
                        hide={usePriceMALines}
                        domain={[0, 100]}
                        tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 10, fontWeight: 700, fontFamily: '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `${Math.round(value)}%`}
                      />
                      {!usePriceMALines && (
                        <ReferenceLine yAxisId="breadth" y={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="5 5" />
                      )}
                      {hasPriceSeries && Number.isFinite(latestPriceValue) && (
                        <ReferenceLine
                          yAxisId="price"
                          y={latestPriceValue}
                          ifOverflow="extendDomain"
                          stroke="rgba(103, 216, 255, 0.25)"
                          strokeDasharray="3 4"
                        />
                      )}
                      <Tooltip content={renderTooltip} />
                      <Line
                        yAxisId="price"
                        dataKey="price"
                        type="monotone"
                        stroke={selectedCfg.priceColor}
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: selectedCfg.priceColor, fill: '#0F1319' }}
                      />
                      <Line
                        yAxisId={usePriceMALines ? "price" : "breadth"}
                        dataKey={usePriceMALines ? "ma50Price" : "ma50"}
                        type="monotone"
                        stroke={MA50_COLOR}
                        strokeWidth={2.1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                        activeDot={{ r: 3.5, strokeWidth: 1.8, stroke: MA50_COLOR, fill: '#0F1319' }}
                      />
                      <Line
                        yAxisId={usePriceMALines ? "price" : "breadth"}
                        dataKey={usePriceMALines ? "ma200Price" : "ma200"}
                        type="monotone"
                        stroke={MA200_COLOR}
                        strokeWidth={2.1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                        activeDot={{ r: 3.5, strokeWidth: 1.8, stroke: MA200_COLOR, fill: '#0F1319' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div
                  className="grid grid-cols-3 gap-2 mt-3"
                  style={{ fontFamily: '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
                >
                  <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate pr-1 text-[14px] md:text-[15px] tracking-[-0.01em] text-white/75 font-semibold">Copertura</p>
                      <p className="whitespace-nowrap text-right text-[clamp(13px,1.6vw,18px)] font-semibold tracking-[-0.03em] text-white leading-none tabular-nums">
                        {Number.isFinite(coverageNow) ? `${coverageNow.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate pr-1 text-[14px] md:text-[15px] tracking-[-0.01em] text-white/75 font-semibold">Spread</p>
                      <p className={cn(
                        "whitespace-nowrap text-right text-[clamp(13px,1.6vw,18px)] font-semibold tracking-[-0.03em] leading-none tabular-nums",
                        Number.isFinite(breadthSpread)
                          ? breadthSpread >= 0 ? "text-[#00D9A5]" : "text-red-300"
                          : "text-white"
                      )}>
                        {Number.isFinite(breadthSpread) ? `${breadthSpread > 0 ? '+' : ''}${breadthSpread.toFixed(1)} pp` : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="truncate pr-1 text-[14px] md:text-[15px] tracking-[-0.01em] text-white/75 font-semibold">Delta</p>
                      <p className={cn(
                        "whitespace-nowrap text-right text-[clamp(13px,1.6vw,18px)] font-semibold tracking-[-0.03em] leading-none tabular-nums",
                        Number.isFinite(priceDeltaPct)
                          ? priceDeltaPct >= 0 ? "" : "text-red-300"
                          : "text-white"
                      )} style={Number.isFinite(priceDeltaPct) && priceDeltaPct >= 0 ? { color: selectedCfg.priceColor } : undefined}>
                        {Number.isFinite(priceDeltaPct) ? `${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 min-h-[146px] rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col justify-between">
                  <ul className="space-y-1.5 text-base text-white/90">
                    <li className="flex items-start gap-2">
                      <span className="text-[#00D9A5] mt-0.5">•</span>
                      <span>{summaryLine}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#00D9A5] mt-0.5">•</span>
                      <span>Copertura: {Number.isFinite(coverageNow) ? `${coverageNow.toFixed(1)}%` : '—'}.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#00D9A5] mt-0.5">•</span>
                      <span>
                        Spread: {Number.isFinite(breadthSpread)
                          ? `${breadthSpread > 0 ? '+' : ''}${breadthSpread.toFixed(1)}${usePriceMALines ? '' : ' pp'}`
                          : '—'}.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="breadth-risk"
            initial={dashboardInitial({ opacity: 0, rotateY: 85, scale: 0.985 })}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: -85, scale: 0.985 }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity', fontFamily: APPLE_FONT_STACK }}
            className="min-h-[584px] flex flex-col font-apple"
            onClick={handleFaceClick}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-start gap-2.5">
                <Shield className="w-5 h-5 text-[#8A70FF] mt-[1px]" />
                <div>
                  <h4 className="font-semibold text-[18px] tracking-[-0.015em] text-white/92 leading-none">Market Breadth Risk</h4>
                  <p className="text-[12px] tracking-[0.02em] text-white/60 mt-1">Auto-rotate 60s loop</p>
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  rotateToNextFace();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#8A70FF]/55 bg-[#211836]/70 text-[#DCCFFF] text-[12px] font-semibold tracking-[0.01em] hover:bg-[#2A2142]/80 transition-all"
                title="Torna a Market Breadth"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Breadth
              </button>
            </div>

            <div className="rounded-xl border border-white/12 bg-[linear-gradient(180deg,rgba(6,10,14,0.96)_0%,rgba(4,7,10,0.92)_100%)] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[17px] tracking-[-0.015em] text-white/78 font-semibold">Composite Risk Level</p>
                  <p className="text-[17px] tracking-[-0.01em] text-white/86 mt-0.5">VIX + partecipazione sopra MA50/MA200 (SP500)</p>
                </div>
                <div className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5",
                  breadthRiskSnapshot.levelStyle.className
                )}>
                  <span className="text-[13px] font-semibold tracking-[0.04em]">{breadthRiskSnapshot.levelStyle.tone}</span>
                  <span className="text-[16px] font-extrabold">{breadthRiskSnapshot.totalScore}/5</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-md border border-[#8A70FF]/55 bg-[#8A70FF]/12 px-3 py-1.5 text-[14px] font-semibold tracking-[0.01em] text-[#C7B4FF]">
                  Punti VIX
                  <span className="font-extrabold tracking-normal normal-case text-[15px] leading-none">{breadthRiskSnapshot.vixScore}/2</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-md border border-[#00D9A5]/50 bg-[#00D9A5]/10 px-3 py-1.5 text-[14px] font-semibold tracking-[0.01em] text-[#00D9A5]">
                  Punti MA50
                  <span className="font-extrabold tracking-normal normal-case text-[15px] leading-none">{breadthRiskSnapshot.ma50Score}/2</span>
                </span>
                <span className="inline-flex items-center gap-2 rounded-md border border-[#E3C98A]/50 bg-[#E3C98A]/10 px-3 py-1.5 text-[14px] font-semibold tracking-[0.01em] text-[#E3C98A]">
                  Bonus MA200
                  <span className="font-extrabold tracking-normal normal-case text-[15px] leading-none">{breadthRiskSnapshot.ma200Bonus}/1</span>
                </span>
              </div>

              {breadthRiskSnapshot.divergenceActive && (
                <div className="mt-3 rounded-lg border border-orange-300/45 bg-orange-500/14 px-3 py-2.5 text-[15px] leading-relaxed text-orange-100">
                  Divergenza di Breadth rilevata - il prezzo sale ma la partecipazione del mercato si sta indebolendo.
                </div>
              )}

              <div className="mt-3 h-[178px] w-full rounded-lg border border-white/10 bg-black/25 px-1 py-1.5">
                {breadthRiskSnapshot.ma50Series.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={breadthRiskSnapshot.ma50Series} margin={{ top: 6, right: 6, left: 6, bottom: 4 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3" />
                      <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, fontFamily: APPLE_FONT_STACK }} axisLine={false} tickLine={false} />
                      <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          return (
                            <div className="rounded-md border border-white/15 bg-[#0F1319]/95 px-2.5 py-1.5 shadow-xl">
                              <p className="text-[12px] tracking-[0.01em] text-white/70 font-semibold">{label || '-'}</p>
                              <p className="text-[14px] text-white mt-0.5 tracking-[-0.005em]">
                                % &gt; MA50: <span className="font-semibold text-[#00D9A5]">{Number(payload[0]?.value).toFixed(1)}%</span>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="ma50"
                        stroke="#00D9A5"
                        strokeWidth={2.1}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={{ r: 3.2, strokeWidth: 1.5, stroke: '#00D9A5', fill: '#0F1319' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[14px] text-white/52">
                    Sparkline in attesa di storico MA50.
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-2.5">
                <div>
                  <div className="flex items-center justify-between text-[15px] font-semibold tracking-[-0.01em] text-white/84">
                    <span>Titoli sopra MA50</span>
                    <span className="text-[#00D9A5]">{breadthRiskMa50Label}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-white/12 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#00D9A5] shadow-[0_0_12px_rgba(0,217,165,0.45)] transition-all duration-500"
                      style={{ width: `${breadthRiskMa50Pct}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[15px] font-semibold tracking-[-0.01em] text-white/84">
                    <span>Titoli sopra MA200</span>
                    <span className="text-[#E3C98A]">{breadthRiskMa200Label}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-white/12 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E3C98A] shadow-[0_0_12px_rgba(227,201,138,0.42)] transition-all duration-500"
                      style={{ width: `${breadthRiskMa200Pct}%` }}
                    />
                  </div>
                </div>
              </div>

              <p className="mt-2 text-[12px] tracking-[0.02em] text-white/50">
                {breadthRiskAsOf ? `As of ${breadthRiskAsOf}` : 'As of live feed'}
              </p>
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

const FearGreedPanel = React.memo(({ analyses, vix, regime, compact = true }) => {
  const vixCurrentValue = Number.isFinite(Number(vix?.current)) ? Number(vix?.current) : 18;
  const [showInfo, setShowInfo] = useState(false);

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

  const regimeBadgeLabel = regime === 'risk-on'
    ? 'RISK ON'
    : regime === 'risk-off'
      ? 'RISK OFF'
      : 'NEUTRAL';
  const regimeBadgeClass = regime === 'risk-on'
    ? 'text-[#00D9A5] border-[#00D9A5]/35 bg-[#001812]'
    : regime === 'risk-off'
      ? 'text-red-300 border-red-400/35 bg-[#22090F]'
      : 'text-yellow-300 border-yellow-400/35 bg-[#261F08]';
  const radarBarClass = 'bg-gradient-to-r from-[#6E2F18] via-[#D07B49] to-[#FFD5B6] shadow-[0_0_7px_rgba(255,183,133,0.52)]';
  const riskBarClass = 'bg-gradient-to-r from-[#3A0C15] via-[#C73A5A] to-[#FF8CA0] shadow-[0_0_7px_rgba(255,120,151,0.46)]';

  const radarGradientIdRef = useRef(`fear-greed-radar-fill-${Math.random().toString(36).slice(2, 10)}`);
  const radarGlowIdRef = useRef(`fear-greed-radar-glow-${Math.random().toString(36).slice(2, 10)}`);

  const radarAxes = useMemo(() => {
    const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

    return [
      { label: 'Appetite', value: clamp(model.score) },
      { label: 'Momentum', value: clamp((model.drivers.bias * 0.52) + (model.drivers.conviction * 0.48)) },
      { label: 'Volatility', value: clamp(model.drivers.vix) },
      { label: 'Positioning', value: clamp((model.drivers.bias * 0.65) + (model.drivers.regime * 0.35)) },
      { label: 'Flow', value: clamp((model.drivers.conviction * 0.55) + (model.score * 0.45)) },
      { label: 'Breadth', value: clamp((model.drivers.regime * 0.55) + (model.drivers.vix * 0.45)) },
      { label: 'Regime', value: clamp(model.drivers.regime) },
      { label: 'Conviction', value: clamp(model.drivers.conviction) }
    ];
  }, [model]);

  const radarChart = useMemo(() => {
    const size = compact ? 310 : 500;
    const center = size / 2;
    const radius = compact ? 125 : 214;
    const labelRadius = radius + (compact ? 12 : 14);
    const ringLevels = [0.2, 0.4, 0.6, 0.8, 1];
    const axisCount = radarAxes.length;

    const pointAt = (axisIndex, distance) => {
      const angle = (-Math.PI / 2) + ((axisIndex / axisCount) * Math.PI * 2);
      return {
        x: center + (Math.cos(angle) * distance),
        y: center + (Math.sin(angle) * distance)
      };
    };

    const toPointString = (point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    const ringPolygons = ringLevels.map((level) => (
      radarAxes.map((_, axisIndex) => toPointString(pointAt(axisIndex, radius * level))).join(' ')
    ));

    const axisLines = radarAxes.map((_, axisIndex) => {
      const target = pointAt(axisIndex, radius);
      return {
        x1: center,
        y1: center,
        x2: target.x,
        y2: target.y
      };
    });

    const valuePoints = radarAxes.map((axis, axisIndex) => ({
      ...pointAt(axisIndex, radius * (axis.value / 100)),
      value: axis.value
    }));

    const valuePolygon = valuePoints.map(toPointString).join(' ');
    const labelPoints = radarAxes.map((axis, axisIndex) => {
      const point = pointAt(axisIndex, labelRadius);
      let anchor = 'middle';
      if (point.x < center - 6) anchor = 'end';
      if (point.x > center + 6) anchor = 'start';
      return {
        ...point,
        label: axis.label,
        anchor
      };
    });

    return {
      size,
      center,
      ringPolygons,
      axisLines,
      valuePoints,
      valuePolygon,
      labelPoints
    };
  }, [compact, radarAxes]);

  const fearSummaryLines = useMemo(() => {
    const sentimentLine = model.score >= 76
      ? 'Sentiment in area greed estremo: evita inseguimenti sui breakout estesi.'
      : model.score >= 58
        ? 'Sentiment positivo: preferire ingressi su pullback con conferma di volume.'
        : model.score <= 24
          ? 'Sentiment in area fear estremo: aumenta il rischio di move impulsive.'
          : model.score <= 42
            ? 'Sentiment difensivo: meglio setup selettivi e gestione stretta del rischio.'
            : 'Sentiment neutrale: privilegia setup bilanciati e conferme multiple.';

    const insightLine = model.drivers.conviction >= 70
      ? 'Convinzione istituzionale solida: il sentiment attuale è supportato da flussi armonici.'
      : model.drivers.conviction <= 35
        ? 'Bassa convinzione: il sentiment attuale manca di un supporto istituzionale netto.'
        : 'Partecipazione moderata: il sentiment è in fase di assestamento senza eccessi di flusso.';

    const dynamicLine = model.drivers.vix >= 80
      ? 'Volatilità compressa: eccesso di autocompiacimento, monitorare spikes improvvisi.'
      : model.drivers.vix <= 30
        ? 'Volatilità estrema: panico elevato, possibile esaurimento della pressione di vendita.'
        : 'Volatilità stabile: il mercato sta prezzando correttamente le incertezze attuali.';

    return [sentimentLine, insightLine, dynamicLine];
  }, [model.riskPressure, model.score, regime, vixCurrentValue]);

  return (
    <TechCard className={cn(
      "dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border font-apple relative",
      compact ? "px-3 pt-3 pb-[14px] h-auto lg:min-h-[500px]" : "p-4 min-h-[680px]"
    )}>
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
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
                <h4 className="text-xl font-bold text-white uppercase tracking-[0.15em]">Guida Fear & Greed</h4>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
              <div className="space-y-5 text-left">
                <p className="text-lg text-white leading-relaxed font-normal">
                  Il <span className="text-[#00D9A5] font-semibold">Fear &amp; Greed Index</span> sintetizza il sentiment combinando bias direzionale, volatilita implicita (VIX), regime macro e conviction del flusso.
                </p>

                <div className="pt-5 border-t border-white/10">
                  <div className="flex items-center justify-center gap-2 mb-5">
                    <Gauge className="w-5 h-5 text-[#00D9A5]" style={{ filter: 'drop-shadow(0 0 6px #00D9A5)' }} />
                    <p className="text-base font-bold text-white uppercase tracking-[0.15em]">Come leggere i dati</p>
                  </div>
                  <ul className="space-y-4 text-left">
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold">Score centrale:</span> valore 0-100 del sentiment complessivo.
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-[#00D9A5] shadow-[0_0_8px_#00D9A5] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold">Radar:</span> distribuzione dei driver (Bias, VIX, Regime, Conviction e componenti derivate).
                      </p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="mt-2.5 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_#FACC15] flex-shrink-0" />
                      <p className="text-lg text-white leading-relaxed font-normal">
                        <span className="font-semibold text-yellow-400">Rischio:</span> pressione inversa del sentiment utile per stimare fragilita del mercato.
                      </p>
                    </li>
                  </ul>
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
        <div className={cn("flex items-start justify-between", compact ? "mt-1 mb-2.5" : "mb-4")}>
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col items-start mt-[2px]">
              <div className="inline-flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#00D9A5]" />
                <span className="font-medium text-base text-white/90">
                  Fear &amp; Greed Index
                </span>
                <button
                  type="button"
                  onClick={() => setShowInfo((prev) => !prev)}
                  className="p-1 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
                  aria-label="Informazioni Fear and Greed"
                  title="Informazioni Fear and Greed"
                  aria-expanded={showInfo}
                >
                  <Info className="w-3 h-3 text-white" />
                </button>
              </div>
            </div>
          </div>
          <span className={cn(
            "inline-flex items-center justify-center rounded-full border px-3 py-1.5 font-black uppercase tracking-[0.1em] leading-none whitespace-nowrap",
            compact ? "text-[10px]" : "text-[10px]",
            regimeBadgeClass
          )}>
            {regimeBadgeLabel}
          </span>
        </div>

        <div className="relative">
          <div className={cn("relative mx-auto flex justify-center items-center overflow-visible", compact ? "h-[260px] w-full max-w-[320px] -mt-1" : "h-[470px] w-full max-w-[500px]")}>
            <svg
              className="h-full w-full overflow-visible"
              viewBox={`0 0 ${radarChart.size} ${radarChart.size}`}
              role="img"
              aria-label="Fear and Greed spider chart"
            >
              <defs>
                <radialGradient
                  id={radarGradientIdRef.current}
                  gradientUnits="userSpaceOnUse"
                  cx={radarChart.center}
                  cy={radarChart.center}
                  r={compact ? 155 : 214}
                >
                  <stop offset="0%" stopColor="rgba(34,18,10,0.07)" />
                  <stop offset="30%" stopColor="rgba(96,52,33,0.16)" />
                  <stop offset="64%" stopColor="rgba(192,116,78,0.38)" />
                  <stop offset="100%" stopColor="rgba(242,169,128,0.58)" />
                </radialGradient>
                <filter id={radarGlowIdRef.current} x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {radarChart.ringPolygons.map((points, ringIndex) => (
                <polygon
                  key={`ring-${ringIndex}`}
                  points={points}
                  fill="none"
                  stroke={ringIndex === radarChart.ringPolygons.length - 1 ? "rgba(245,245,245,0.25)" : "rgba(245,245,245,0.19)"}
                  strokeWidth={ringIndex === radarChart.ringPolygons.length - 1 ? 1.1 : 0.9}
                />
              ))}

              {radarChart.axisLines.map((line, lineIndex) => (
                <line
                  key={`axis-${lineIndex}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="rgba(245,245,245,0.2)"
                  strokeWidth="0.95"
                />
              ))}

              <polygon
                points={radarChart.valuePolygon}
                fill={`url(#${radarGradientIdRef.current})`}
                stroke="rgba(247,188,146,0.86)"
                strokeWidth="1.6"
                filter={`url(#${radarGlowIdRef.current})`}
              />

              {radarChart.valuePoints.map((point, pointIndex) => (
                <circle
                  key={`value-${pointIndex}`}
                  cx={point.x}
                  cy={point.y}
                  r={compact ? 3.8 : 4.4}
                  fill="rgba(255,222,193,0.88)"
                  stroke="rgba(255,190,143,0.8)"
                  strokeWidth="0.8"
                />
              ))}

              {radarChart.labelPoints.map((labelPoint, labelIndex) => (
                <text
                  key={`label-${labelIndex}`}
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor={labelPoint.anchor}
                  dominantBaseline="middle"
                  fill="rgba(245,245,245,0.92)"
                  fontSize={compact ? 18.5 : 21}
                  fontWeight="700"
                  letterSpacing="0.3"
                >
                  {labelPoint.label}
                </text>
              ))}

              <circle
                cx={radarChart.center}
                cy={radarChart.center}
                r={compact ? 30 : 36}
                fill="rgba(8,11,16,0.9)"
                stroke="rgba(255,255,255,0.2)"
              />
              <text
                x={radarChart.center}
                y={radarChart.center + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className={cn("font-black", compact ? "text-[24px]" : "text-[30px]")}
                fill="rgba(255,236,219,0.99)"
              >
                {model.score}
              </text>
            </svg>
          </div>

          <div className={cn("flex items-center justify-between", compact ? "mb-1.5 px-1" : "mb-1.5 px-1")}>
            <span className={cn("uppercase tracking-[0.1em] text-white/88 font-bold", compact ? "text-[14px]" : "text-[14px]")}>
              Fear &amp; Greed
            </span>
            <span className={cn(
              "font-black tabular-nums drop-shadow-[0_0_10px_rgba(255,174,126,0.55)] text-[#FFC69A]",
              compact ? "text-[18px]" : "text-[18px]"
            )}>
              {model.score}
            </span>
          </div>

          <div className={cn("bg-white/10 rounded-full overflow-hidden", compact ? "mb-2 h-[7.2px]" : "mb-2 h-[7.2px]")}>
            <div
              className={cn("h-[7.2px] rounded-full transition-all", radarBarClass)}
              style={{ width: `${Math.max(model.score, 8)}%` }}
            />
          </div>

          <div className={cn("flex items-center justify-between", compact ? "mb-1.5 px-1" : "mb-1.5 px-1")}>
            <span className={cn("uppercase tracking-[0.1em] text-white/88 font-bold", compact ? "text-[14px]" : "text-[14px]")}>
              Rischio
            </span>
            <span className={cn(
              "font-black tabular-nums drop-shadow-[0_0_10px_rgba(255,120,148,0.5)] text-[#FF99AF]",
              compact ? "text-[18px]" : "text-[18px]"
            )}>
              {model.riskPressure}%
            </span>
          </div>

          <div className={cn("bg-white/10 rounded-full overflow-hidden", compact ? "mb-2 h-[7.2px]" : "mb-2 h-[7.2px]")}>
            <div
              className={cn("h-[7.2px] rounded-full transition-all", riskBarClass)}
              style={{ width: `${Math.max(model.riskPressure, 8)}%` }}
            />
          </div>

          <div className={cn("rounded-xl bg-white/5 border border-white/10", compact ? "mt-2 p-2.5" : "mt-2.5 p-3")}>
            <ul className="space-y-1.5 text-[16px] font-medium text-white/95 leading-relaxed tracking-[0.01em]">
              {fearSummaryLines.map((line, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className={idx === 2 ? "text-[#FF99AF] mt-0.5" : "text-[#00D9A5] mt-0.5"}>•</span>
                  <TypewriterText text={line} speed={18} delay={220 + idx * 340} />
                </li>
              ))}
            </ul>
          </div>
        </div>

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
  const legacyReport = cotData?.legacy_report && typeof cotData.legacy_report === 'object'
    ? cotData.legacy_report
    : null;
  const fallbackLegacyDateLabel = (() => {
    const raw = data?.release_date;
    if (typeof raw !== 'string' || raw.length < 10) return null;
    const [year, month, day] = raw.split('-');
    if (!year || !month || !day) return null;
    return `${day}/${month}/${year}`;
  })();
  const legacyReportDateLabel = legacyReport?.report_date_label || fallbackLegacyDateLabel || 'n.d.';
  const legacyReportUrl = legacyReport?.url || COT_LEGACY_FALLBACK_URL;

  if (selectedInstruments.length === 0) {
    return (
      <TechCard className="dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border p-4 h-full font-apple bg-[#0F1115] border-[#1C1F26] rounded-[32px] shadow-2xl relative flex items-center justify-center">
        <p className="text-sm text-white/60 text-center">COT non disponibile al momento.</p>
      </TechCard>
    );
  }

  return (
    <TechCard className="dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border p-4 h-full font-apple bg-[#0F1115] border-[#1C1F26] rounded-[32px] shadow-2xl relative flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative">
        <div className={cn(
          "flex items-center gap-2 transition-all duration-200",
          showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
        )}>
          <Users className="w-5 h-5 text-[#00D9A5]" />
          <span className="font-medium text-base text-white/90">COT Institutional</span>
          <div className="relative">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-1 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
            >
              <Info className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
          <div className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl shadow-sm flex items-center justify-center mt-[-2px]">
            <span className="font-apple text-[14px] sm:text-[15px] font-semibold text-white/95 tracking-[0.06em] uppercase leading-none">
              {currentSymbol || '-'}
            </span>
          </div>
        </div>

        {/* Info Tooltip - Centered overlay in panel */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
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
                  initial={dashboardInitial({ opacity: 0, y: -5, scale: 0.95 })}
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
        "flex-1 flex flex-col transition-all duration-200",
        showInfo && "blur-[8px] opacity-30 pointer-events-none select-none"
      )}>
        {/* Main Title & Value */}
        {/* Compact Title Row & Chart */}
        {/* Left Aligned Compact Row */}
        {/* Left Stack Title & NetPos */}
        {/* Left Stack Title & NetPos - Big & Spaced */}
        <div className="flex flex-col items-start px-2 mb-2 shrink-0">

          <div className="flex flex-col items-start mt-1">
            <span className="text-xs text-white/70 font-bold uppercase tracking-wider leading-none mb-1">Net Position</span>
            <span className={cn(
              "text-3xl font-bold tracking-tighter leading-none",
              netPos >= 0 ? "text-[#00D9A5]" : "text-red-400"
            )}>{formattedNetPos}</span>
          </div>
        </div>

        {/* Rolling Bias Section */}
        <div className="-mt-4 mb-2 px-1">
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
        <div className="flex items-start justify-evenly px-1 mb-2">
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
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <ul className="space-y-1.5 text-base text-white/90">
            {interpretation.slice(0, 3).map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#00D9A5] mt-0.5">•</span>
                <TypewriterText text={line} speed={20} delay={300 + i * 800} />
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
            <p className="text-base text-white/70">
              Ultimo rilascio COT Legacy: <span className="font-bold text-white text-[17px] ml-1">{legacyReportDateLabel}</span>
            </p>
            <a
              href={legacyReportUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#67D8FF]/35 bg-[#67D8FF]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-[#67D8FF] hover:bg-[#67D8FF]/16 transition-colors"
            >
              Apri report COT Legacy
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </TechCard >
  );
});




// Options Flow Panel - Enhanced Interactive
const OptionsPanel = React.memo(({ animationsReady = false, selectedAsset: propAsset, onAssetChange, optionsData = null, className = '' }) => {
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

  const availableAssets = Array.from(new Set([
    'XAUUSD', 'NAS100', 'SP500', 'EURUSD', 'BTCUSD',
    ...Object.keys(optionsData || {})
  ]));

  const currentData = getLiveOptionsNode(optionsData, selectedAsset);
  const hasLiveOptions = !currentData.data_unavailable;
  const ratioSpread = currentData.call_ratio - currentData.put_ratio;
  const grossPremium = currentData.call_million + currentData.put_million;
  const dominantSide = ratioSpread >= 6 ? 'CALL' : ratioSpread <= -6 ? 'PUT' : 'BALANCED';
  const netTone = currentData.net_million >= 0 ? 'pro-risk' : 'risk-off';
  const isNetFlowPositive = currentData.net_million >= 0;
  const signedPct = (value) => `${value >= 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
  const signedMillion = (value) => `${value >= 0 ? '+' : ''}${Math.round(value)}M`;

  const flowBullets = useMemo(() => {
    if (!hasLiveOptions) {
      return [
        'Feed opzioni live non disponibile per questo asset in questo momento.',
        'Il pannello resta in modalita neutrale fino al prossimo aggiornamento del feed.',
        'Verificare disponibilita chain/expiry o attendere il refresh automatico.'
      ];
    }

    const momentumLine = currentData.net_change >= 6
      ? 'Momentum intraday in accelerazione sul lato dominante.'
      : currentData.net_change <= -6
        ? 'Momentum intraday in decelerazione: possibile rotazione.'
        : 'Momentum intraday stabile, senza accelerazioni anomale.';

    const directionalLine = currentData.bias === 'bullish'
      ? 'Flusso direzionale rialzista: privilegiare setup long solo con conferma prezzo.'
      : currentData.bias === 'bearish'
        ? 'Flusso direzionale ribassista: preferire trade difensivi e breakout short.'
        : 'Flusso bilanciato: meglio operativita tattica finche non emerge uno sbilanciamento.';

    return [
      `Dominanza ${dominantSide}: spread Call/Put ${ratioSpread >= 0 ? '+' : ''}${Math.round(ratioSpread)} pt.`,
      `Premium totale ${Math.round(grossPremium)}M con net flow ${signedMillion(currentData.net_million)} (${netTone}).`,
      `Variazioni sessione: Call ${signedPct(currentData.call_change)} | Put ${signedPct(currentData.put_change)} | Net ${signedPct(currentData.net_change)}.`,
      momentumLine,
      directionalLine
    ];
  }, [
    hasLiveOptions,
    currentData.bias,
    currentData.call_change,
    currentData.net_change,
    currentData.net_million,
    currentData.put_change,
    dominantSide,
    grossPremium,
    netTone,
    ratioSpread
  ]);

  return (
    <TechCard className={cn("dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border p-3 h-full font-apple relative", className)}>
      {/* Info Tooltip - Genie Effect */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
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
        <div className="flex items-center justify-between mb-3 relative">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#00D9A5]" />
            <span className="font-medium text-base text-white/90">Options Flow</span>
            {/* Info Button */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-1 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
            >
              <Info className="w-3 h-3 text-white" />
            </button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <div className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl shadow-sm flex items-center justify-center mt-[-2px]">
              <span className="font-apple text-[14px] sm:text-[15px] font-semibold text-white/95 tracking-[0.06em] uppercase leading-none">
                {selectedAsset}
              </span>
            </div>
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
                  initial={dashboardInitial({ opacity: 0, y: -10 })}
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
                  color={isNetFlowPositive ? "#00D9A5" : "#EF4444"}
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
                    isNetFlowPositive ? "text-[#00D9A5]" : "text-red-400"
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
          {!hasLiveOptions
            ? 'Feed opzioni live temporaneamente non disponibile'
            : currentData.bias === 'bullish'
              ? 'Flussi istituzionali favorevoli al rialzo'
              : currentData.bias === 'bearish'
                ? 'Pressione ribassista sui derivati'
                : 'Equilibrio tra opzioni call e put'}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/45">C/P Spread</p>
            <p className={cn(
              "text-sm font-semibold mt-1",
              ratioSpread >= 0 ? "text-[#00D9A5]" : "text-red-400"
            )}>
              {ratioSpread >= 0 ? '+' : ''}{Math.round(ratioSpread)} pt
            </p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Gross Flow</p>
            <p className="text-sm font-semibold mt-1 text-white">{Math.round(grossPremium)}M</p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/45">Net Momentum</p>
            <p className={cn(
              "text-sm font-semibold mt-1",
              currentData.net_change >= 0 ? "text-[#00D9A5]" : "text-red-400"
            )}>
              {signedPct(currentData.net_change)}
            </p>
          </div>
        </div>

        {/* Options Interpretation - Bullet Points styled like Screening */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <ul className="space-y-1.5 text-base text-white/90">
            {flowBullets.slice(0, 3).map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#00D9A5] mt-0.5">•</span>
                <TypewriterText text={line} speed={20} delay={300 + idx * 800} />
              </li>
            ))}
          </ul>
        </div>

        {/* Compact Disclaimer Summary - Matching Chart Style */}
      </div>

    </TechCard>
  );
});

const GammaExposurePanel = React.memo(({ selectedAsset: propAsset, onAssetChange, optionsData = null, compact = false }) => {
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

  const availableAssets = Array.from(new Set([
    'XAUUSD', 'NAS100', 'SP500', 'EURUSD', 'BTCUSD',
    ...Object.keys(optionsData || {})
  ]));
  const currentData = getLiveOptionsNode(optionsData, selectedAsset);
  const gexProfile = useMemo(() => currentData.gex_profile || [], [currentData]);
  const normalizedProfile = useMemo(
    () => gexProfile
      .map((row) => {
        const strike = parseNumericValue(row.strike);
        const call = parseNumericValue(row.call);
        const put = parseNumericValue(row.put);
        const parsedNet = parseNumericValue(row.net);
        const net = Number.isFinite(parsedNet)
          ? parsedNet
          : (Number.isFinite(call) ? call : 0) + (Number.isFinite(put) ? put : 0);

        return {
          strike,
          call: Number.isFinite(call) ? call : 0,
          put: Number.isFinite(put) ? put : 0,
          net
        };
      })
      .filter((row) => Number.isFinite(row.strike)),
    [gexProfile]
  );

  const maxGamma = useMemo(() => {
    const max = normalizedProfile.reduce((acc, row) => {
      const rowMax = Math.max(Math.abs(row.put || 0), Math.abs(row.call || 0), Math.abs(row.net || 0));
      return Math.max(acc, rowMax);
    }, 0);
    return Math.max(max, 1);
  }, [normalizedProfile]);

  const gexStats = useMemo(() => {
    if (!normalizedProfile.length) {
      return {
        totalCall: 0,
        totalPut: 0,
        totalNet: 0,
        zeroGammaLevel: parseNumericValue(currentData.gamma_flip),
        callWall: null,
        putWall: null,
        regimeLabel: 'Neutral Gamma',
        regimeHint: 'Nessuna lettura GEX disponibile.'
      };
    }

    const totalCall = normalizedProfile.reduce((acc, row) => acc + Math.abs(row.call), 0);
    const totalPut = normalizedProfile.reduce((acc, row) => acc + Math.abs(row.put), 0);
    const totalNet = normalizedProfile.reduce((acc, row) => acc + row.net, 0);
    const callWall = normalizedProfile.reduce((best, row) => {
      if (!best || Math.abs(row.call) > Math.abs(best.call)) return row;
      return best;
    }, null);
    const putWall = normalizedProfile.reduce((best, row) => {
      if (!best || Math.abs(row.put) > Math.abs(best.put)) return row;
      return best;
    }, null);

    let zeroGammaLevel = parseNumericValue(currentData.gamma_flip);
    for (let i = 0; i < normalizedProfile.length - 1; i++) {
      const current = normalizedProfile[i];
      const next = normalizedProfile[i + 1];
      if (current.net === 0) {
        zeroGammaLevel = current.strike;
        break;
      }
      if ((current.net > 0 && next.net < 0) || (current.net < 0 && next.net > 0)) {
        const distance = Math.abs(current.net) + Math.abs(next.net);
        const weight = distance > 0 ? Math.abs(current.net) / distance : 0.5;
        zeroGammaLevel = current.strike + (next.strike - current.strike) * weight;
        break;
      }
    }
    if (!Number.isFinite(zeroGammaLevel)) {
      zeroGammaLevel = normalizedProfile.reduce((closest, row) => (
        Math.abs(row.net) < Math.abs(closest.net) ? row : closest
      ), normalizedProfile[0]).strike;
    }

    const regimePositive = totalNet >= 0;

    return {
      totalCall,
      totalPut,
      totalNet,
      zeroGammaLevel,
      callWall,
      putWall,
      regimeLabel: regimePositive ? 'Positive Gamma' : 'Negative Gamma',
      regimeHint: regimePositive
        ? 'Dealer hedge contro-trend: favorisce compressione e mean reversion.'
        : 'Dealer hedge pro-trend: aumenta rischio squeeze e accelerazioni.'
    };
  }, [currentData.gamma_flip, normalizedProfile]);

  const gexActionPlan = useMemo(() => {
    const lines = [
      gexStats.regimeHint,
      `Zero Gamma Level: ${formatStrikeLevel(gexStats.zeroGammaLevel)} (pivot intraday).`
    ];

    if (gexStats.callWall && gexStats.putWall) {
      lines.push(
        `Dealer range: Put Wall ${formatStrikeLevel(gexStats.putWall.strike)} - Call Wall ${formatStrikeLevel(gexStats.callWall.strike)}.`
      );
    }

    lines.push(
      gexStats.totalNet >= 0
        ? 'Setup preferiti: fade degli estremi, rientro verso livelli centrali.'
        : 'Setup preferiti: breakout direzionali veloci, evitare mean reversion aggressiva.'
    );

    return lines;
  }, [gexStats]);

  const netIntensity = useMemo(() => {
    const magnitude = gexStats.totalCall + gexStats.totalPut;
    if (magnitude <= 0) return 0;
    return Math.min(100, Math.round((Math.abs(gexStats.totalNet) / magnitude) * 100));
  }, [gexStats.totalCall, gexStats.totalNet, gexStats.totalPut]);

  const gammaFlipValue = parseNumericValue(currentData.gamma_flip);
  const gexKpiCards = useMemo(() => ([
    {
      key: 'zero-gamma',
      label: 'Zero Gamma',
      value: formatStrikeLevel(gexStats.zeroGammaLevel),
      valueClass: 'text-white'
    },
    {
      key: 'gamma-flip',
      label: 'Gamma Flip',
      value: formatStrikeLevel(gammaFlipValue),
      valueClass: 'text-white'
    }
  ]), [gammaFlipValue, gexStats.zeroGammaLevel]);

  return (
    <TechCard className={cn(
      "dashboard-panel-glass-boost glass-edge panel-left-edge fine-gray-border font-apple relative",
      compact ? "p-3.5 h-auto" : "p-3 h-full"
    )}>
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
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
                  Il <span className="text-[#00D9A5] font-semibold">GEX 0DTE</span> mappa il posizionamento dealer per strike.
                  Questa card serve a leggere regime gamma, livelli chiave e rischio di squeeze in tempo reale.
                </p>
                <ul className="space-y-4 text-left">
                  <li className="flex items-start gap-3">
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-[#B574FF] shadow-[0_0_8px_#B574FF] flex-shrink-0" />
                    <p className="text-lg text-white leading-relaxed font-normal">
                      <span className="font-semibold text-[#B574FF]">Put Wall / Put Gamma</span>: area di supporto dove il dealer tende a difendere.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-[#E3C98A] shadow-[0_0_8px_#E3C98A] flex-shrink-0" />
                    <p className="text-lg text-white leading-relaxed font-normal">
                      <span className="font-semibold text-[#E3C98A]">Call Wall / Call Gamma</span>: area di resistenza dove il dealer assorbe rally.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="mt-2.5 w-2 h-2 rounded-full bg-[#FF4D7A] shadow-[0_0_8px_#FF4D7A] flex-shrink-0" />
                    <p className="text-lg text-white leading-relaxed font-normal">
                      <span className="font-semibold text-[#FF4D7A]">Zero Gamma Level</span>: cambio regime tra compressione (positive gamma) ed espansione (negative gamma).
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
        <div className={cn("flex items-start justify-between px-1 relative", compact ? "mb-2.5" : "mb-3")}>
          <div className="flex flex-col items-start mt-[2px]">
            <div className="inline-flex items-center gap-2">
              <Gauge className="w-5 h-5 text-[#00D9A5]" />
              <span className="font-semibold text-[15px] text-white/95 tracking-tight font-apple">
                GEX 0DTE
              </span>
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="p-1 rounded-lg bg-white/[0.14] border border-white/[0.28] backdrop-blur-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_8px_20px_rgba(0,0,0,0.28)] hover:bg-white/[0.2] transition-all opacity-55 hover:opacity-100"
              >
                <Info className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none mt-[2px]">
            <div className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl shadow-sm flex items-center justify-center mt-[-4px]">
              <span className="font-apple text-[14px] sm:text-[15px] font-semibold text-white/95 tracking-[0.06em] uppercase leading-none">
                {selectedAsset}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={cn(
              "inline-flex items-center justify-center rounded-full border px-3 py-1.5 font-bold uppercase tracking-[0.05em] leading-none whitespace-nowrap font-apple",
              compact ? "text-[12px]" : "text-[12px]",
              gexStats.totalNet >= 0
                ? "text-[#00D9A5] border-[#00D9A5]/35 bg-[#001812]"
                : "text-red-300 border-red-400/35 bg-[#22090F]"
            )}>
              {gexStats.regimeLabel}
            </span>

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
                    initial={dashboardInitial({ opacity: 0, y: -10 })}
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
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors font-semibold font-apple",
                            selectedAsset === asset
                              ? "bg-[#00D9A5]/10 text-[#00D9A5]"
                              : "bg-transparent text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/5"
                          )}
                        >
                          <span className="tracking-tight">{asset}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center font-apple", compact ? "mb-2 text-[13px]" : "mb-2 text-[13px]")}>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#B574FF]/35 bg-[#B574FF]/10 px-2.5 py-1.5 font-semibold text-[#D9B9FF] justify-self-start tracking-tight">
            Put Wall
            <span className="font-bold text-white ml-0.5">{formatStrikeLevel(gexStats.putWall?.strike)}</span>
          </span>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-semibold justify-self-center translate-x-[6px] tracking-tight",
            gexStats.totalNet >= 0
              ? "border-[#00D9A5]/35 bg-[#00D9A5]/10 text-[#A7FFE7]"
              : "border-red-400/35 bg-red-500/10 text-red-300"
          )}>
            Net GEX
            <span className="font-bold text-white ml-0.5">{formatSignedGammaExposure(gexStats.totalNet)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E3C98A]/35 bg-[#E3C98A]/10 px-2.5 py-1.5 font-semibold text-[#F4DFB4] justify-self-end tracking-tight">
            Call Wall
            <span className="font-bold text-white ml-0.5">{formatStrikeLevel(gexStats.callWall?.strike)}</span>
          </span>
        </div>

        <div className={cn("rounded-xl bg-white/[0.03] border border-white/10 mx-auto", compact ? "p-2 max-w-full" : "p-2 max-w-full")}>
          <div className={cn("space-y-1 overflow-y-auto scrollbar-thin pr-1", compact ? "max-h-[190px]" : "max-h-[172px]")}>
            {normalizedProfile.map((row, idx) => {
              const putWidth = Math.min((Math.abs(row.put || 0) / maxGamma) * 50, 50);
              const callWidth = Math.min((Math.abs(row.call || 0) / maxGamma) * 50, 50);
              const netValue = row.net;
              const netWidth = Math.min((Math.abs(netValue) / maxGamma) * 50, 50);
              const isNetPositive = netValue >= 0;

              return (
                <div key={`${row.strike}-${idx}`} className={cn("grid items-center gap-1.5 font-apple", compact ? "grid-cols-[56px_1fr]" : "grid-cols-[60px_1fr]")}>
                  <span className={cn("text-right font-semibold text-white/95 tracking-tight", compact ? "text-[12px]" : "text-[12px]")}>
                    {formatStrikeLevel(row.strike)}
                  </span>
                  <div className={cn("relative rounded-md bg-black/20 overflow-hidden", compact ? "h-[15px]" : "h-3")}>
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />

                    {putWidth > 0 && (
                      <div
                        className={cn(
                          "absolute right-1/2 top-1/2 -translate-y-1/2 rounded-l-sm bg-[#B574FF]/95",
                          compact ? "h-[6px]" : "h-[6px]"
                        )}
                        style={{ width: `${putWidth}%` }}
                      />
                    )}

                    {callWidth > 0 && (
                      <div
                        className={cn(
                          "absolute left-1/2 top-1/2 -translate-y-1/2 rounded-r-sm bg-[#E3C98A]/95",
                          compact ? "h-[6px]" : "h-[6px]"
                        )}
                        style={{ width: `${callWidth}%` }}
                      />
                    )}

                    {netWidth > 0 && (
                      <div
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 bg-[#FF4D7A]/95",
                          compact ? "h-[4px]" : "h-[4px]",
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

          <div className={cn("mt-1.5 grid items-center gap-1.5", compact ? "grid-cols-[56px_1fr]" : "grid-cols-[60px_1fr]")}>
            <span />
            <div className={cn("flex items-center justify-between text-white/95 font-semibold tracking-tighter tabular-nums font-apple", compact ? "text-[12px]" : "text-[12px]")}>
              <span className="opacity-80">-{formatGammaScale(maxGamma)}</span>
              <span className="opacity-80">0</span>
              <span className="opacity-80">{formatGammaScale(maxGamma)}</span>
            </div>
          </div>
        </div>

        <div className={cn("grid gap-2", compact ? "mt-2.5 mb-2.5 grid-cols-2" : "mt-3 mb-3 grid-cols-2")}>
          {gexKpiCards.map((item) => (
            <div key={item.key} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex flex-col items-center justify-center gap-0.5 shadow-sm transition-all hover:bg-white/5">
              <span className="font-apple text-[13px] font-bold uppercase tracking-[0.1em] text-white/85 leading-tight">
                {item.label}
              </span>
              <span className={cn(
                "font-apple font-bold tabular-nums tracking-tight",
                compact ? "text-[15.5px]" : "text-[15.5px]",
                item.valueClass
              )}>
                {item.value}
              </span>
            </div>
          ))}
        </div>

        <div className={cn("flex items-center justify-between font-apple", compact ? "mb-1.5 px-1" : "mb-1.5 px-1")}>
          <span className={cn("uppercase tracking-[0.1em] text-white/88 font-bold", compact ? "text-[14px]" : "text-[14px]")}>
            Net GEX
          </span>
          <span className={cn(
            "font-bold tabular-nums tracking-tight font-apple",
            compact ? "text-[17px]" : "text-[18px]",
            gexStats.totalNet >= 0 ? "text-[#00D9A5]" : "text-red-400"
          )}>
            {formatSignedGammaExposure(gexStats.totalNet)}
          </span>
        </div>

        <div className={cn("bg-white/10 rounded-full overflow-hidden", compact ? "mb-2 h-[7.2px]" : "mb-2 h-[7.2px]")}>
          <div
            className={cn(
              "h-full rounded-full transition-all",
              gexStats.totalNet >= 0
                ? "bg-gradient-to-r from-[#003B2D] via-[#00A37A] to-[#00D9A5] shadow-[0_0_8px_rgba(0,217,165,0.45)]"
                : "bg-gradient-to-r from-[#3D0C15] via-[#9E2A43] to-[#FF4D4D] shadow-[0_0_8px_rgba(255,77,77,0.45)]"
            )}
            style={{ width: `${Math.max(netIntensity, 8)}%` }}
          />
        </div>

        <div className={cn("rounded-xl bg-white/5 border border-white/10", compact ? "mt-2 p-2.5" : "mt-2.5 p-3")}>
          <ul className="space-y-1.5 text-[16px] font-medium text-white/95 leading-relaxed tracking-[0.01em] whitespace-pre-line">
            {gexActionPlan.slice(0, 3).map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#00D9A5] mt-0.5">•</span>
                <TypewriterText text={line} speed={18} delay={260 + idx * 480} />
              </li>
            ))}
          </ul>
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
                initial={dashboardInitial({ opacity: 0, y: -10 })}
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
                      initial={dashboardInitial({ height: 0, opacity: 0 })}
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
  { title: 'Retail Sales (Dec)', time: '14:30', impact: 'high', currency: 'USD', countdown: 'Uscito', timestamp: new Date('2026-03-03T14:30:00Z').toISOString(), summary: 'Consumi forti negli USA, oltre le attese. Supporta tesi di economia resiliente.' },
  { title: 'ADP Employment', time: '14:15', impact: 'medium', currency: 'USD', countdown: 'Uscito', timestamp: new Date('2026-03-04T14:15:00Z').toISOString(), summary: 'Occupazione privata stabile. Precursore NFP moderatamente positivo.' },
  { title: 'US Core CPI m/m', time: '14:30', impact: 'high', currency: 'USD', forecast: '0.3%', actual: '0.3%', countdown: 'Uscito', timestamp: new Date('2026-03-05T14:30:00Z').toISOString(), summary: 'Inflazione core in linea con le attese. Nessun allarme immediato per la Fed.' },
  { title: 'NFP (Jan)', time: '15:00', impact: 'high', currency: 'USD', forecast: '65K', actual: '130K', countdown: 'Uscito', timestamp: new Date('2026-03-05T15:00:00Z').toISOString(), summary: 'Payrolls a 130K, il doppio delle attese. Mercato lavoro solido.' },
  { title: 'Fed Speeches', time: '16:00', impact: 'medium', currency: 'USD', countdown: '1h 20m', timestamp: new Date('2026-03-05T16:00:00Z').toISOString(), summary: 'Diversi policymaker Fed in programma. Monitorare commenti post-dati.' },
  { title: 'US 10Y Auction', time: '19:00', impact: 'medium', currency: 'USD', countdown: '4h', timestamp: new Date('2026-03-05T19:00:00Z').toISOString(), summary: 'Asta Treasury 10Y. Monitorare domanda istituzionale.' },
  { title: 'CPI (Jan)', time: '14:30', impact: 'high', currency: 'USD', forecast: '2.5%', countdown: '1 giorno', timestamp: new Date('2026-03-06T14:30:00Z').toISOString(), summary: 'Dato inflazione cruciale. Se sopra attese, tassi alti più a lungo.' },
  { title: 'Consumer Sentiment', time: '16:00', impact: 'medium', currency: 'USD', countdown: '1 giorno', timestamp: new Date('2026-03-06T16:00:00Z').toISOString(), summary: 'Fiducia dei consumatori Michigan. Focus su aspettative inflazione.' },
];

// News & Activity Sidebar
const ActivitySidebar = ({ news, strategiesProjections, strategiesCatalog, newsSummaries }) => {
  const [expandedNews, setExpandedNews] = useState(null);
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(todayKey);
  const newsData = useMemo(() => {
    const liveEvents = Array.isArray(news)
      ? news.filter((item) => item && typeof item === 'object')
      : [];
    if (liveEvents.length === 0) return FALLBACK_NEWS_EVENTS;

    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    const eventKey = (item, idx = 0) => {
      const eventDate = inferEventDate(item, baseDate, idx);
      const dateKey = toDateKey(eventDate);
      const titleKey = String(item?.title || item?.event || '').trim().toLowerCase();
      const timeKey = String(item?.time || '').trim();
      const currencyKey = String(item?.currency || '').trim().toUpperCase();
      return `${dateKey}|${timeKey}|${currencyKey}|${titleKey}`;
    };

    const mergedEvents = [...FALLBACK_NEWS_EVENTS];
    const seenKeys = new Set(mergedEvents.map((item, idx) => eventKey(item, idx)));

    liveEvents.forEach((item, idx) => {
      const key = eventKey(item, idx + FALLBACK_NEWS_EVENTS.length);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      mergedEvents.push(item);
    });

    return mergedEvents;
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
    <div className="flex flex-col gap-4 h-full">
      {/* Calendar Section - Compact version */}
      <TechCard className="dashboard-panel-glass-boost p-4 font-apple glass-edge panel-left-edge fine-gray-border lg:w-full lg:ml-0 xl:w-[118%] xl:-ml-[17%] xl:relative xl:z-10">
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
                  isSelected ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5",
                  isToday && "ring-1 ring-[#00D9A5]/50 text-[#00D9A5]"
                )}
              >
                {cell.day}
                {hasEvents && !isSelected && (
                  <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-[#00D9A5]" />
                )}
              </button>
            );
          })}
        </div>
      </TechCard>

      {/* News Section - Allungata per coprire più spazio verticale */}
      <div className="flex-1 min-h-[500px]">
        <TechCard className="dashboard-panel-glass-boost pt-2 px-4 pb-4 font-apple flex flex-col glass-edge panel-left-edge fine-gray-border h-full lg:w-full lg:ml-0 xl:w-[118%] xl:-ml-[17%] xl:relative xl:z-10" style={{ maxHeight: 'calc(100vh - 85px)', minHeight: '750px' }}>
          {/* Fixed Main Header - High Contrast */}
          <div className="bg-[#0F1115] px-4 py-2 flex items-center gap-2 border-b border-white/5">
            <Newspaper className="w-3.5 h-3.5 text-[#00D9A5]" />
            <h4 className="text-[12px] font-bold text-white/40 uppercase tracking-[0.2em]">News</h4>
          </div>

          {/* Scrollable Feed */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pt-1">
            <div className="pb-4">
              {Object.keys(eventsByDay).sort((a, b) => b.localeCompare(a)).map((dateKey) => {
                const dayEvents = eventsByDay[dateKey];
                const dateObj = dayEvents[0]._date;
                const isToday = dateKey === todayKey;

                const dayLabel = isToday ? 'Oggi' : new Intl.DateTimeFormat('it-IT', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short'
                }).format(dateObj);
                return (
                  <div key={dateKey} className="mb-10 first:mt-2">
                    {/* Day Separator - Silver & Smoke, Fixed Overlap */}
                    <div className="sticky top-0 bg-[#0F1115] z-[45] py-4 flex items-center gap-4 border-b border-white/10 shadow-lg">
                      <span className="text-[11px] font-black uppercase tracking-[0.4em] text-[#C0C0C0]">
                        {dayLabel}
                      </span>
                      <div className="h-[1px] flex-1 bg-[linear-gradient(90deg,rgba(192,192,192,0.4)_0%,rgba(192,192,192,0.1)_30%,transparent_100%)]" />
                    </div>

                    {/* Daily Items - Original Character Design */}
                    <div className="space-y-2 mt-4">
                      {dayEvents.map((item) => {
                        const i = item._newsIndex;
                        return (
                          <div
                            key={`${dateKey}-${i}`}
                            onClick={() => setExpandedNews(expandedNews === i ? null : i)}
                            className={cn(
                              "p-3 rounded-xl transition-all cursor-pointer border border-slate-300 bg-slate-50 dark:bg-white/[0.04] dark:border-white/[0.08] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-slate-100 dark:hover:bg-white/[0.07] group/item",
                              expandedNews === i && "ring-1 ring-white/20 bg-white/[0.08]"
                            )}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[14px] font-bold text-slate-900 dark:text-white/95 leading-tight group-hover/item:text-black dark:group-hover/item:text-white transition-colors">
                                {item.title}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-[13px] font-bold text-[#00D9A5]">{item.time}</span>
                                <ChevronDown className={cn(
                                  "w-4 h-4 text-white/20 transition-transform duration-300",
                                  expandedNews === i && "rotate-180"
                                )} />
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                {item.countdown && (
                                  <span className={cn(
                                    "text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm",
                                    item.countdown === 'Uscito' ? "text-[#00D9A5] bg-[#00D9A5]/5" : "text-yellow-400/70 bg-yellow-400/5"
                                  )}>{item.countdown}</span>
                                )}
                                <span className="text-[12px] font-bold text-white/40">{item.currency || 'USD'}</span>
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  item.impact === 'high' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" : "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]"
                                )} />
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-medium text-white/25">
                                {item.actual && <span>A: <span className="text-[#00D9A5] font-bold">{item.actual}</span></span>}
                                {item.forecast && <span className="text-white/40">F: {item.forecast}</span>}
                                {item.previous && <span className="text-white/40">P: {item.previous}</span>}
                              </div>
                            </div>

                            <AnimatePresence>
                              {expandedNews === i && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="pt-3 mt-3 border-t border-white/5">
                                    <p className="text-sm text-white/50 leading-relaxed italic">
                                      {item.summary || 'Nessun dettaglio aggiuntivo.'}
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sintesi News Box */}
          <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-[#00D9A5]" />
              <h5 className="text-[12px] font-bold text-white/60 uppercase tracking-widest">Sintesi News</h5>
            </div>
            <ul className="space-y-1.5 text-[13px] text-white/50 leading-relaxed">
              {(newsSummaries?.three_hour || "Nessun riassunto disponibile.")
                .split('.')
                .filter(Boolean)
                .slice(0, 3)
                .map((line, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#00D9A5]">•</span>
                    <span>{line.trim()}.</span>
                  </li>
                ))}
            </ul>
          </div>
        </TechCard>
      </div >
    </div >
  );
};

// Market Sessions Clock Widget
const MarketSessionsClock = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getSessionStatus = (tz, openHour, closeHour) => {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });
    const parts = formatter.formatToParts(now);

    // Safely extract hr/min defaulting to 0
    const hrPart = parts.find(p => p.type === 'hour');
    const minPart = parts.find(p => p.type === 'minute');
    const hr = hrPart ? parseInt(hrPart.value, 10) : 0;
    const min = minPart ? parseInt(minPart.value, 10) : 0;

    const parsedHr = hr === 24 ? 0 : hr;
    const currentHourFloat = parsedHr + min / 60;

    const localTimeFormatted = `${parsedHr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
    const dayName = dayFormatter.format(now);
    const isWeekend = dayName === 'Sat' || dayName === 'Sun';

    const isOpen = !isWeekend && currentHourFloat >= openHour && currentHourFloat < closeHour;

    let countdownMsg = '';
    let isOpeningSoon = false;
    let isClosingSoon = false;

    if (isWeekend) {
      countdownMsg = 'Chiuso (Weekend)';
    } else if (isOpen) {
      const remaining = closeHour - currentHourFloat;
      const h = Math.floor(remaining);
      const m = Math.floor((remaining - h) * 60);
      countdownMsg = `Chiusura ${h}h ${m}m`;
      if (h === 0) isClosingSoon = true;
    } else {
      let remaining = openHour - currentHourFloat;
      if (remaining < 0) remaining += 24;
      const h = Math.floor(remaining);
      const m = Math.floor((remaining - h) * 60);
      countdownMsg = `Apertura ${h}h ${m}m`;
      if (h === 0) isOpeningSoon = true;
    }

    return { localTime: localTimeFormatted, isOpen, countdownMsg, isOpeningSoon, isClosingSoon };
  };

  const sessionsConfig = [
    { name: 'Sydney', tz: 'Australia/Sydney', open: 10, close: 16 },
    { name: 'Tokyo', tz: 'Asia/Tokyo', open: 9, close: 15 },
    { name: 'London', tz: 'Europe/London', open: 8, close: 16.5 },
    { name: 'New York', tz: 'America/New_York', open: 9.5, close: 16 }
  ];

  const sessions = sessionsConfig.map(s => ({
    name: s.name,
    ...getSessionStatus(s.tz, s.open, s.close)
  }));

  return (
    <div className="hidden xl:flex items-center justify-center flex-1 gap-2 xl:gap-8 px-4 overflow-hidden border-x border-slate-200 dark:border-white/10 mx-4 font-apple">
      {sessions.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center justify-center tracking-tight">
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", s.isOpen ? "bg-[#00D9A5] shadow-[0_0_8px_rgba(0,217,165,0.6)]" : "bg-white/20")} />
              <span className="text-[18px] font-medium text-white/60">{s.name}</span>
              <span className="text-[19px] font-semibold tabular-nums text-slate-800 dark:text-white/95">{s.localTime}</span>
            </div>
            <span className={cn(
              "text-[13px] font-medium mt-0.5",
              s.isOpen ? (s.isClosingSoon ? "text-yellow-400" : "text-[#00D9A5]/90") : (s.isOpeningSoon ? "text-yellow-400" : "text-white/50")
            )}>
              {s.countdownMsg}
            </span>
          </div>
          {i < sessions.length - 1 && (
            <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-white/10" />
          )}
        </React.Fragment>
      ))}
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

  // Unified detail content
  const details = {
    overview: {
      title: 'Macro Synthesis',
      interpretation: (() => {
        if (overallBias === 'BULLISH' && (regime === 'risk-on' || !regime) && vix?.current <= 18) {
          return 'Ambiente "Goldilocks": trend rialzista solido con bassa volatilità e propensione al rischio confermata. Condizioni ideali per strategie trend-following ed accumulated positions.';
        }
        if (overallBias === 'BEARISH' && regime === 'risk-off' && vix?.current > 20) {
          return 'Discesa recessiva / risk-off evidente confermato dal rialzo del VIX e bias orso massivo. Privilegiare liquidità o short su rimbalzo/rotture di supporto.';
        }
        if (overallBias === 'BULLISH' && vix?.current > 20) {
          return 'Rialzo nervoso: trend rialzista ma accompagnato da alta volatilità (VIX elevato). Possibili spike intra-day aggressivi, operare con size ridotta e stop larghi.';
        }
        if (regime === 'risk-off' && overallBias !== 'BEARISH') {
          return 'Settori in rotazione difensiva: il mercato inizia a favorire i beni rifugio, ma la struttura di prezzo non è ancora ribassista a livello primario. Probabile lateralità distributiva.';
        }
        return 'Contesto misto o neutrale: le forze macro-direzionali non sono del tutto allineate. Consigliabile trading intraday, scaling down e selezione iper-dettagliata dei setup ottimali della sessione.';
      })()
    }
  };

  // Plan badge styling mapping
  const planColors = {
    'pro': { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-500', icon: Crown },
    'plus': { border: 'border-[#00D9A5]/30', bg: 'bg-[#00D9A5]/10', text: 'text-[#00D9A5]', icon: Zap },
    'essential': { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-500', icon: Shield },
    'free': { border: 'border-slate-500/30', bg: 'bg-slate-500/10', text: 'text-slate-400', icon: Activity }
  };

  const planNameMap = { 'Essential': 'Standard', 'Plus': 'Pro', 'Pro': 'Elite' };
  const rawPlanName = subscription?.plan_name || 'Free Trader';
  const planName = planNameMap[rawPlanName] || rawPlanName;
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
        {/* Unified Market Overview Button with Absolute Overlay */}
        <div className="flex flex-nowrap items-center gap-1 sm:gap-3 relative z-[150]">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              toggleItem('overview');
            }}
            className={cn(
              "dashboard-overview-tab flex items-center gap-2 sm:gap-4 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl transition-all cursor-pointer",
              expandedItem === 'overview' ? "bg-slate-100 ring-1 ring-slate-300 dark:bg-white/10 dark:ring-[#00D9A5]/50 tab-border-highlight shadow-[0_0_15px_rgba(0,217,165,0.08)]" : "hover:bg-slate-100 dark:hover:bg-white/5"
            )}
          >
            <div className="p-1 sm:p-1.5 bg-[#00D9A5]/10 rounded-lg">
              <Activity className="w-3 h-3 sm:w-5 sm:h-5 text-[#00D9A5]" />
            </div>
            <div className="flex flex-col items-start gap-0.5 sm:gap-1.5">
              <span className="text-[10px] sm:text-[13px] text-slate-500 dark:text-white/60 font-bold tracking-[0.18em] uppercase leading-none mt-0.5" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif' }}>Market Overview</span>
              <div className="flex items-center gap-2 sm:gap-4 text-[12px] sm:text-base font-black leading-none mb-0.5" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif' }}>
                <span className={overallBias === 'BULLISH' ? "text-[#00D9A5]" : overallBias === 'BEARISH' ? "text-red-400" : "text-yellow-400"}>{overallBias}</span>
                <span className="text-white/20">•</span>
                <span className={vix?.current > 22 ? "text-red-400" : vix?.current > 18 ? "text-yellow-400" : "text-[#00D9A5]"}>VIX {vix?.current || '-'}</span>
                <span className="text-white/20">•</span>
                <span className={regime === 'risk-off' ? "text-red-400" : regime === 'risk-on' ? "text-[#00D9A5]" : "text-yellow-400"}>{regime?.toUpperCase() || '-'}</span>
              </div>
            </div>
            <ChevronDown className={cn(
              "w-3 h-3 sm:w-4 sm:h-4 text-slate-400 dark:text-white/40 transition-transform ml-1 sm:ml-2",
              expandedItem === 'overview' && "rotate-180 text-[#00D9A5]"
            )} />
          </button>

          {/* Absolute Expanded Details Panel - Overlay style */}
          <AnimatePresence>
            {expandedItem && details[expandedItem] && (
              <motion.div
                initial={dashboardInitial({ opacity: 0, scale: 0, y: -20 })}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0, y: -20 }}
                transition={{
                  type: "spring",
                  stiffness: 350,
                  damping: 25,
                  mass: 0.6
                }}
                style={{ transformOrigin: 'top left', wheelChange: 'transform, opacity, filter' }}
                className="absolute top-[calc(100%+12px)] left-0 z-[200] w-[320px] sm:w-[500px]"
              >
                <div className="relative p-7 bg-[#000000] border-2 border-[#00D9A5]/60 rounded-[24px] shadow-[0_40px_150px_rgba(0,0,0,1)] font-apple flex flex-col gap-4">
                  <h4 className="text-[16px] sm:text-[18px] font-bold text-yellow-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-1 font-apple" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif' }}>
                    <Sparkles className="w-5 h-5" /> {details[expandedItem].title}
                  </h4>

                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 shadow-inner">
                    <p className="text-[17px] sm:text-[20px] text-white leading-relaxed font-bold font-apple">
                      {details[expandedItem].interpretation}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Center: Live Market Sessions */}
        <MarketSessionsClock />

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
            initial={dashboardInitial({ opacity: 0, scale: 0.9 })}
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
  const [marketBreadth, setMarketBreadth] = useState(null);
  const [optionsFlowData, setOptionsFlowData] = useState(null);
  const [strategyProjections, setStrategyProjections] = useState([]);
  const [strategiesCatalog, setStrategiesCatalog] = useState([]);
  const [newsBriefing, setNewsBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favoriteCharts, setFavoriteCharts] = useState(['XAUUSD']);
  const [favoriteCOT, setFavoriteCOT] = useState(['NAS100', 'SP500']);
  const [optionsSelectedAsset, setOptionsSelectedAsset] = useState('XAUUSD');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const playIntro = !isSmallMobile && !hasPlayedDashboardIntro;
  const cotReleaseKeyRef = useRef(null);
  const matrixSnapshotSignatureRef = useRef({});

  // Typewriter animation state
  const [introPhase, setIntroPhase] = useState(() => (playIntro ? 'typing' : 'done')); // 'typing' | 'visible' | 'done'
  const [typedChars, setTypedChars] = useState(0);
  const [headerHidden, setHeaderHidden] = useState(() => !playIntro);
  const biasBarRef = useRef(null);

  useEffect(() => {
    if (hasPlayedDashboardEntryMotion) return;
    hasPlayedDashboardEntryMotion = true;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      const [multiRes, engineRes, strategyRes, strategyCatalogRes, newsRes, optionsFlowRes] = await Promise.all([
        axios.get(`${API}/analysis/multi-source`),
        axios.get(`${API}/engine/cards`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/strategy/projections`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/strategy/catalog`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/news/briefing`, { headers: authHeader }).catch(() => ({ data: null })),
        axios.get(`${API}/market/options-flow`, { headers: authHeader }).catch(() => ({ data: null })),
      ]);

      setMultiSourceData(multiRes.data);
      setEngineData(Array.isArray(engineRes.data) ? engineRes.data : []);
      setStrategiesCatalog(Array.isArray(strategyCatalogRes.data?.strategies) ? strategyCatalogRes.data.strategies : []);
      setStrategyProjections(Array.isArray(strategyRes.data?.projections) ? strategyRes.data.projections : []);

      const directNews = newsRes.data || null;
      const fallbackNews = strategyRes.data?.events ? strategyRes.data : null;
      setNewsBriefing(directNews || fallbackNews);
      setOptionsFlowData(optionsFlowRes?.data?.data || null);

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, DASHBOARD_FETCH_INTERVALS_MS.core);
    return () => clearInterval(interval);
  }, [fetchData]);

  const fetchCotData = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/cot/data`);
      const payload = response?.data;
      if (!payload || typeof payload !== 'object') return;
      const nextReleaseKey = getCotReleaseKey(payload) || 'unknown-release';
      cotReleaseKeyRef.current = nextReleaseKey;
      setCotSummary(payload);
    } catch (error) {
      console.error('Error fetching COT data:', error);
    }
  }, []);

  useEffect(() => {
    fetchCotData();
    const interval = setInterval(fetchCotData, DASHBOARD_FETCH_INTERVALS_MS.cot);
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
    const interval = setInterval(fetchLivePrices, DASHBOARD_FETCH_INTERVALS_MS.livePrices);
    return () => clearInterval(interval);
  }, [fetchLivePrices]);

  const fetchMarketBreadth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/market/breadth`);
      if (response?.data && typeof response.data === 'object') {
        setMarketBreadth(response.data);
      }
    } catch (error) {
      console.error('Error fetching market breadth:', error);
    }
  }, []);

  useEffect(() => {
    fetchMarketBreadth();
    const interval = setInterval(fetchMarketBreadth, DASHBOARD_FETCH_INTERVALS_MS.marketBreadth);
    return () => clearInterval(interval);
  }, [fetchMarketBreadth]);

  // --- FORENSICS 2.0: MATRIX TELEMETRY (every 5m, multi-asset update-only) ---
  useEffect(() => {
    const normalizeBias = (raw, fallback = 'NEUTRAL') => {
      const val = String(raw || fallback).toUpperCase();
      if (val.includes('BULL')) return 'BULLISH';
      if (val.includes('BEAR')) return 'BEARISH';
      if (val.includes('RISK_ON')) return 'BULLISH';
      if (val.includes('RISK_OFF')) return 'BEARISH';
      return 'NEUTRAL';
    };

    const normalizeDirection = (raw) => {
      const val = String(raw || '').toUpperCase();
      if (val.includes('DOWN') || val.includes('BEAR')) return 'DOWN';
      return 'UP';
    };

    const broadcastMatrixSnapshot = async () => {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const vixLevel = Number(multiSourceData?.vix?.current ?? livePrices.VIX?.price ?? 15);
      const marketRegime = String(multiSourceData?.regime || 'neutral').toLowerCase();
      const riskBias = (vixLevel >= 24 || marketRegime === 'risk-off')
        ? 'HIGH_RISK'
        : (vixLevel <= 16 && marketRegime === 'risk-on')
          ? 'LOW_RISK'
          : 'MEDIUM_RISK';

      const candidateSymbols = Array.from(new Set([
        ...(engineData || []).map((a) => a?.asset || a?.symbol).filter(Boolean),
        ...(favoriteCharts || [])
      ]));
      if (candidateSymbols.length === 0) return;

      for (const symbol of candidateSymbols) {
        const assetEngineData = (engineData || []).find((a) => (a?.asset || a?.symbol) === symbol) || {};
        const breadthNode = marketBreadth?.indices?.[symbol];
        const aboveMa50Pct = breadthNode?.above_ma50?.pct;
        const aboveMa200Pct = breadthNode?.above_ma200?.pct;
        const breadthThresholds = resolveBreadthThresholds(marketBreadth);
        const screeningBias = deriveBreadthBias(breadthNode, breadthThresholds);

        const cotBiasLive = cotSummary?.data?.[symbol]?.bias;
        const cotBias = normalizeBias(cotBiasLive, STAT_BIAS[symbol]?.weekly_bias || 'NEUTRAL');
        const optionsBias = normalizeBias(optionsFlowData?.[symbol]?.bias || 'NEUTRAL');
        const newsBias = normalizeBias(newsBriefing?.sentiment || 'NEUTRAL');
        const marketBias = normalizeBias(multiSourceData?.regime || 'NEUTRAL');
        const technicalBias = normalizeBias(
          assetEngineData.direction || assetEngineData.impulse || assetEngineData.bias || 'NEUTRAL'
        );
        const direction = normalizeDirection(assetEngineData.direction);
        const entryPrice = parseFloat(assetEngineData.price);
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) continue;

        const contextVector = {
          cot_bias: cotBias,
          crowding: assetEngineData.crowding,
          squeeze_risk: assetEngineData.squeezeRisk,
          confidence: assetEngineData.confidence,
          volatility: vixLevel,
          options_bias: optionsBias,
          macro_sentiment: newsBias,
          news_bias: newsBias,
          market_regime: marketBias,
          risk_bias: riskBias,
          technical_bias: technicalBias,
          screening_bias: screeningBias,
          screening_regime: breadthNode?.breadth_regime || 'unknown',
          screening_above_ma50_pct: typeof aboveMa50Pct === 'number' ? aboveMa50Pct : null,
          screening_above_ma200_pct: typeof aboveMa200Pct === 'number' ? aboveMa200Pct : null,
          time_elapsed_since_open: new Date().getHours()
        };

        const snapshotPayload = {
          asset: symbol,
          direction,
          entry_price: entryPrice,
          context: contextVector
        };
        const candidateSignature = JSON.stringify(snapshotPayload);
        if (matrixSnapshotSignatureRef.current[symbol] === candidateSignature) {
          continue;
        }

        try {
          await axios.post(`${API}/research/matrix-snapshot`, snapshotPayload, { headers: authHeader });
          matrixSnapshotSignatureRef.current[symbol] = candidateSignature;
          console.log(`📡 [MATRIX] Snapshot ${symbol} | ${screeningBias} | ${riskBias}`);
        } catch (err) {
          console.warn(`Matrix Telemetry broadcast failed for ${symbol}`, err);
        }
      }
    };

    // Broadcast immediately if data exists, then every 5 minutes.
    // Dedup logic prevents overlap/noisy duplicates.
    if (engineData?.length > 0) {
      broadcastMatrixSnapshot();
    }
    const interval = setInterval(broadcastMatrixSnapshot, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [engineData, favoriteCharts, newsBriefing, livePrices, marketBreadth, multiSourceData, cotSummary, optionsFlowData]);



  const { analyses, vix, regime, next_event } = multiSourceData || {};

  const analysesData = analyses || {};

  // Build assets array for chart tabs (no VIX)
  const assetsList = useMemo(() => Object.entries(analysesData).map(([symbol, data]) => {
    const safeData = data && typeof data === 'object' ? data : {};
    // Find engine data for this symbol
    const assetEngineData = engineData?.find((card) => card?.asset === symbol || card?.symbol === symbol);
    const live = livePrices?.[symbol];

    return {
      symbol,
      analysisPrice: safeData.price,
      analysisChange: safeData.change ?? 0,
      price: live?.price ?? safeData.price,
      change: live?.change ?? safeData.change ?? 0,
      direction: assetEngineData?.direction === 'UP' ? 'Up' : assetEngineData?.direction === 'DOWN' ? 'Down' : safeData.direction,
      confidence: assetEngineData?.probability ?? safeData.confidence,
      impulse: assetEngineData?.impulse ?? safeData.impulse,
      explanation: Array.isArray(safeData.drivers) ? safeData.drivers.map((d) => `${d?.name}: ${d?.impact}`).join('. ') : '',
      scores: assetEngineData?.scores || {},
      drivers: assetEngineData?.drivers || [],
      discretionaryContext: assetEngineData?.discretionary_context || null,
      atr: assetEngineData?.atr,
      dayChangePoints: assetEngineData?.day_change_points,
      dayChangePct: assetEngineData?.day_change_pct,
      monthChangePoints: assetEngineData?.month_change_points,
      monthChangePct: assetEngineData?.month_change_pct,
      sparkData: [30, 35, 28, 42, 38, 55, 48, 52]
    };
  }), [analysesData, engineData, livePrices]);

  const cotDataToUse = cotSummary?.data && Object.keys(cotSummary.data).length > 0
    ? cotSummary
    : { data: {} };
  const handleSyncAsset = useCallback((symbol) => {
    // Sync COT Favorites
    if (cotDataToUse?.data?.[symbol]) {
      setFavoriteCOT(prev => [symbol, ...prev.filter(s => s !== symbol)].slice(0, 3));
    }
    // Sync Options Asset
    setOptionsSelectedAsset(symbol);
  }, [cotDataToUse]);

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
      hasPlayedDashboardIntro = true;
      if (biasBarRef.current) {
        const rect = biasBarRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        const needsScroll = rect.top < 0 || rect.bottom > viewportH;
        if (needsScroll) {
          biasBarRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
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
    <div className="dashboard-page max-sm:px-2" data-testid="dashboard-page" id="dashboard-main" style={{ zoom: 0.98 }}>
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
        className="mb-3 sm:mb-6 max-sm:sticky relative z-[100]"
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
      <div className="xl:overflow-x-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-4 lg:mr-2 lg:items-start xl:min-w-[1500px]">
          {/* CENTER: Charts + COT + Market Breadth */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-start lg:gap-4">
              <AssetChartPanel
                assets={assetsList}
                favoriteCharts={favoriteCharts}
                onFavoriteChange={setFavoriteCharts}
                animationsReady={headerHidden}
                onSyncAsset={handleSyncAsset}
                vix={vix}
                regime={regime}
                cotData={cotDataToUse}
                breadthData={marketBreadth}
                optionsData={optionsFlowData}
                newsEvents={newsBriefing?.events}
                newsSentiment={newsBriefing?.sentiment}
                nextEvent={next_event}
                className="lg:w-[calc(44%+1px)]"
              />
              <div className="lg:w-[calc(40%+1px)] lg:-ml-[4px]">
                <GammaExposurePanel
                  selectedAsset={optionsSelectedAsset}
                  onAssetChange={setOptionsSelectedAsset}
                  optionsData={optionsFlowData}
                  compact
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-start lg:gap-4">
              <div className="lg:w-[44%]">
                <COTPanel cotData={cotDataToUse} favoriteCOT={favoriteCOT} onFavoriteCOTChange={setFavoriteCOT} animationsReady={headerHidden} />
              </div>
              <div className="lg:w-[calc(40%+3px)] lg:-ml-[3px]">
                <OptionsPanel
                  animationsReady={headerHidden}
                  selectedAsset={optionsSelectedAsset}
                  onAssetChange={setOptionsSelectedAsset}
                  optionsData={optionsFlowData}
                  className="lg:mt-0"
                />
              </div>
            </div>
          </div>

          {/* GEX Column (left of News) */}
          <div className="lg:col-span-2 self-start space-y-4 lg:w-[134%] lg:-ml-[32%] lg:pr-0 lg:mr-[2px] xl:w-[148%] xl:-ml-[62%] xl:pr-2 xl:mr-[10px]">
            <div className="relative">
              <div className="space-y-4">
                <FearGreedPanel
                  analyses={analysesData}
                  vix={vix || { current: 17.62, change: -0.96 }}
                  regime={regime || 'risk-on'}
                  compact
                />
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <MarketBreadthPanel breadthData={marketBreadth} vix={vix} className="lg:w-full lg:mt-[1px]" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR: News + Activity + Strategies */}
          <div className="lg:col-span-2 lg:pl-0">
            <ActivitySidebar
              news={newsBriefing?.events}
              newsSummaries={newsBriefing?.summaries}
              strategiesProjections={strategyProjections}
              strategiesCatalog={strategiesCatalog}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
