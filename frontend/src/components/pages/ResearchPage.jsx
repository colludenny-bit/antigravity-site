import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Microscope,
    UploadCloud,
    BrainCircuit,
    Activity,
    TrendingUp,
    TrendingDown,
    Minus,
    FileText,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    Info,
    ChevronDown,
    ChevronUp,
    Loader2,
    Zap,
    BarChart3,
    Globe,
    Shield,
    Database,
    ArrowRight,
    LayoutDashboard,
    Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TechCard } from '../ui/TechCard';

const BACKEND_URL_RAW = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '');
const IS_LOCAL_HOST = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SAFE_BACKEND_URL = !IS_LOCAL_HOST && /localhost|127\.0\.0\.1/.test(BACKEND_URL_RAW) ? '' : BACKEND_URL_RAW;
const API = (() => {
    const envBase = (SAFE_BACKEND_URL).trim().replace(/\/$/, '');
    if (envBase) return `${envBase}/api`;
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        return 'http://localhost:8000/api';
    }
    return '/api';
})();

function getToken() {
    return localStorage.getItem('token');
}

async function apiFetch(endpoint) {
    const res = await fetch(`${API}${endpoint}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function apiPost(endpoint) {
    const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

export default function ResearchPage() {
    // ─── State ───
    const [sources, setSources] = useState([]);
    const [vaultDocs, setVaultDocs] = useState([]);
    const [accuracy, setAccuracy] = useState(null);
    const [stats, setStats] = useState(null);
    const [matrixData, setMatrixData] = useState(null);
    const [deepResearch, setDeepResearch] = useState(null);
    const [sessionsData, setSessionsData] = useState(null);
    const [smartMoneyData, setSmartMoneyData] = useState(null);

    // UI State
    const [activeTab, setActiveTab] = useState('overview'); // overview, ingestion, forensics, deepResearch
    const [deepResearchTab, setDeepResearchTab] = useState('signals');
    const [forensicsSubTab, setForensicsSubTab] = useState('matrix');
    const [matrixMode, setMatrixMode] = useState('overview');
    const [triggering, setTriggering] = useState(false);
    const [triggerResult, setTriggerResult] = useState(null);
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [selectedBankReportId, setSelectedBankReportId] = useState(null);
    const [smartRadarRefreshing, setSmartRadarRefreshing] = useState(false);
    const [smartRadarFilterSignal, setSmartRadarFilterSignal] = useState('ALL');
    const [smartRadarFilterTheme, setSmartRadarFilterTheme] = useState('ALL');
    const [smartRadarMinConviction, setSmartRadarMinConviction] = useState(0);
    const [radarDetailModal, setRadarDetailModal] = useState(null);

    // ─── Data Fetching ───
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [src, vault, acc, st, mtx, deep, sessions, smartMoney] = await Promise.allSettled([
                apiFetch('/research/sources'),
                apiFetch('/research/vault'),
                apiFetch('/research/accuracy'),
                apiFetch('/research/stats'),
                apiFetch('/research/matrix'),
                apiFetch('/research/deep-research'),
                apiFetch('/research/sessions'),
                apiFetch('/research/smart-money')
            ]);
            if (src.status === 'fulfilled') setSources(src.value);
            if (vault.status === 'fulfilled') setVaultDocs(vault.value);
            if (acc.status === 'fulfilled') setAccuracy(acc.value);
            if (st.status === 'fulfilled') setStats(st.value);
            if (mtx.status === 'fulfilled') setMatrixData(mtx.value);
            if (deep.status === 'fulfilled') setDeepResearch(deep.value);
            if (sessions.status === 'fulfilled') setSessionsData(sessions.value);
            if (smartMoney.status === 'fulfilled') setSmartMoneyData(smartMoney.value);
        } catch (e) {
            console.error('Research fetch error:', e);
        }
        setLoading(false);
    }, []);

    const fetchSmartRadar = useCallback(async (withLoading = false) => {
        if (withLoading) setSmartRadarRefreshing(true);
        try {
            const data = await apiFetch('/research/smart-money');
            setSmartMoneyData(data);
        } catch (e) {
            console.error('Smart radar fetch error:', e);
        } finally {
            if (withLoading) setSmartRadarRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        if (activeTab !== 'forensics' || forensicsSubTab !== 'sessioni') return;
        apiFetch('/research/sessions')
            .then((data) => setSessionsData(data))
            .catch(() => null);
    }, [activeTab, forensicsSubTab]);

    useEffect(() => {
        if (activeTab !== 'deepResearch') return;
        Promise.allSettled([
            apiFetch('/research/deep-research'),
            apiFetch('/research/smart-money')
        ]).then(([deep, smart]) => {
            if (deep.status === 'fulfilled') setDeepResearch(deep.value);
            if (smart.status === 'fulfilled') setSmartMoneyData(smart.value);
        }).catch(() => null);
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== 'deepResearch' || deepResearchTab !== 'smartMoney') return;
        const interval = setInterval(() => {
            fetchSmartRadar(false);
        }, 90000);
        return () => clearInterval(interval);
    }, [activeTab, deepResearchTab, fetchSmartRadar]);

    // ─── Trigger Handler ───
    const handleTrigger = async () => {
        setTriggering(true);
        setTriggerResult(null);
        try {
            const result = await apiPost('/research/trigger');
            setTriggerResult(result);
            setTimeout(fetchAll, 2000);
        } catch (e) {
            setTriggerResult({ status: 'error', message: e.message });
        }
        setTriggering(false);
    };

    // ─── Helpers ───
    const getHeatmapColor = (score) => {
        if (score === null || score === undefined) return 'bg-white/5 text-white/30';
        if (score >= 80) return 'bg-[#00D9A5]/80 text-white';
        if (score >= 60) return 'bg-[#00D9A5]/40 text-white/80';
        if (score >= 40) return 'bg-yellow-500/40 text-white/80';
        return 'bg-red-500/40 text-white/80';
    };

    const statusBadge = (status) => {
        const map = {
            SYNCED: { color: 'text-[#00D9A5] border-[#00D9A5]/30 bg-[#00D9A5]/10', dot: 'bg-[#00D9A5]', label: 'Sincronizzato' },
            RUNNING: { color: 'text-blue-400 border-blue-400/30 bg-blue-400/10', dot: 'bg-blue-400 animate-pulse', label: 'In Corso...' },
            ERROR: { color: 'text-red-400 border-red-400/30 bg-red-400/10', dot: 'bg-red-400', label: 'Errore' },
            IDLE: { color: 'text-white/80 border-white/10 bg-white/5', dot: 'bg-white/30', label: 'In Attesa' },
        };
        return map[status] || map.IDLE;
    };

    const biasStyle = (bias) => {
        const tone = String(bias || 'NEUTRAL').toUpperCase();
        if (tone.includes('BULL') || tone.includes('RISK_ON') || tone.includes('DOVISH')) {
            return 'text-[#00D9A5] bg-[#00D9A5]/10 border-[#00D9A5]/30';
        }
        if (tone.includes('BEAR') || tone.includes('RISK_OFF') || tone.includes('HAWKISH')) {
            return 'text-red-400 bg-red-500/10 border-red-500/30';
        }
        return 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30';
    };

    const fmtPct = (value, digits = 2) => {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';
    };

    const parseMetricNumber = (value) => {
        const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    };

    const fmtNum = (value, digits = 2) => {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(digits) : '—';
    };

    const fmtSigned = (value, digits = 2, suffix = '') => {
        const n = Number(value);
        if (!Number.isFinite(n)) return '—';
        const body = `${Math.abs(n).toFixed(digits)}${suffix}`;
        return n > 0 ? `+${body}` : n < 0 ? `-${body}` : `0${suffix}`;
    };

    const pct01 = (value, digits = 1) => {
        const n = Number(value);
        return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '—';
    };

    const weekdayLabel = (idx) => {
        const map = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const i = Number(idx);
        return Number.isFinite(i) && map[i] ? map[i] : 'N/A';
    };

    const sessionsRows = Array.isArray(sessionsData?.daily_report?.rows) ? sessionsData.daily_report.rows : [];
    const sessionsSummary = sessionsData?.daily_report?.summary || {};
    const sessionsInsights = Array.isArray(sessionsData?.auto_analysis?.insights) ? sessionsData.auto_analysis.insights : [];
    const sessionsWeightUpdates = Array.isArray(sessionsData?.auto_analysis?.weight_updates) ? sessionsData.auto_analysis.weight_updates : [];
    const sessionsCorrPrimary = Array.isArray(sessionsData?.correlation_matrix?.primary) ? sessionsData.correlation_matrix.primary : [];
    const sessionsCorrExtra = Array.isArray(sessionsData?.correlation_matrix?.extra) ? sessionsData.correlation_matrix.extra : [];
    const sessionsScenarioWeekday = sessionsData?.matrices?.scenario_weekday || { days: [], rows: [] };
    const sessionsBiasAsset = sessionsData?.matrices?.bias_asset || { assets: [], rows: [] };
    const sessionsHealth = sessionsData?.health_score || {};
    const sessionsKsh = Number(sessionsHealth?.value) || 0;
    const sessionsKshSpark = Array.isArray(sessionsHealth?.sparkline) ? sessionsHealth.sparkline : [];
    const sessionsCorrelationRatio = Number(sessionsData?.correlation_matrix?.significant_ratio ?? 0);
    const sessionsHistorical = sessionsData?.historical_stats || {};
    const sessionsHistWindows = sessionsHistorical?.windows || {};
    const sessionsHistTrend = Array.isArray(sessionsHistorical?.daily_trend) ? sessionsHistorical.daily_trend : [];
    const sessionsScenarioBoard = Array.isArray(sessionsHistorical?.scenario_leaderboard) ? sessionsHistorical.scenario_leaderboard : [];
    const sessionsAssetBoard = Array.isArray(sessionsHistorical?.asset_leaderboard) ? sessionsHistorical.asset_leaderboard : [];
    const sessionsPlaybook = sessionsData?.operational_playbook || {};
    const sessionsPlaybookToday = Array.isArray(sessionsPlaybook?.today) ? sessionsPlaybook.today : [];
    const sessionsPlaybookWeek = Array.isArray(sessionsPlaybook?.week) ? sessionsPlaybook.week : [];
    const sessionsPlaybookMonth = Array.isArray(sessionsPlaybook?.month) ? sessionsPlaybook.month : [];
    const sessionsHasHistorical = (
        Object.keys(sessionsHistWindows || {}).length > 0
        || sessionsScenarioBoard.length > 0
        || sessionsAssetBoard.length > 0
        || sessionsHistTrend.length > 0
    );
    const smartSummary = smartMoneyData?.summary || {};
    const smartMacro = smartMoneyData?.macro_filter || {};
    const smartMacroScores = smartMacro?.scores || {};
    const smartThemes = Array.isArray(smartMoneyData?.theme_scores) ? smartMoneyData.theme_scores : [];
    const smartUoa = Array.isArray(smartMoneyData?.uoa_watchlist) ? smartMoneyData.uoa_watchlist : [];
    const smartCrossFlags = Array.isArray(smartMoneyData?.cross_asset_flags) ? smartMoneyData.cross_asset_flags : [];
    const smartCrossActive = smartCrossFlags.filter((f) => Boolean(f?.active));
    const smartLagRows = Array.isArray(smartMoneyData?.news_lag_model?.by_theme) ? smartMoneyData.news_lag_model.by_theme : [];
    const smartDataQuality = smartMoneyData?.data_quality || {};
    const smartExplainability = smartMoneyData?.explainability || {};
    const smartExplainRows = Array.isArray(smartExplainability?.top_themes) ? smartExplainability.top_themes : [];
    const smartLayerMix = smartExplainability?.global_layer_mix || {};
    const smartRegimeTimeline = smartMoneyData?.regime_timeline || {};
    const smartRegimeRows = Array.isArray(smartRegimeTimeline?.rows) ? smartRegimeTimeline.rows : [];
    const smartRegimeSummary = smartRegimeTimeline?.summary || {};
    const smartAlerts = smartMoneyData?.alert_engine || {};
    const smartAlertsRows = Array.isArray(smartAlerts?.alerts) ? smartAlerts.alerts : [];
    const smartValidation = smartMoneyData?.validation_lab || {};
    const smartValidationRows = Array.isArray(smartValidation?.rows) ? smartValidation.rows : [];
    const smartDrilldown = smartMoneyData?.theme_drilldown || {};
    const smartDrilldownThemes = Array.isArray(smartDrilldown?.themes) ? smartDrilldown.themes : [];
    const smartMacroEventOverlay = smartMoneyData?.macro_event_overlay || {};
    const smartMacroEvents = Array.isArray(smartMacroEventOverlay?.upcoming_events) ? smartMacroEventOverlay.upcoming_events : [];
    const smartLeadLagRadar = smartMoneyData?.lead_lag_radar || {};
    const smartLeadLagRows = Array.isArray(smartLeadLagRadar?.rows) ? smartLeadLagRadar.rows : [];
    const smartSignalDecay = smartMoneyData?.signal_decay_monitor || {};
    const smartSignalDecayRows = Array.isArray(smartSignalDecay?.rows) ? smartSignalDecay.rows : [];
    const smartRegimeSwitch = smartMoneyData?.regime_switch_detector || {};
    const smartRegimeSwitchRows = Array.isArray(smartRegimeSwitch?.recent_flips) ? smartRegimeSwitch.recent_flips : [];
    const smartCounterfactualLab = smartMoneyData?.counterfactual_lab || {};
    const smartCounterfactualRows = Array.isArray(smartCounterfactualLab?.rows) ? smartCounterfactualLab.rows : [];
    const smartExecutionRisk = smartMoneyData?.execution_risk_overlay || {};
    const smartExecutionRows = Array.isArray(smartExecutionRisk?.rows) ? smartExecutionRisk.rows : [];
    const smartNarrativeMeter = smartMoneyData?.narrative_saturation_meter || {};
    const smartNarrativeRows = Array.isArray(smartNarrativeMeter?.rows) ? smartNarrativeMeter.rows : [];
    const smartHistorical10y = smartMoneyData?.historical_analysis_10y || {};
    const smartHistoricalThemeRows = Array.isArray(smartHistorical10y?.theme_rows) ? smartHistorical10y.theme_rows : [];
    const smartHistoricalCorrRows = Array.isArray(smartHistorical10y?.cross_asset_correlation) ? smartHistorical10y.cross_asset_correlation : [];
    const smartHistoricalTestRows = Array.isArray(smartHistorical10y?.statistical_tests) ? smartHistorical10y.statistical_tests : [];
    const smartHistoricalCorrTestRows = Array.isArray(smartHistorical10y?.correlation_tests) ? smartHistorical10y.correlation_tests : [];
    const smartHistoricalLeaderboardRows = Array.isArray(smartHistorical10y?.institutional_leaderboard) ? smartHistorical10y.institutional_leaderboard : [];
    const smartHistoricalPlaybook = smartHistorical10y?.calendar_playbook || {};
    const smartHistoricalPlaybookTodayRows = Array.isArray(smartHistoricalPlaybook?.today) ? smartHistoricalPlaybook.today : [];
    const smartHistoricalPlaybookWeekRows = Array.isArray(smartHistoricalPlaybook?.week) ? smartHistoricalPlaybook.week : [];
    const smartHistoricalPlaybookMonthRows = Array.isArray(smartHistoricalPlaybook?.month) ? smartHistoricalPlaybook.month : [];
    const smartHistoricalPlaybookSummary = smartHistoricalPlaybook?.summary || {};
    const smartAggScore = Number.isFinite(Number(smartSummary?.aggressive_score))
        ? Number(smartSummary?.aggressive_score)
        : (smartThemes.length
            ? smartThemes.reduce((sum, row) => sum + (Number(row?.aggressive_score) || 0), 0) / smartThemes.length
            : null);
    const smartConsScore = Number.isFinite(Number(smartSummary?.conservative_score))
        ? Number(smartSummary?.conservative_score)
        : (smartThemes.length
            ? smartThemes.reduce((sum, row) => sum + (Number(row?.conservative_score) || 0), 0) / smartThemes.length
            : null);
    const smartBarbellScore = Number.isFinite(Number(smartSummary?.barbell_score))
        ? Number(smartSummary?.barbell_score)
        : Number(smartSummary?.global_score);
    const smartGeneratedAt = smartMoneyData?.generated_at ? new Date(smartMoneyData.generated_at) : null;
    const smartAgeMinutes = smartGeneratedAt ? Math.max(0, (Date.now() - smartGeneratedAt.getTime()) / 60000) : null;
    const smartThemeOptions = Array.from(new Set([
        ...smartThemes.map((row) => String(row?.theme || '').trim()).filter(Boolean),
        ...smartHistoricalLeaderboardRows.map((row) => String(row?.theme || '').trim()).filter(Boolean),
        ...smartHistoricalPlaybookTodayRows.map((row) => String(row?.theme || '').trim()).filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b));
    const smartThemeSet = new Set(smartThemeOptions);
    const effectiveSmartRadarFilterTheme = (
        smartRadarFilterTheme === 'ALL' || smartThemeSet.has(smartRadarFilterTheme)
    ) ? smartRadarFilterTheme : 'ALL';
    const smartSignalFilterMatch = (signal) => {
        const val = String(signal || '').toUpperCase();
        if (smartRadarFilterSignal === 'ALL') return true;
        if (smartRadarFilterSignal === 'BULLISH') return val === 'BULLISH';
        if (smartRadarFilterSignal === 'BEARISH') return val === 'BEARISH';
        if (smartRadarFilterSignal === 'NEUTRAL') return val === 'NEUTRAL';
        return true;
    };
    const smartThemeFilterMatch = (theme) => effectiveSmartRadarFilterTheme === 'ALL' || String(theme || '') === effectiveSmartRadarFilterTheme;
    const smartConvictionFilterMatch = (value) => (Number(value) || 0) >= (Number(smartRadarMinConviction) || 0);
    const smartFilteredLeaderboardRows = smartHistoricalLeaderboardRows.filter((row) => (
        smartThemeFilterMatch(row?.theme)
        && smartSignalFilterMatch(row?.today_signal)
        && smartConvictionFilterMatch(row?.conviction_score)
    ));
    const smartFilteredPlaybookTodayRows = smartHistoricalPlaybookTodayRows.filter((row) => (
        smartThemeFilterMatch(row?.theme)
        && smartSignalFilterMatch(row?.today_signal)
        && smartConvictionFilterMatch(row?.conviction_score)
    ));
    const smartFilteredPlaybookWeekRows = smartHistoricalPlaybookWeekRows.filter((row) => (
        smartThemeFilterMatch(row?.theme)
        && smartSignalFilterMatch(row?.week_signal)
        && smartConvictionFilterMatch(row?.conviction_score)
    ));
    const smartFilteredPlaybookMonthRows = smartHistoricalPlaybookMonthRows.filter((row) => (
        smartThemeFilterMatch(row?.theme)
        && smartSignalFilterMatch(row?.month_signal)
        && smartConvictionFilterMatch(row?.conviction_score)
    ));

    const matrixStateBadgeClass = (state) => {
        if (state === 'high') return 'text-[#00D9A5] bg-[#00D9A5]/10 border-[#00D9A5]/30';
        if (state === 'low') return 'text-red-400 bg-red-500/10 border-red-500/30';
        if (state === 'na') return 'text-white/50 bg-white/5 border-white/10';
        return 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30';
    };

    const matrixOverviewRows = Object.entries(matrixData || {}).flatMap(([asset, timeframes]) =>
        Object.entries(timeframes || {}).map(([tf, tfDataRaw]) => {
            const tfData = Array.isArray(tfDataRaw) ? { patterns: tfDataRaw } : (tfDataRaw || {});
            const patterns = Array.isArray(tfData.patterns) ? tfData.patterns : [];
            const best = patterns[0] || null;
            const wr = Number(best?.win_rate);
            const expectancy = Number(best?.expectancy);
            const mfe = parseMetricNumber(best?.avg_mfe);
            const mae = parseMetricNumber(best?.avg_mae);
            const efficiency = Number(best?.excursion_efficiency);
            const hasStats = Number.isFinite(wr) || Number.isFinite(expectancy) || Number.isFinite(efficiency);

            let trend = 'INSUFFICIENT';
            let trendLabel = 'Dati insufficienti';
            if (hasStats) {
                const improving = (Number.isFinite(wr) && wr >= 55) && (Number.isFinite(expectancy) ? expectancy > 0 : true);
                const worsening = (Number.isFinite(wr) && wr < 45) || (Number.isFinite(expectancy) && expectancy < 0);
                if (improving) {
                    trend = 'IMPROVING';
                    trendLabel = 'Ottimizzazione in miglioramento';
                } else if (worsening) {
                    trend = 'WORSENING';
                    trendLabel = 'Ottimizzazione in peggioramento';
                } else {
                    trend = 'FLAT';
                    trendLabel = 'Ottimizzazione stabile';
                }
            }

            return {
                asset,
                tf: tf.replace('t_', ''),
                pattern: best?.pattern || 'N/A',
                winRate: Number.isFinite(wr) ? wr : null,
                sampleSize: best?.sample_size ?? null,
                mfe,
                mae,
                expectancy: Number.isFinite(expectancy) ? expectancy : null,
                efficiency: Number.isFinite(efficiency) ? efficiency : null,
                confluenceScore: Number.isFinite(Number(best?.confluence_score)) ? Number(best?.confluence_score) : null,
                trend,
                trendLabel,
            };
        })
    );

    const computeBias = () => {
        if (!vaultDocs || vaultDocs.length === 0) return { dominant: null, bull: 0, bear: 0, neutral: 0 };
        const biases = vaultDocs.map(d => d.analysis?.bias).filter(Boolean);
        const bull = biases.filter(b => b === 'BULLISH').length;
        const bear = biases.filter(b => b === 'BEARISH').length;
        const neutral = biases.filter(b => b === 'NEUTRAL').length;
        const dominant = bull >= bear && bull >= neutral ? 'BULLISH' : bear >= bull && bear >= neutral ? 'BEARISH' : 'NEUTRAL';
        return { dominant, bull, bear, neutral };
    };

    const biasData = computeBias();

    const REPORT_NOISE_PATTERNS = [
        /terms and conditions/i,
        /official website/i,
        /cookies?/i,
        /privacy/i,
        /copyright/i,
        /welcome to/i,
        /share sensitive information/i,
        /safe(ly)? connected/i,
        /reports descriptions/i,
        /introduction and classification methodology/i,
        /\.gov websites use https/i,
        /on selection,\s*highlighted content/i,
    ];

    const REPORT_SIGNAL_PATTERNS = [
        /inflation|cpi|pce|yield|fed|ecb|policy|growth|recession|liquidity|risk|volatility|positioning|earnings|credit|spread|macro|demand|supply/i,
    ];

    const normalizeReportText = (value) => String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/[^\S\r\n]+/g, ' ')
        .trim();

    const splitReportSentences = (value) => normalizeReportText(value)
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const isNoiseSentence = (sentence) =>
        sentence.length < 35 || REPORT_NOISE_PATTERNS.some((rx) => rx.test(sentence));

    const scoreSentence = (sentence) => {
        const signalBoost = REPORT_SIGNAL_PATTERNS.some((rx) => rx.test(sentence)) ? 3 : 0;
        const lenScore = Math.min(2, Math.floor(sentence.length / 90));
        const noisePenalty = REPORT_NOISE_PATTERNS.some((rx) => rx.test(sentence)) ? -4 : 0;
        return signalBoost + lenScore + noisePenalty;
    };

    const toSignalLabel = (bias) => {
        const b = String(bias || 'NEUTRAL').toUpperCase();
        if (b.includes('BULL')) return 'Risk-On / Pro-Ciclico';
        if (b.includes('BEAR')) return 'Risk-Off / Difensivo';
        return 'Neutro / Conferma Necessaria';
    };

    const getOperationalTakeaway = (bias, assets) => {
        const list = assets?.length ? assets.join(', ') : 'General Market';
        const b = String(bias || 'NEUTRAL').toUpperCase();
        if (b.includes('BULL')) {
            return `Bias costruttivo: favorire setup trend-following su ${list}, evitando mean reversion aggressiva senza conferma di volume/struttura.`;
        }
        if (b.includes('BEAR')) {
            return `Bias difensivo: ridurre esposizione long direzionale su ${list}; privilegiare protezione e gestione del rischio su volatilita.`;
        }
        return `Bias misto: mantenere sizing prudente su ${list}, entrare solo con conferme multi-fattoriali (price action + volatilita + rischio).`;
    };

    const summarizeEntry = (entry) => {
        const raw = [
            entry?.analysis?.summary,
            entry?.text_preview,
            entry?.title,
        ].filter(Boolean).join(' ');
        const all = splitReportSentences(raw);
        const clean = all.filter((s) => !isNoiseSentence(s));
        const ranked = clean
            .map((s) => ({ text: s, score: scoreSentence(s) }))
            .sort((a, b) => b.score - a.score)
            .map((x) => x.text);

        let summarySentences = ranked.slice(0, 3);
        if (!summarySentences.length) {
            const fallback = splitReportSentences(entry?.analysis?.summary || '').filter((s) => s.length > 30);
            summarySentences = fallback.slice(0, 2);
        }
        const summary = summarySentences.length
            ? summarySentences.join(' ')
            : 'Contenuto originale con bassa densita informativa. Si raccomanda validazione manuale del report sorgente.';

        const signalSentences = ranked.filter((s) => REPORT_SIGNAL_PATTERNS.some((rx) => rx.test(s))).slice(0, 3);
        const technicalPoints = (signalSentences.length ? signalSentences : summarySentences).slice(0, 3);
        const qualityRatio = all.length ? clean.length / all.length : 0;
        const qualityScore = Math.round(Math.min(100, qualityRatio * 60 + technicalPoints.length * 12));

        const bullScore = Number(entry?.analysis?.bull_score || 0);
        const bearScore = Number(entry?.analysis?.bear_score || 0);
        const spread = Math.abs(bullScore - bearScore);
        const confidence = Math.max(20, Math.min(98, Math.round(35 + spread * 2.5 + qualityScore * 0.4)));

        return {
            summary,
            technicalPoints,
            qualityScore,
            confidence,
        };
    };

    const karionReportData = (() => {
        const docs = Array.isArray(vaultDocs) ? vaultDocs : [];
        const total = docs.length;
        const byBank = docs.reduce((acc, d) => {
            const bank = d?.bank || 'Unknown';
            acc[bank] = (acc[bank] || 0) + 1;
            return acc;
        }, {});
        const topBanks = Object.entries(byBank)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const assetMap = docs.reduce((acc, d) => {
            const assets = d?.analysis?.affected_assets || [];
            assets.forEach((a) => {
                acc[a] = (acc[a] || 0) + 1;
            });
            return acc;
        }, {});
        const topAssets = Object.entries(assetMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        const latestDocs = [...docs]
            .sort((a, b) => new Date(b?.upload_timestamp || 0).getTime() - new Date(a?.upload_timestamp || 0).getTime())
            .slice(0, 5);

        return { total, topBanks, topAssets, latestDocs };
    })();

    const simplifiedReports = (() => {
        const docs = (Array.isArray(vaultDocs) ? vaultDocs : []).slice()
            .sort((a, b) => new Date(b?.upload_timestamp || 0).getTime() - new Date(a?.upload_timestamp || 0).getTime());
        return docs.map((entry, idx) => {
            const bank = entry?.bank || 'Unknown';
            const title = entry?.analysis?.title || entry?.title || 'Report';
            const bias = entry?.analysis?.bias || 'NEUTRAL';
            const assets = Array.isArray(entry?.analysis?.affected_assets) ? entry.analysis.affected_assets : [];
            const ts = entry?.upload_timestamp ? new Date(entry.upload_timestamp).toLocaleString('it-IT') : 'N/A';
            const metrics = summarizeEntry(entry);
            return {
                id: `${bank}-${idx}-${entry?.upload_timestamp || 'na'}`,
                index: idx + 1,
                bank,
                title,
                bias,
                signal: toSignalLabel(bias),
                assets,
                timestamp: ts,
                sourceUrl: entry?.source_url || '',
                bullScore: Number(entry?.analysis?.bull_score || 0),
                bearScore: Number(entry?.analysis?.bear_score || 0),
                summary: metrics.summary,
                technicalPoints: metrics.technicalPoints,
                qualityScore: metrics.qualityScore,
                confidence: metrics.confidence,
                takeaway: getOperationalTakeaway(bias, assets),
                original: entry,
            };
        });
    })();

    const bankReportTabs = (() => {
        const bankMap = new Map();
        simplifiedReports.forEach((report) => {
            if (!bankMap.has(report.bank)) {
                bankMap.set(report.bank, { ...report, reportCount: 1 });
                return;
            }
            const prev = bankMap.get(report.bank);
            bankMap.set(report.bank, {
                ...prev,
                reportCount: prev.reportCount + 1,
            });
        });
        return Array.from(bankMap.values());
    })();

    useEffect(() => {
        if (!selectedBankReportId) return;
        const stillExists = bankReportTabs.some((report) => report.id === selectedBankReportId);
        if (!stillExists) setSelectedBankReportId(null);
    }, [bankReportTabs, selectedBankReportId]);

    const handleGenerateKarionPdf = async () => {
        try {
            setPdfGenerating(true);
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            const now = new Date();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 42;
            const bodyWidth = pageWidth - margin * 2;
            let y = 56;

            const reports = simplifiedReports;
            const ensureSpace = (needed = 20) => {
                if (y + needed <= pageHeight - 46) return;
                doc.addPage();
                y = 56;
            };
            const writeParagraph = (text, size = 10.5, line = 13, indent = 0) => {
                const safe = normalizeReportText(text);
                if (!safe) return;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(size);
                const wrapped = doc.splitTextToSize(safe, bodyWidth - indent);
                ensureSpace(wrapped.length * line + 8);
                doc.text(wrapped, margin + indent, y);
                y += wrapped.length * line;
            };
            const writeSection = (title) => {
                ensureSpace(34);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.text(title, margin, y);
                y += 14;
                doc.setDrawColor(0, 217, 165);
                doc.setLineWidth(1.2);
                doc.line(margin, y, pageWidth - margin, y);
                y += 16;
            };

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.text('Karion Institutional Technical Dossier', margin, y);
            y += 20;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.text(`Generated: ${now.toLocaleString('it-IT')} • Reports: ${reports.length}`, margin, y);
            y += 14;
            doc.text(`Scope: Bank-by-bank simplified technical briefing`, margin, y);
            y += 20;

            writeSection('Executive Snapshot');
            [
                `Dominant bias: ${biasData?.dominant || 'N/A'}`,
                `Research win rate: ${stats?.win_rate ?? 'N/A'}%`,
                `Top institution: ${karionReportData.topBanks[0]?.[0] || 'N/A'}`,
                `Reports processed: ${reports.length}`,
            ].forEach((line) => writeParagraph(`- ${line}`, 11, 14));
            y += 8;

            writeSection('Bias Distribution');
            const bars = [
                { label: 'Bullish', value: Number(biasData?.bull || 0), color: [0, 217, 165] },
                { label: 'Bearish', value: Number(biasData?.bear || 0), color: [230, 72, 72] },
                { label: 'Neutral', value: Number(biasData?.neutral || 0), color: [234, 179, 8] },
            ];
            const total = bars.reduce((s, i) => s + i.value, 0) || 1;
            bars.forEach((b) => {
                ensureSpace(20);
                const w = Math.max(8, Math.round((b.value / total) * 290));
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(11);
                doc.text(`${b.label} (${b.value})`, margin, y);
                doc.setFillColor(28, 31, 38);
                doc.rect(margin + 120, y - 8, 290, 10, 'F');
                doc.setFillColor(b.color[0], b.color[1], b.color[2]);
                doc.rect(margin + 120, y - 8, w, 10, 'F');
                y += 18;
            });
            y += 10;

            writeSection('Bank-by-Bank Summary');
            reports.forEach((r, idx) => {
                ensureSpace(150);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12.5);
                doc.text(`${idx + 1}. ${r.bank} — ${r.title}`, margin, y);
                y += 14;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10.5);
                doc.text(`Timestamp: ${r.timestamp}`, margin, y);
                y += 12;
                doc.text(`Bias: ${r.bias} • Signal: ${r.signal} • Confidence: ${r.confidence}/100 • Quality: ${r.qualityScore}/100`, margin, y);
                y += 12;
                doc.text(`Assets: ${(r.assets && r.assets.length) ? r.assets.join(', ') : 'General Market'}`, margin, y);
                y += 15;

                const bull = Math.max(0, Math.min(100, Number(r.bullScore || 0)));
                const bear = Math.max(0, Math.min(100, Number(r.bearScore || 0)));
                doc.setFillColor(28, 31, 38);
                doc.rect(margin, y - 8, 180, 8, 'F');
                doc.rect(margin + 210, y - 8, 180, 8, 'F');
                doc.setFillColor(0, 217, 165);
                doc.rect(margin, y - 8, Math.round((bull / 100) * 180), 8, 'F');
                doc.setFillColor(230, 72, 72);
                doc.rect(margin + 210, y - 8, Math.round((bear / 100) * 180), 8, 'F');
                doc.setFontSize(9.5);
                doc.text(`Bull Score ${bull}`, margin, y + 10);
                doc.text(`Bear Score ${bear}`, margin + 210, y + 10);
                y += 22;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10.5);
                doc.text('Riassunto Semplificato:', margin, y);
                y += 12;
                writeParagraph(r.summary, 10.5, 13, 8);
                y += 6;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10.5);
                doc.text('Punti Tecnici:', margin, y);
                y += 12;
                (r.technicalPoints?.length ? r.technicalPoints : ['Nessun punto tecnico estratto in modo affidabile.']).slice(0, 3).forEach((p) => {
                    writeParagraph(`- ${p}`, 10.3, 12.5, 8);
                });
                y += 4;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10.5);
                doc.text('Takeaway Operativo:', margin, y);
                y += 12;
                writeParagraph(r.takeaway, 10.3, 12.5, 8);
                y += 10;
            });

            const totalPages = doc.getNumberOfPages();
            for (let i = 1; i <= totalPages; i += 1) {
                doc.setPage(i);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(120);
                doc.text(`Karion • Technical Dossier • ${i}/${totalPages}`, pageWidth - margin - 140, pageHeight - 18);
                doc.setTextColor(0);
            }

            doc.save(`karion-technical-dossier-${now.toISOString().slice(0, 10)}.pdf`);
        } catch (e) {
            console.error('PDF generation error', e);
        } finally {
            setPdfGenerating(false);
        }
    };

    const handleGenerateSingleKarionPdf = async (report) => {
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            const now = new Date();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 42;
            const bodyWidth = pageWidth - margin * 2;
            let y = 56;
            const ensureSpace = (needed = 20) => {
                if (y + needed <= pageHeight - 46) return;
                doc.addPage();
                y = 56;
            };
            const writeParagraph = (text, size = 10.5, line = 13, indent = 0) => {
                const wrapped = doc.splitTextToSize(normalizeReportText(text), bodyWidth - indent);
                ensureSpace(wrapped.length * line + 8);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(size);
                doc.text(wrapped, margin + indent, y);
                y += wrapped.length * line;
            };

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(21);
            doc.text(`Karion Bank Briefing — ${report.bank}`, margin, y);
            y += 18;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.text(`Generated: ${now.toLocaleString('it-IT')}`, margin, y);
            y += 13;
            doc.text(`Report: ${report.title}`, margin, y);
            y += 13;
            doc.text(`Bias: ${report.bias} • Signal: ${report.signal} • Confidence: ${report.confidence}/100`, margin, y);
            y += 13;
            doc.text(`Assets: ${(report.assets && report.assets.length) ? report.assets.join(', ') : 'General Market'}`, margin, y);
            y += 18;

            doc.setDrawColor(0, 217, 165);
            doc.setLineWidth(1.2);
            doc.line(margin, y, pageWidth - margin, y);
            y += 16;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12.5);
            doc.text('Riassunto Semplificato', margin, y);
            y += 12;
            writeParagraph(report.summary, 10.8, 13.5);
            y += 8;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12.5);
            doc.text('Punti Tecnici', margin, y);
            y += 12;
            (report.technicalPoints?.length ? report.technicalPoints : ['Nessun punto tecnico disponibile.']).slice(0, 4).forEach((p) => {
                writeParagraph(`- ${p}`, 10.5, 13, 8);
            });
            y += 6;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12.5);
            doc.text('Takeaway Operativo', margin, y);
            y += 12;
            writeParagraph(report.takeaway, 10.5, 13, 8);

            const safeBank = String(report.bank || 'bank').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(120);
            doc.text('Karion • Institutional Bank Briefing', pageWidth - margin - 150, pageHeight - 18);
            doc.setTextColor(0);
            doc.save(`karion-${safeBank}-brief-${now.toISOString().slice(0, 10)}.pdf`);
        } catch (e) {
            console.error('Single PDF generation error', e);
        }
    };

    const TABS = [
        { id: 'overview', label: 'Overview & Metriche', icon: LayoutDashboard },
        { id: 'ingestion', label: 'Ingestione & Vault', icon: Globe },
        { id: 'forensics', label: 'Mappa Retroattiva', icon: Activity },
        { id: 'deepResearch', label: 'Deep Research 3.0', icon: BrainCircuit },
    ];

    const FORENSICS_SUB_TABS = [
        { id: 'matrix', label: 'Mappa Retroattiva', icon: Activity },
        { id: 'sessioni', label: 'SESSIONI', icon: BarChart3 },
    ];

    const forensicsSummaryByTab = {
        matrix: {
            title: 'Retroattiva Forense',
            text: 'Vista snella con affidabilità oraria e matrice MFE/MAE. Usa Deep per i dettagli estesi senza sovraccaricare la schermata principale.',
        },
        sessioni: {
            title: 'SESSIONI Inter-Market',
            text: 'Pipeline automatica Sydney → Asian → London → New York con auto-analisi, correlazioni incrociate e score di ottimizzazione globale.',
        },
    };

    const DEEP_RESEARCH_SUB_TABS = [
        { id: 'signals', label: 'Segnali Probabilistici', icon: Zap },
        { id: 'smartMoney', label: 'Radar Institutional Positioning', icon: Database },
        { id: 'diversification', label: 'Diversificazione & Hedge', icon: Shield },
        { id: 'risk', label: 'Rischio & Esposizione', icon: BarChart3 },
        { id: 'bias', label: 'Bias Settimanale/Mensile', icon: Activity },
    ];

    const deepResearchSummaryByTab = {
        signals: 'Screening delle migliori confluenze statistiche con probabilità, robustezza e spiegazione sintetica.',
        smartMoney: 'Institutional Radar Positioning live con storico 10Y, test statistici, correlazioni cross-asset e filtro macro.',
        diversification: 'Mappa di coperture decorrelate e coppie complementari per mitigare drawdown e regime mismatch.',
        risk: 'Overlay macro-news-risk per stimare aggressività, esposizione e allocazione operativa della giornata.',
        bias: 'Distribuzione dei bias su bucket settimanali e mensili per allineare timing, win rate e stagionalità.',
    };
    const deepResearchIntroText = 'Stack statistico avanzato: selezione automatica delle migliori confluenze probabilistiche, overlay macro/risk/news/seasonality, modelli di copertura decorrelata e guida dinamica all\'esposizione. La mappa retroattiva resta separata e minimale.';

    return (
        <div className="research-apple-scope p-6 lg:p-8 w-full space-y-8 font-sans" >
            {/* ═══ HEADER & TABS ═══ */}
            <div className="space-y-6 sticky top-0 bg-[#0A0E12]/95 backdrop-blur-xl z-20 pt-2 pb-4 border-b border-white/5">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold flex items-center gap-3 text-white tracking-tight">
                            <Microscope className="w-8 h-8 text-[#00D9A5]" />
                            Institutional Research
                        </h1>
                        <p className="text-white/60 mt-1 text-sm">
                            Intelligence Core • Data Pipeline & Validazione Modelli
                        </p>
                    </div>
                </motion.div>

                <div className="flex flex-col xl:flex-row xl:items-center gap-3 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        "px-5 py-3 rounded-xl flex items-center gap-2.5 font-semibold text-base transition-all whitespace-nowrap",
                                        isActive
                                            ? "bg-[#00D9A5] text-black shadow-[0_0_15px_rgba(0,217,165,0.2)]"
                                            : "bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 xl:ml-auto xl:mr-[20px]">
                        {activeTab === 'deepResearch' && (
                            <div className="max-w-[34rem] px-4 py-3 rounded-xl bg-black/35 border border-white/10">
                                <h3 className="text-sm font-semibold text-white">Deep Research 3.0</h3>
                                <p className="text-sm text-white/85 leading-relaxed mt-1">
                                    {deepResearchIntroText}
                                </p>
                            </div>
                        )}

                        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-black/40 border border-white/10 shadow-lg shrink-0">
                            <div className={cn("w-2.5 h-2.5 rounded-full", stats?.status === 'active' ? "bg-[#00D9A5] animate-pulse" : "bg-yellow-500 animate-pulse shadow-[0_0_10px_#eab308]")} />
                            <span className="text-lg font-mono font-semibold tracking-wide" style={{ color: stats?.status === 'active' ? '#00D9A5' : '#EAB308' }}>
                                {stats?.status === 'active' ? 'LIVE DATA ACTIVE' : 'COLLECTING DATA'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ TAB CONTENT ═══ */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.15 }}
                    className="min-h-[500px]"
                >

                    {/* ===== TAB: OVERVIEW ===== */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">

                            <TechCard className="p-6 border-[#00D9A5]/30 bg-gradient-to-br from-[#00D9A5]/5 to-transparent relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#00D9A5]" />
                                <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
                                    <BrainCircuit className="w-5 h-5 text-[#00D9A5]" />
                                    Come i dati vengono correlati in Karion
                                </h2>
                                <p className="text-lg text-white/85 leading-relaxed mb-6 max-w-5xl">
                                    In questa piattaforma visualizziamo due flussi di dati indipendenti che vengono uniti per darti un vantaggio statistico reale:
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <div className="p-5 bg-black/40 border border-white/10 rounded-xl relative">
                                        <div className="absolute top-5 -right-5 z-10 hidden md:block text-white/10">
                                            <ArrowRight className="w-8 h-8" />
                                        </div>
                                        <Database className="w-6 h-6 text-blue-400 mb-3" />
                                        <h3 className="text-lg font-semibold text-white mb-1.5">1. Ingestione Istituzionale</h3>
                                        <p className="text-lg text-white/85 leading-relaxed">Karion analizza i VERI report in PDF di JP Morgan, FED, ECB ecc. per estrarne il <strong>Bias Direzionale</strong> globale.</p>
                                    </div>

                                    <div className="p-5 bg-black/40 border border-white/10 rounded-xl relative">
                                        <div className="absolute top-5 -right-5 z-10 hidden md:block text-white/10">
                                            <ArrowRight className="w-8 h-8" />
                                        </div>
                                        <Activity className="w-6 h-6 text-purple-400 mb-3" />
                                        <h3 className="text-lg font-semibold text-white mb-1.5">2. Analisi Retroattiva</h3>
                                        <p className="text-lg text-white/85 leading-relaxed">Il motore quantitativo processa le deviazioni direzionali temporali, elaborando pattern di efficienza asimmetrica tramite validazione retroattiva continua.</p>
                                    </div>

                                    <div className="p-5 bg-[#00D9A5]/10 border border-[#00D9A5]/30 rounded-xl relative">
                                        <Shield className="w-6 h-6 text-[#00D9A5] mb-3" />
                                        <h3 className="text-lg font-semibold text-[#00D9A5] mb-1.5">3. Vantaggio Quantitativo</h3>
                                        <p className="text-sm text-[#00D9A5]/80 leading-relaxed">Sincronizzando i gradienti di probabilità algoritmici con le fasi di accumulazione/distribuzione occulte. La convergenza vettoriale di questi fattori abbatte il coefficiente di rischio in modo esponenziale.</p>
                                    </div>
                                </div>
                            </TechCard>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Win Rate */}
                                <TechCard className="p-6 hover:border-[#00D9A5]/30 transition-all group overflow-hidden relative">
                                    <div className="absolute -right-6 -top-6 text-white/5 group-hover:text-[#00D9A5]/5 transition-colors">
                                        <Activity className="w-40 h-40" />
                                    </div>
                                    <div className="relative z-10 flex flex-col h-full place-content-between">
                                        <div className="text-lg text-white/90 font-semibold uppercase tracking-wide mb-4">Win Rate Reale (Ultime 48h)</div>
                                        {stats?.status === 'active' ? (
                                            <div>
                                                <div className="text-[1.85rem] font-semibold text-white tracking-tighter mb-2">{stats.win_rate}%</div>
                                                <div className="text-lg text-white/85 font-medium">
                                                    Su <strong className="text-white">{stats.total_predictions}</strong> valutazioni
                                                    <div className="mt-1">
                                                        <span className="text-[#00D9A5]">{stats.hits} Hits</span> / <span className="text-red-400">{stats.misses} Misses</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="text-[2.4rem] font-semibold text-white/20 tracking-tighter mb-2">—</div>
                                                <div className="text-sm text-white/30 font-medium">{stats?.message || 'In raccolta...'}</div>
                                            </div>
                                        )}
                                    </div>
                                </TechCard>

                                {/* Institutional Bias Consensus */}
                                <TechCard className="p-6 hover:border-[#00D9A5]/30 transition-all group overflow-hidden relative">
                                    <div className="absolute -right-6 -top-6 text-white/5 group-hover:text-[#00D9A5]/5 transition-colors">
                                        <BrainCircuit className="w-40 h-40" />
                                    </div>
                                    <div className="relative z-10 flex flex-col h-full place-content-between">
                                        <div className="text-lg text-white/90 font-semibold uppercase tracking-wide mb-4">Bias Istituzionale Globale</div>
                                        {biasData.dominant ? (
                                            <div>
                                                <div className={cn("text-[1.55rem] font-semibold tracking-tighter flex items-center gap-2 mb-2",
                                                    biasData.dominant === 'BULLISH' ? 'text-[#00D9A5]' : biasData.dominant === 'BEARISH' ? 'text-red-400' : 'text-yellow-500'
                                                )}>
                                                    {biasData.dominant === 'BULLISH' && <TrendingUp className="w-8 h-8" />}
                                                    {biasData.dominant === 'BEARISH' && <TrendingDown className="w-8 h-8" />}
                                                    {biasData.dominant === 'NEUTRAL' && <Minus className="w-8 h-8" />}
                                                    {biasData.dominant}
                                                </div>
                                                <div className="text-lg text-white/85">
                                                    Basato su {vaultDocs.length} documenti emessi:
                                                    <div className="mt-1">
                                                        <span className="text-[#00D9A5]">{biasData.bull} Bull</span> • <span className="text-red-400">{biasData.bear} Bear</span> • <span className="text-yellow-500">{biasData.neutral} Neut.</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="text-[2.4rem] font-semibold text-white/20 tracking-tighter mb-2">—</div>
                                                <div className="text-sm text-white/30">Nessun report analizzato</div>
                                            </div>
                                        )}
                                    </div>
                                </TechCard>

                                {/* Asset Breakdown */}
                                <TechCard className="p-6 hover:border-[#00D9A5]/30 transition-all overflow-hidden flex flex-col h-full justify-center">
                                    <div className="text-lg text-white/90 font-semibold uppercase tracking-wide mb-4">Win Rate (per Asset)</div>
                                    <div className="space-y-3.5">
                                        {stats?.asset_breakdown ? (
                                            Object.entries(stats.asset_breakdown).map(([asset, data]) => (
                                                <div key={asset} className="flex justify-between items-center group">
                                                    <span className="text-lg font-semibold font-mono text-white/70 group-hover:text-white transition-colors">{asset}</span>
                                                    <div className="flex items-center gap-3 w-3/5">
                                                        <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                                                            <div className={cn("h-full rounded-full transition-all",
                                                                data.win_rate >= 60 ? "bg-[#00D9A5]" : data.win_rate >= 40 ? "bg-yellow-500" : "bg-red-500"
                                                            )} style={{ width: `${data.win_rate}%` }} />
                                                        </div>
                                                        <span className="text-sm font-semibold text-white w-10 text-right">{data.win_rate}%</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-sm text-white/30 flex h-full items-center">Calibrazione del cluster vettoriale in corso...</div>
                                        )}
                                    </div>
                                </TechCard>
                            </div>
                        </div>
                    )}

                    {/* ===== TAB: INGESTION & VAULT ===== */}
                    {activeTab === 'ingestion' && (
                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)_minmax(0,1.1fr)] gap-6 w-full">
                            <div className="space-y-4 flex flex-col xl:h-[calc(100dvh-300px)] min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Zap className="w-5 h-5 text-[#00D9A5]" />
                                        Terminali di Ingestione
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-mono text-white/75">{sources.length} canali</span>
                                        <button onClick={handleTrigger} disabled={triggering}
                                            className={cn(
                                                "px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2",
                                                triggering
                                                    ? "bg-[#00D9A5]/20 text-[#00D9A5] cursor-wait"
                                                    : "bg-[#00D9A5] text-[#0A0E12] hover:bg-[#00c293] active:scale-95"
                                            )}>
                                            {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                                            {triggering ? 'Scraping in corso...' : 'Forza Check'}
                                        </button>
                                    </div>
                                </div>
                                <TechCard className="p-0 border-white/10 overflow-hidden bg-black/40 flex-1 min-h-0">
                                    {triggerResult && (
                                        <div className={cn("px-5 py-3 border-b text-sm font-medium",
                                            triggerResult.status === 'ok' ? "bg-[#00D9A5]/10 border-[#00D9A5]/20 text-[#00D9A5]" : "bg-red-500/10 border-red-500/20 text-red-400"
                                        )}>
                                            {triggerResult.status === 'ok' ? `✅ Scraping completato: ${triggerResult.success} scaricati.` : `❌ Errore: ${triggerResult.message}`}
                                        </div>
                                    )}
                                    <div className="p-5 space-y-3 h-full overflow-y-auto scrollbar-thin">
                                        {sources.length === 0 && !loading ? (
                                            <div className="text-center py-12 text-white/30 text-base">Nessuna fonte.</div>
                                        ) : sources.map((src, i) => {
                                            const badge = statusBadge(src.status);
                                            return (
                                                <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#00D9A5]/40 transition-all flex flex-col gap-3 w-full">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={cn("w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]", badge.dot)} />
                                                            <span className="font-semibold text-white text-base">{src.name}</span>
                                                        </div>
                                                        <span className={cn("text-base uppercase font-semibold min-w-[170px] text-center px-3 py-1.5 rounded bg-black/40 border", badge.color)}>
                                                            {badge.label}
                                                        </span>
                                                    </div>
                                                    <div className="bg-black/40 rounded-lg p-3 flex flex-col gap-1.5 border border-white/5">
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="font-mono text-white/80">Target</span>
                                                            <span className="font-medium text-white/80">{src.target}</span>
                                                        </div>
                                                        {src.last_success && (
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="font-mono text-white/80">Update</span>
                                                                <span className="font-medium text-[#00D9A5]/80">
                                                                    {new Date(src.last_success).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {src.error && (
                                                        <div className="text-sm bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg flex items-center gap-2">
                                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                                            <p className="truncate" title={src.error}>{src.error}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </TechCard>
                            </div>

                            <div className="space-y-4 flex flex-col xl:h-[calc(100dvh-300px)] min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-[#00D9A5]" />
                                        Vault Istituzionale
                                    </h2>
                                    <span className="text-lg font-mono text-white/75">{vaultDocs.length} documenti memorizzati</span>
                                </div>
                                <TechCard className="p-0 border-white/10 overflow-hidden bg-black/40 flex-1 min-h-0">
                                    <div className="p-5 space-y-4 h-full overflow-y-auto scrollbar-thin">
                                        {vaultDocs.length === 0 ? (
                                            <div className="text-center text-white/30 py-20 flex flex-col items-center gap-3">
                                                <Database className="w-10 h-10 opacity-20" />
                                                <span className="text-sm">Nessun documento nel vault. Usa "Forza Check".</span>
                                            </div>
                                        ) : (
                                            vaultDocs.map((doc, i) => (
                                                <div key={i} className="p-5 rounded-xl bg-[#00D9A5]/[0.02] border border-[#00D9A5]/10 hover:bg-[#00D9A5]/5 hover:border-[#00D9A5]/30 transition-all group flex flex-col gap-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="pr-4">
                                                            <h3 className="font-semibold text-white text-base mb-1 group-hover:text-[#00D9A5] transition-colors line-clamp-2">
                                                                {doc.analysis?.title || doc.bank || "Report"}
                                                            </h3>
                                                            <div className="flex items-center gap-2 text-lg text-white/90">
                                                                <span className="font-semibold">{doc.bank}</span>
                                                                <span>&bull;</span>
                                                                <span className="font-mono">
                                                                    {doc.upload_timestamp ? new Date(doc.upload_timestamp).toLocaleString('it-IT') : 'Unknown'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className={cn("px-2.5 py-1 rounded-md text-xs sm:text-sm font-semibold uppercase shrink-0 border",
                                                            doc.analysis?.bias === 'BULLISH' ? 'bg-[#00D9A5]/10 text-[#00D9A5] border-[#00D9A5]/30' :
                                                                doc.analysis?.bias === 'BEARISH' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                                                                    'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                                                        )}>
                                                            {doc.analysis?.bias || 'ANALYSIS'}
                                                        </div>
                                                    </div>
                                                    <p className="text-lg text-white/90 leading-snug line-clamp-3">
                                                        {doc.analysis?.summary}
                                                    </p>
                                                    <div className="flex items-center justify-between gap-3 mt-1">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {doc.analysis?.affected_assets?.map((a, j) => (
                                                                <span key={j} className="text-sm font-semibold font-mono px-2 py-1 rounded bg-white/5 text-white/80 border border-white/10">
                                                                    {a}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        {doc.source_url && (
                                                            <button onClick={() => window.open(doc.source_url, '_blank')}
                                                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded font-medium text-sm transition-colors border border-white/10 flex items-center gap-1.5 shrink-0">
                                                                Sorgente <ExternalLink className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </TechCard>
                            </div>

                            <div className="space-y-5 flex flex-col xl:h-[calc(100dvh-300px)] min-w-0">
                                <div className="bg-[#00D9A5]/5 p-6 rounded-2xl border border-[#00D9A5]/20">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                                        <FileText className="w-5 h-5 text-[#00D9A5]" />
                                        Karion Report PDF
                                    </h2>
                                    <p className="text-base text-white/80 leading-relaxed">
                                        Ogni report istituzionale viene sintetizzato singolarmente in linguaggio semplice e tecnico.
                                        Per ogni banca puoi scaricare un PDF Karion dedicato.
                                    </p>
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            onClick={handleGenerateKarionPdf}
                                            disabled={pdfGenerating}
                                            className={cn(
                                                "px-4 py-2 rounded-lg font-semibold text-sm transition-all",
                                                pdfGenerating ? "bg-[#00D9A5]/20 text-[#00D9A5]" : "bg-[#00D9A5] text-black hover:bg-[#00c293]"
                                            )}
                                        >
                                            {pdfGenerating ? 'Generazione Dossier...' : 'Scarica Dossier Completo'}
                                        </button>
                                    </div>
                                </div>

                                <TechCard className="p-0 bg-black/40 border-white/10 flex-1 min-h-0 overflow-hidden min-w-0">
                                    {bankReportTabs.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-white/40 text-base px-6 text-center">
                                            Nessun report disponibile per la sintesi.
                                        </div>
                                    ) : (
                                        <div className="h-full p-3 md:p-4 overflow-y-auto">
                                            <div className="space-y-3">
                                                {bankReportTabs.map((report, idx) => {
                                                    const isOpen = selectedBankReportId === report.id;
                                                    const bullWidth = Math.max(4, Math.min(100, report.bullScore));
                                                    const bearWidth = Math.max(4, Math.min(100, report.bearScore));
                                                    return (
                                                        <div
                                                            key={report.id}
                                                            className={cn(
                                                                "rounded-xl border transition-all",
                                                                isOpen
                                                                    ? "border-[#00D9A5]/35 bg-[#00D9A5]/[0.06]"
                                                                    : "border-white/10 bg-white/5"
                                                            )}
                                                        >
                                                            <div className="px-4 py-3 flex flex-col gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-lg font-semibold text-white truncate">
                                                                        {idx + 1}. {report.bank}
                                                                    </div>
                                                                    <div className="text-sm text-white/70">
                                                                        {report.reportCount} report
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <button
                                                                        onClick={() => setSelectedBankReportId(isOpen ? null : report.id)}
                                                                        className={cn(
                                                                            "px-3.5 py-2 rounded-lg border text-sm font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap",
                                                                            isOpen
                                                                                ? "bg-white/10 border-white/25 text-white"
                                                                                : "bg-white/5 border-white/15 text-white/90 hover:bg-white/10"
                                                                        )}
                                                                    >
                                                                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                        {isOpen ? 'Chiudi Riassunto' : 'Apri Riassunto'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleGenerateSingleKarionPdf(report)}
                                                                        className="px-3.5 py-2 rounded-lg bg-[#00D9A5] text-black font-semibold text-sm hover:bg-[#00c293] whitespace-nowrap"
                                                                    >
                                                                        PDF Karion
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {isOpen && (
                                                                <div className="px-4 pb-4 border-t border-white/10 space-y-3">
                                                                    <div className="pt-3 flex items-start justify-between gap-3">
                                                                        <div>
                                                                            <p className="text-base font-semibold text-white">{report.title}</p>
                                                                            <p className="text-sm text-white/60 mt-1">{report.timestamp}</p>
                                                                        </div>
                                                                        <span className={cn("text-sm px-2.5 py-1 rounded border font-semibold", biasStyle(report.bias))}>
                                                                            {report.bias}
                                                                        </span>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div className="bg-black/40 rounded-lg p-3 border border-white/10">
                                                                            <div className="text-sm text-white/65">Confidence</div>
                                                                            <div className="text-base text-white font-semibold">{report.confidence}/100</div>
                                                                        </div>
                                                                        <div className="bg-black/40 rounded-lg p-3 border border-white/10">
                                                                            <div className="text-sm text-white/65">Quality</div>
                                                                            <div className="text-base text-white font-semibold">{report.qualityScore}/100</div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center justify-between text-sm text-white/70">
                                                                            <span>Bull Score</span><span>{report.bullScore}</span>
                                                                        </div>
                                                                        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                                                                            <div className="h-full bg-[#00D9A5]" style={{ width: `${bullWidth}%` }} />
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-sm text-white/70">
                                                                            <span>Bear Score</span><span>{report.bearScore}</span>
                                                                        </div>
                                                                        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                                                                            <div className="h-full bg-red-400" style={{ width: `${bearWidth}%` }} />
                                                                        </div>
                                                                    </div>

                                                                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                                                        <div className="text-sm uppercase tracking-wide text-white/60 mb-1">Riassunto</div>
                                                                        <p className="text-base text-white/90 leading-relaxed">{report.summary}</p>
                                                                    </div>

                                                                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80 leading-relaxed">
                                                                        <strong>Takeaway:</strong> {report.takeaway}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </TechCard>
                            </div>
                        </div>
                    )}

                    {/* ===== TAB: FORENSICS (Retroattiva) ===== */}
                    {activeTab === 'forensics' && (
                        <div className="space-y-6">
                            <div className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-[20px] p-1.5 flex flex-wrap items-center gap-1 mb-2">
                                {FORENSICS_SUB_TABS.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = forensicsSubTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setForensicsSubTab(tab.id)}
                                            className={cn(
                                                "flex-1 min-w-[150px] justify-center px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-semibold uppercase tracking-wide whitespace-nowrap transition-all",
                                                isActive
                                                    ? "bg-[#00D9A5] text-black shadow-lg shadow-[#00D9A5]/20"
                                                    : "text-white/60 hover:text-white hover:bg-white/10"
                                            )}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {tab.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <TechCard className="p-4 bg-black/40 border-white/10">
                                <h3 className="text-lg font-semibold text-white">
                                    {forensicsSummaryByTab[forensicsSubTab]?.title || 'Retroattiva'}
                                </h3>
                                <p className="text-base text-white/80 mt-1.5">
                                    {forensicsSummaryByTab[forensicsSubTab]?.text || ''}
                                </p>
                            </TechCard>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`forensics-${forensicsSubTab}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.14 }}
                                    className="space-y-6"
                                >
                                    {forensicsSubTab === 'matrix' && (
                                        <>

                                            <div className="bg-[#00D9A5]/5 p-6 rounded-2xl border border-[#00D9A5]/20 max-w-4xl">
                                                <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                                                    <Activity className="w-5 h-5 text-[#00D9A5]" />
                                                    Mappa Affidabilità Oraria Reale
                                                </h2>
                                                <p className="text-lg text-white/90 leading-relaxed">
                                                    Questa matrice espone l'efficienza neurale del sistema attraverso i cicli temporali, isolando i cluster orari e le variazioni dove l'affidabilità logica dell'intelligenza risulta statisticamente assoluta.
                                                    Le co-relazioni vengono confermate crittograficamente offline a intervalli ritardati.
                                                </p>
                                            </div>

                                            <TechCard className="p-0 overflow-hidden bg-black/40 border-white/10">
                                                {(accuracy?.status === 'collecting' || !accuracy?.data?.length) ? (
                                                    <div className="text-center py-20 flex flex-col items-center justify-center">
                                                        <Loader2 className="w-10 h-10 text-[#00D9A5]/40 animate-spin mb-4" />
                                                        <h3 className="text-lg font-semibold text-white mb-2">Raccolta in Corso</h3>
                                                        <p className="text-lg text-white/85 max-w-md">
                                                            Il modulo forense elabora un volume massivo di segnali e necessita di latenza temporale per il matching asincrono e la conferma matematica delle deviazioni sul mercato primario.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="overflow-x-auto p-6">
                                                        <table className="w-full text-left border-collapse min-w-[700px]">
                                                            <thead>
                                                                <tr>
                                                                    <th className="pb-4 text-lg font-semibold text-white/80 uppercase tracking-wide border-b border-white/10 w-1/5 pl-2">Orario (UTC)</th>
                                                                    {['NAS100', 'SP500', 'XAUUSD', 'EURUSD'].map(a => (
                                                                        <th key={a} className="pb-4 text-lg font-semibold text-white/80 uppercase tracking-wide border-b border-white/10 text-center w-1/5">{a}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {accuracy.data.map((row, idx) => (
                                                                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                                                                        <td className="py-4 pl-2 text-lg font-mono font-semibold text-white/70">{row.hour}</td>
                                                                        {['NAS100', 'SP500', 'XAUUSD', 'EURUSD'].map(asset => {
                                                                            const score = row.assets[asset];
                                                                            return (
                                                                                <td key={asset} className="p-2">
                                                                                    <div className={cn(
                                                                                        "py-3 px-4 rounded-lg text-center text-lg font-semibold transition-all",
                                                                                        getHeatmapColor(score),
                                                                                        score !== null && "shadow-sm"
                                                                                    )}>
                                                                                        {score !== null ? `${score}%` : <div className="text-white/20">—</div>}
                                                                                    </div>
                                                                                </td>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </TechCard>

                                            <div className="bg-[#00D9A5]/5 p-6 rounded-2xl border border-[#00D9A5]/20 max-w-4xl mt-12">
                                                <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                                                    <BrainCircuit className="w-5 h-5 text-[#00D9A5]" />
                                                    Matrice di Confluenza Multi-Dimensionale (MFE/MAE)
                                                </h2>
                                                <p className="text-lg text-white/90 leading-relaxed">
                                                    Vista minimale con solo i KPI operativi: Win Rate, MFE, MAE, sample e stato ottimizzazione.
                                                    Per i dettagli completi usa la vista Deep.
                                                </p>
                                            </div>

                                            <TechCard className="p-0 overflow-hidden bg-black/40 border-white/10">
                                                {(!matrixData || Object.keys(matrixData).length === 0) ? (
                                                    <div className="text-center py-20 flex flex-col items-center justify-center">
                                                        <Database className="w-10 h-10 text-white/20 mb-4" />
                                                        <h3 className="text-lg font-semibold text-white mb-2">Attendere Scansione Matrice</h3>
                                                        <p className="text-lg text-white/85 max-w-md">
                                                            Il demone "Forensics Matrix" non ha ancora salvato snapshot vettoriali multi-dimensione. I blocchi vengono calcolati in ciclo continuo.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="p-6 space-y-5">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div className="text-lg text-white/90">
                                                                {matrixOverviewRows.length} blocchi monitorati
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => setMatrixMode('overview')}
                                                                    className={cn(
                                                                        "px-4 py-2.5 rounded-lg text-lg font-semibold uppercase border",
                                                                        matrixMode === 'overview'
                                                                            ? "bg-[#00D9A5] text-black border-[#00D9A5]"
                                                                            : "bg-white/5 text-white/70 border-white/10"
                                                                    )}
                                                                >
                                                                    Overview
                                                                </button>
                                                                <button
                                                                    onClick={() => setMatrixMode('deep')}
                                                                    className={cn(
                                                                        "px-4 py-2.5 rounded-lg text-lg font-semibold uppercase border",
                                                                        matrixMode === 'deep'
                                                                            ? "bg-[#00D9A5] text-black border-[#00D9A5]"
                                                                            : "bg-white/5 text-white/70 border-white/10"
                                                                    )}
                                                                >
                                                                    Deep
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {matrixMode === 'overview' ? (
                                                            <>
                                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                        <div className="text-sm uppercase text-white/80">Miglioramento</div>
                                                                        <div className="text-xl font-semibold text-[#00D9A5]">
                                                                            {matrixOverviewRows.filter(r => r.trend === 'IMPROVING').length}
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                        <div className="text-sm uppercase text-white/80">Stabile</div>
                                                                        <div className="text-xl font-semibold text-yellow-300">
                                                                            {matrixOverviewRows.filter(r => r.trend === 'FLAT').length}
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                        <div className="text-sm uppercase text-white/80">Peggioramento</div>
                                                                        <div className="text-xl font-semibold text-red-400">
                                                                            {matrixOverviewRows.filter(r => r.trend === 'WORSENING').length}
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                        <div className="text-sm uppercase text-white/80">Win Rate Medio</div>
                                                                        <div className="text-xl font-semibold text-white">
                                                                            {fmtPct(
                                                                                matrixOverviewRows
                                                                                    .map(r => r.winRate)
                                                                                    .filter(v => Number.isFinite(v))
                                                                                    .reduce((a, b, _, arr) => a + b / arr.length, 0),
                                                                                1
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full min-w-[920px] text-left">
                                                                        <thead>
                                                                            <tr className="border-b border-white/10">
                                                                                <th className="py-3 text-lg text-white/90 uppercase">Asset</th>
                                                                                <th className="py-3 text-lg text-white/90 uppercase">TF</th>
                                                                                <th className="py-3 text-lg text-white/90 uppercase">Win Rate</th>
                                                                                <th className="py-3 text-lg text-white/90 uppercase">MFE</th>
                                                                                <th className="py-3 text-lg text-white/90 uppercase">MAE</th>
                                                                                <th className="py-3 text-lg text-white/90 uppercase">Sample</th>
                                                                                <th className="py-3 text-lg text-white/90 uppercase">Stato</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {matrixOverviewRows.map((row, idx) => (
                                                                                <tr key={`${row.asset}-${row.tf}-${idx}`} className="border-b border-white/5 last:border-0">
                                                                                    <td className="py-3 text-lg font-semibold text-white">{row.asset}</td>
                                                                                    <td className="py-3 text-lg font-mono text-white/70">{row.tf}</td>
                                                                                    <td className={cn("py-3 text-lg font-semibold", row.winRate >= 55 ? "text-[#00D9A5]" : row.winRate < 45 ? "text-red-400" : "text-yellow-300")}>
                                                                                        {row.winRate !== null ? `${row.winRate.toFixed(1)}%` : '—'}
                                                                                    </td>
                                                                                    <td className="py-3 text-lg text-white/90">{row.mfe ?? '—'}</td>
                                                                                    <td className="py-3 text-lg text-white/90">{row.mae ?? '—'}</td>
                                                                                    <td className="py-3 text-base text-white/80">{row.sampleSize ?? '—'}</td>
                                                                                    <td className="py-3">
                                                                                        <span className={cn(
                                                                                            "text-sm px-2 py-1 rounded border font-semibold",
                                                                                            row.trend === 'IMPROVING' ? "text-[#00D9A5] border-[#00D9A5]/30 bg-[#00D9A5]/10" :
                                                                                                row.trend === 'WORSENING' ? "text-red-400 border-red-400/30 bg-red-500/10" :
                                                                                                    "text-yellow-300 border-yellow-300/30 bg-yellow-500/10"
                                                                                        )}>
                                                                                            {row.trendLabel}
                                                                                        </span>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                <div className="flex justify-end">
                                                                    <button
                                                                        onClick={() => setActiveTab('deepResearch')}
                                                                        className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-lg text-white/90 hover:bg-white/10"
                                                                    >
                                                                        Apri Deep Research 3.0
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="space-y-8">
                                                                {Object.entries(matrixData).map(([asset, timeframes]) => (
                                                                    <div key={asset} className="space-y-4">
                                                                        <h3 className="text-xl font-semibold text-white px-2 border-l-4 border-[#00D9A5]">{asset} <span className="text-lg text-white/85 ml-2 font-mono">Deep Diagnostics</span></h3>

                                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                            {Object.entries(timeframes).map(([tf, tfDataRaw]) => {
                                                                                const tfData = Array.isArray(tfDataRaw) ? { patterns: tfDataRaw } : (tfDataRaw || {});
                                                                                const patterns = Array.isArray(tfData.patterns) ? tfData.patterns : [];
                                                                                const confluence2 = Array.isArray(tfData.confluence_2way) ? tfData.confluence_2way : [];
                                                                                const confluence3 = Array.isArray(tfData.confluence_3way) ? tfData.confluence_3way : [];
                                                                                const confluence4 = Array.isArray(tfData.confluence_4way) ? tfData.confluence_4way : [];
                                                                                const inverseSetups = Array.isArray(tfData.inverse_conflicts) ? tfData.inverse_conflicts : [];
                                                                                const p = patterns[0];
                                                                                const wr = Number(p?.win_rate);
                                                                                const exp = Number(p?.expectancy);
                                                                                const diagnosis = Number.isFinite(wr) && wr >= 55 && (!Number.isFinite(exp) || exp > 0)
                                                                                    ? 'Migliora: WR alto e expectancy positiva.'
                                                                                    : Number.isFinite(wr) && wr < 45
                                                                                        ? 'Peggiora: WR basso, ottimizzazione da ricalibrare.'
                                                                                        : 'Stabile: edge presente ma non ancora forte.';

                                                                                return (
                                                                                    <div key={tf} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                                                                                        <div className="flex justify-between items-center text-lg font-semibold uppercase tracking-wide text-[#00D9A5]">
                                                                                            <span>Timeframe: {tf.replace('t_', '')}</span>
                                                                                            <span>{patterns.length} pattern</span>
                                                                                        </div>

                                                                                        {p ? (
                                                                                            <div className="space-y-2 bg-black/50 p-3 rounded-lg">
                                                                                                <div className="text-lg font-mono text-white/70 truncate" title={p.pattern}>{p.pattern}</div>
                                                                                                <div className="text-lg text-white/90">
                                                                                                    WR <strong className={cn(wr >= 50 ? 'text-[#00D9A5]' : 'text-red-400')}>{p.win_rate}%</strong> • Sample {p.sample_size} • MFE {p.avg_mfe} • MAE {p.avg_mae}
                                                                                                </div>
                                                                                                <div className="text-sm text-white/80">
                                                                                                    {diagnosis}
                                                                                                </div>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="text-lg text-white/90">Nessun pattern disponibile.</div>
                                                                                        )}

                                                                                        {(confluence2.length > 0 || confluence3.length > 0 || confluence4.length > 0 || inverseSetups.length > 0) && (
                                                                                            <div className="space-y-1.5 pt-2 border-t border-white/10">
                                                                                                {confluence2.length > 0 && <div className="text-sm text-white/70 font-mono">2-Tab: {confluence2[0].pattern} | WR {confluence2[0].win_rate}%</div>}
                                                                                                {confluence3.length > 0 && <div className="text-sm text-white/70 font-mono">3-Tab: {confluence3[0].pattern} | WR {confluence3[0].win_rate}%</div>}
                                                                                                {confluence4.length > 0 && <div className="text-sm text-cyan-300/80 font-mono">4-Tab: {confluence4[0].pattern} | WR {confluence4[0].win_rate}%</div>}
                                                                                                {inverseSetups.length > 0 && <div className="text-sm text-yellow-300/80 font-mono">Inverse: {inverseSetups[0].pattern} | Inv {inverseSetups[0].inverse_rate}%</div>}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </TechCard>
                                        </>
                                    )}

                                    {forensicsSubTab === 'sessioni' && (
                                        <div className="space-y-6">
                                            <div className="bg-[#00D9A5]/5 p-6 rounded-2xl border border-[#00D9A5]/20">
                                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                    <div>
                                                        <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-1.5">
                                                            <BarChart3 className="w-5 h-5 text-[#00D9A5]" />
                                                            SESSIONI • Sydney → Asian → London → New York
                                                        </h2>
                                                        <p className="text-base text-white/85">
                                                            Report inter-sessione giornaliero, auto-correlazioni, matrici Scenario/Bias e ottimizzazione pesi.
                                                        </p>
                                                    </div>
                                                    <div className={cn(
                                                        "px-3 py-2 rounded-lg border text-sm font-semibold",
                                                        sessionsData?.status === 'active'
                                                            ? "text-[#00D9A5] bg-[#00D9A5]/10 border-[#00D9A5]/30"
                                                            : "text-yellow-300 bg-yellow-500/10 border-yellow-500/30"
                                                    )}>
                                                        {sessionsData?.status === 'active' ? 'CICLO ATTIVO' : 'COLLECTING'}
                                                    </div>
                                                </div>
                                            </div>

                                            {!sessionsData || sessionsData.status !== 'active' ? (
                                                <>
                                                    <TechCard className="p-10 text-center border-white/10 bg-black/40">
                                                        <Loader2 className="w-8 h-8 text-[#00D9A5]/60 animate-spin mx-auto mb-3" />
                                                        <h3 className="text-lg font-semibold text-white mb-2">SESSIONI in inizializzazione</h3>
                                                        <p className="text-base text-white/80">
                                                            {sessionsData?.message || 'In attesa del primo ciclo completo Sydney/Asian/London/NY.'}
                                                        </p>
                                                    </TechCard>

                                                    {sessionsHasHistorical && (
                                                        <TechCard className="p-6 bg-black/40 border-white/10">
                                                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                                                <h3 className="text-lg font-semibold text-white">Storico Integrato (Gia Disponibile)</h3>
                                                                <div className="text-sm text-white/70">
                                                                    trend points: {sessionsHistTrend.length} • aggiornato: {sessionsHistorical?.generated_at ? new Date(sessionsHistorical.generated_at).toLocaleString('it-IT') : 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
                                                                {[
                                                                    { key: '7d', label: '7 Giorni' },
                                                                    { key: '30d', label: '30 Giorni' },
                                                                    { key: '90d', label: '90 Giorni' },
                                                                    { key: 'all', label: 'Storico Totale' },
                                                                ].map((item) => {
                                                                    const w = sessionsHistWindows?.[item.key] || {};
                                                                    return (
                                                                        <div key={item.key} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                                                                            <div className="text-xs uppercase tracking-wide text-white/70">{item.label}</div>
                                                                            <div className="text-lg font-semibold text-[#00D9A5]">{fmtNum(w?.verified_rate_pct, 1)}%</div>
                                                                            <div className="text-xs text-white/70">bias {fmtNum(w?.bias_accuracy_pct, 1)}% • target {fmtNum(w?.target_hit_rate_pct, 1)}%</div>
                                                                            <div className="text-xs text-white/70">samples {w?.samples || 0} • days {w?.days || 0} • assets {w?.assets_covered || 0}</div>
                                                                            <div className={cn("text-xs font-semibold", Number(w?.avg_outcome_pips) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>
                                                                                outcome medio {fmtSigned(w?.avg_outcome_pips, 1, 'p')}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                <div className="overflow-x-auto">
                                                                    <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Scenario Leaderboard</h4>
                                                                    <table className="w-full min-w-[620px] text-left">
                                                                        <thead>
                                                                            <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                                <th className="py-2">Scenario</th>
                                                                                <th className="py-2">Samples</th>
                                                                                <th className="py-2">Verified</th>
                                                                                <th className="py-2">Bias Acc</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {sessionsScenarioBoard.slice(0, 5).map((row) => (
                                                                                <tr key={row.scenario} className="border-b border-white/5">
                                                                                    <td className="py-2.5">
                                                                                        <div className="font-semibold text-white">{row.scenario}</div>
                                                                                        <div className="text-xs text-white/60">{row.label}</div>
                                                                                    </td>
                                                                                    <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                                    <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.verified_rate_pct, 1)}%</td>
                                                                                    <td className="py-2.5 text-cyan-300">{fmtNum(row.bias_accuracy_pct, 1)}%</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                <div className="overflow-x-auto">
                                                                    <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Asset Leaderboard</h4>
                                                                    <table className="w-full min-w-[620px] text-left">
                                                                        <thead>
                                                                            <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                                <th className="py-2">Asset</th>
                                                                                <th className="py-2">Samples</th>
                                                                                <th className="py-2">Verified</th>
                                                                                <th className="py-2">Avg Outcome</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {sessionsAssetBoard.slice(0, 4).map((row) => (
                                                                                <tr key={row.asset} className="border-b border-white/5">
                                                                                    <td className="py-2.5 font-semibold text-white">{row.asset}</td>
                                                                                    <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                                    <td className="py-2.5 text-[#00D9A5]">{fmtNum(row.verified_rate_pct, 1)}%</td>
                                                                                    <td className={cn("py-2.5 font-semibold", Number(row.avg_outcome_pips) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(row.avg_outcome_pips, 1, 'p')}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        </TechCard>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <TechCard className="p-6 bg-black/40 border-white/10">
                                                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                                                            <div className="space-y-1.5">
                                                                <div className="text-sm uppercase tracking-wide text-white/60">Kairon Session Health Score</div>
                                                                <div className="text-xl font-semibold text-white">{fmtNum(sessionsKsh, 1)}</div>
                                                                <div className={cn(
                                                                    "text-sm font-semibold",
                                                                    sessionsHealth?.status === 'green'
                                                                        ? "text-[#00D9A5]"
                                                                        : sessionsHealth?.status === 'yellow'
                                                                            ? "text-yellow-300"
                                                                            : "text-red-400"
                                                                )}>
                                                                    {sessionsHealth?.interpretation || 'Valutazione in corso'}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 space-y-3">
                                                                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                                                                    <div
                                                                        className={cn(
                                                                            "h-full transition-all",
                                                                            sessionsKsh >= 75 ? "bg-[#00D9A5]" : sessionsKsh >= 55 ? "bg-yellow-400" : "bg-red-400"
                                                                        )}
                                                                        style={{ width: `${Math.max(0, Math.min(100, sessionsKsh))}%` }}
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                                    <div className="bg-white/5 rounded-lg border border-white/10 p-2.5">
                                                                        <div className="text-xs text-white/60 uppercase">Acc 20gg</div>
                                                                        <div className="text-base font-semibold text-white">{pct01(sessionsHealth?.components?.acc_media_ultimi_20gg, 1)}</div>
                                                                    </div>
                                                                    <div className="bg-white/5 rounded-lg border border-white/10 p-2.5">
                                                                        <div className="text-xs text-white/60 uppercase">Brier</div>
                                                                        <div className="text-base font-semibold text-white">{fmtNum(sessionsHealth?.components?.brier_score, 3)}</div>
                                                                    </div>
                                                                    <div className="bg-white/5 rounded-lg border border-white/10 p-2.5">
                                                                        <div className="text-xs text-white/60 uppercase">Sharpe P</div>
                                                                        <div className="text-base font-semibold text-white">{fmtNum(sessionsHealth?.components?.sharpe_p_raw, 2)}</div>
                                                                    </div>
                                                                    <div className="bg-white/5 rounded-lg border border-white/10 p-2.5">
                                                                        <div className="text-xs text-white/60 uppercase">Corr Sig</div>
                                                                        <div className="text-base font-semibold text-white">{(sessionsCorrelationRatio * 100).toFixed(1)}%</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-end gap-1 h-8">
                                                                    {sessionsKshSpark.slice(-30).map((p, idx) => (
                                                                        <div
                                                                            key={`${p.rome_day}-${idx}`}
                                                                            className="flex-1 rounded-sm bg-[#00D9A5]/80"
                                                                            style={{ height: `${Math.max(8, Math.min(100, Number(p.value) || 0))}%` }}
                                                                            title={`${p.rome_day}: ${p.value}`}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TechCard>

                                                    <TechCard className="p-6 bg-black/40 border-white/10">
                                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                                            <h3 className="text-lg font-semibold text-white">Storico Integrato (Sessioni + Correlazioni Live)</h3>
                                                            <div className="text-sm text-white/70">
                                                                trend points: {sessionsHistTrend.length} • aggiornato: {sessionsHistorical?.generated_at ? new Date(sessionsHistorical.generated_at).toLocaleString('it-IT') : 'N/A'}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
                                                            {[
                                                                { key: '7d', label: '7 Giorni' },
                                                                { key: '30d', label: '30 Giorni' },
                                                                { key: '90d', label: '90 Giorni' },
                                                                { key: 'all', label: 'Storico Totale' },
                                                            ].map((item) => {
                                                                const w = sessionsHistWindows?.[item.key] || {};
                                                                return (
                                                                    <div key={item.key} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                                                                        <div className="text-xs uppercase tracking-wide text-white/70">{item.label}</div>
                                                                        <div className="text-lg font-semibold text-[#00D9A5]">{fmtNum(w?.verified_rate_pct, 1)}%</div>
                                                                        <div className="text-xs text-white/70">bias {fmtNum(w?.bias_accuracy_pct, 1)}% • target {fmtNum(w?.target_hit_rate_pct, 1)}%</div>
                                                                        <div className="text-xs text-white/70">samples {w?.samples || 0} • days {w?.days || 0} • assets {w?.assets_covered || 0}</div>
                                                                        <div className={cn("text-xs font-semibold", Number(w?.avg_outcome_pips) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>
                                                                            outcome medio {fmtSigned(w?.avg_outcome_pips, 1, 'p')}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                            <div className="overflow-x-auto">
                                                                <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Scenario Leaderboard</h4>
                                                                <table className="w-full min-w-[620px] text-left">
                                                                    <thead>
                                                                        <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                            <th className="py-2">Scenario</th>
                                                                            <th className="py-2">Samples</th>
                                                                            <th className="py-2">Verified</th>
                                                                            <th className="py-2">Bias Acc</th>
                                                                            <th className="py-2">Avg Outcome</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {sessionsScenarioBoard.slice(0, 5).map((row) => (
                                                                            <tr key={row.scenario} className="border-b border-white/5">
                                                                                <td className="py-2.5">
                                                                                    <div className="font-semibold text-white">{row.scenario}</div>
                                                                                    <div className="text-xs text-white/60">{row.label}</div>
                                                                                </td>
                                                                                <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                                <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.verified_rate_pct, 1)}%</td>
                                                                                <td className="py-2.5 text-cyan-300">{fmtNum(row.bias_accuracy_pct, 1)}%</td>
                                                                                <td className={cn("py-2.5 font-semibold", Number(row.avg_outcome_pips) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(row.avg_outcome_pips, 1, 'p')}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Asset Leaderboard</h4>
                                                                <table className="w-full min-w-[560px] text-left">
                                                                    <thead>
                                                                        <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                            <th className="py-2">Asset</th>
                                                                            <th className="py-2">Samples</th>
                                                                            <th className="py-2">Verified</th>
                                                                            <th className="py-2">Bias Acc</th>
                                                                            <th className="py-2">Avg Range</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {sessionsAssetBoard.map((row) => (
                                                                            <tr key={row.asset} className="border-b border-white/5">
                                                                                <td className="py-2.5 font-semibold text-white">{row.asset}</td>
                                                                                <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                                <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.verified_rate_pct, 1)}%</td>
                                                                                <td className="py-2.5 text-cyan-300">{fmtNum(row.bias_accuracy_pct, 1)}%</td>
                                                                                <td className="py-2.5 text-white/80">{fmtNum(row.avg_ny_range_pips, 1)}p</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                        <div className="mt-5">
                                                            <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Trend Storico Verifiche (ultimi 60 giorni)</div>
                                                            <div className="flex items-end gap-1 h-16">
                                                                {sessionsHistTrend.slice(-60).map((row, idx) => {
                                                                    const val = Number(row?.verified_rate_pct) || 0;
                                                                    return (
                                                                        <div
                                                                            key={`${row.rome_day}-${idx}`}
                                                                            className={cn("flex-1 rounded-sm", val >= 60 ? "bg-[#00D9A5]/80" : val >= 45 ? "bg-yellow-400/80" : "bg-red-400/80")}
                                                                            style={{ height: `${Math.max(8, Math.min(100, val))}%` }}
                                                                            title={`${row.rome_day} • verified ${fmtNum(row.verified_rate_pct, 1)}% • outcome ${fmtSigned(row.avg_outcome_pips, 1, 'p')}`}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </TechCard>

                                                    <TechCard className="p-6 bg-black/40 border-white/10">
                                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                                            <h3 className="text-lg font-semibold text-white">[1] Report Giornaliero Inter-Sessione</h3>
                                                            <div className="text-sm text-white/75">
                                                                {sessionsSummary?.assets_covered || 0} asset • verified {fmtNum(sessionsSummary?.verified_rate_pct, 1)}% • range medio NY {fmtNum(sessionsSummary?.avg_ny_range_pips, 1)} pips
                                                            </div>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full min-w-[1220px] text-left">
                                                                <thead>
                                                                    <tr className="border-b border-white/10">
                                                                        <th className="py-3 text-sm uppercase text-white/80">Asset</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">Scenario</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">Bias NY</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">Outcome NY</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">Sydney</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">A1 Asian</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">L5 Within</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">C3 Expansion</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">Sweep</th>
                                                                        <th className="py-3 text-sm uppercase text-white/80">Verified</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sessionsRows.map((row, idx) => (
                                                                        <tr key={`${row.rome_day}-${row.asset}-${idx}`} className="border-b border-white/5 last:border-0">
                                                                            <td className="py-3 font-semibold text-white">{row.asset}</td>
                                                                            <td className="py-3 text-white/90">
                                                                                <span className="font-semibold">{row.scenario}</span> <span className="text-white/60">({row.scenario_label})</span>
                                                                            </td>
                                                                            <td className="py-3 text-white/90">{row.bias_direction} • {pct01(row.bias_probability, 0)}</td>
                                                                            <td className={cn("py-3 font-semibold", Number(row.outcome_pips) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>
                                                                                {fmtSigned(row.outcome_pips, 1, 'p')}
                                                                            </td>
                                                                            <td className="py-3 text-white/85">
                                                                                {fmtNum(row.feature_s0_range_sydney_pips, 1)}p
                                                                                <span className="text-white/55 ml-1">
                                                                                    ({Number(row.feature_s1_sydney_direction) > 0 ? 'L' : Number(row.feature_s1_sydney_direction) < 0 ? 'S' : 'N'})
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-3 text-white/85">{fmtNum(row.feature_a1_range_asian_pips, 1)}p</td>
                                                                            <td className="py-3 text-white/85">{fmtNum(row.feature_l5_within_asian_pct, 1)}%</td>
                                                                            <td className="py-3 text-white/85">{fmtNum(row.feature_c3_expansion_potential, 2)}x</td>
                                                                            <td className="py-3 text-white/85">{fmtNum(row.feature_c1_sweep_depth_pips, 1)}p</td>
                                                                            <td className="py-3">
                                                                                <span className={cn(
                                                                                    "px-2 py-1 rounded border text-xs font-semibold",
                                                                                    row.scenario_verified ? "text-[#00D9A5] bg-[#00D9A5]/10 border-[#00D9A5]/30" : "text-red-400 bg-red-500/10 border-red-500/30"
                                                                                )}>
                                                                                    {row.scenario_verified ? 'TRUE' : 'FALSE'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </TechCard>

                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                                        <TechCard className="p-6 bg-black/40 border-white/10">
                                                            <h3 className="text-lg font-semibold text-white mb-4">[2] Auto-Analisi AI</h3>
                                                            <div className="space-y-3">
                                                                {sessionsInsights.length ? sessionsInsights.map((line, idx) => (
                                                                    <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/85 leading-relaxed">
                                                                        {line}
                                                                    </div>
                                                                )) : (
                                                                    <div className="text-sm text-white/60">Insight non ancora disponibili.</div>
                                                                )}
                                                            </div>
                                                            <div className="mt-5 pt-4 border-t border-white/10">
                                                                <div className="text-sm font-semibold text-white mb-2">Aggiornamenti Pesi Oggi</div>
                                                                {sessionsWeightUpdates.length ? (
                                                                    <div className="space-y-2">
                                                                        {sessionsWeightUpdates.map((u, idx) => (
                                                                            <div key={idx} className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-lg p-2.5">
                                                                                {u.scenario}: P {fmtNum(u.P_vecchia, 3)} → {fmtNum(u.P_nuova, 3)} • N={u.N_campioni} • Brier {fmtNum(u.Brier_pre, 3)} → {fmtNum(u.Brier_post, 3)}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-sm text-white/55">Nessun update pesi nel ciclo corrente.</div>
                                                                )}
                                                            </div>
                                                        </TechCard>

                                                        <TechCard className="p-6 bg-black/40 border-white/10">
                                                            <h3 className="text-lg font-semibold text-white mb-4">[3] Matrice di Correlazione Incrociata</h3>
                                                            <div className="space-y-2">
                                                                {[...sessionsCorrPrimary, ...sessionsCorrExtra].map((corr, idx) => (
                                                                    <div key={`${corr.name}-${idx}`} className="grid grid-cols-[1.5fr_auto_auto_auto] gap-3 items-center rounded-lg border border-white/10 bg-white/5 p-2.5">
                                                                        <div className="text-sm text-white/85">{corr.name}</div>
                                                                        <div className="text-sm font-mono text-white/90">r {fmtNum(corr.r, 3)}</div>
                                                                        <div className="text-sm font-mono text-white/90">p {fmtNum(corr.p_value, 3)}</div>
                                                                        <span className={cn(
                                                                            "text-xs px-2 py-1 rounded border font-semibold text-center",
                                                                            corr.interpretation === 'FORTE'
                                                                                ? "text-[#00D9A5] border-[#00D9A5]/30 bg-[#00D9A5]/10"
                                                                                : corr.interpretation === 'NON SIGNIFICATIVA'
                                                                                    ? "text-white/60 border-white/20 bg-white/5"
                                                                                    : "text-yellow-300 border-yellow-300/30 bg-yellow-500/10"
                                                                        )}>
                                                                            {corr.interpretation}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </TechCard>
                                                    </div>

                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                                        <TechCard className="p-6 bg-black/40 border-white/10 overflow-x-auto">
                                                            <h3 className="text-lg font-semibold text-white mb-3">Matrice Bias × Giorno × Scenario</h3>
                                                            <table className="w-full min-w-[560px] text-left">
                                                                <thead>
                                                                    <tr className="border-b border-white/10">
                                                                        <th className="py-2 text-xs uppercase text-white/70">Scenario</th>
                                                                        {(sessionsScenarioWeekday.days || []).map((d) => (
                                                                            <th key={d} className="py-2 text-xs uppercase text-white/70 text-center">{d}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(sessionsScenarioWeekday.rows || []).map((row) => (
                                                                        <tr key={row.scenario} className="border-b border-white/5 last:border-0">
                                                                            <td className="py-2.5 font-semibold text-white">{row.scenario}</td>
                                                                            {(row.cells || []).map((cell, idx) => (
                                                                                <td key={`${row.scenario}-${idx}`} className="py-2.5 text-center">
                                                                                    <span className={cn("text-xs px-2 py-1 rounded border font-semibold", matrixStateBadgeClass(cell.state))}>
                                                                                        {cell.display}
                                                                                    </span>
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </TechCard>

                                                        <TechCard className="p-6 bg-black/40 border-white/10 overflow-x-auto">
                                                            <h3 className="text-lg font-semibold text-white mb-3">Matrice Bias × Asset</h3>
                                                            <table className="w-full min-w-[520px] text-left">
                                                                <thead>
                                                                    <tr className="border-b border-white/10">
                                                                        <th className="py-2 text-xs uppercase text-white/70">Bias</th>
                                                                        {(sessionsBiasAsset.assets || []).map((asset) => (
                                                                            <th key={asset} className="py-2 text-xs uppercase text-white/70 text-center">{asset}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(sessionsBiasAsset.rows || []).map((row) => (
                                                                        <tr key={row.bias} className="border-b border-white/5 last:border-0">
                                                                            <td className="py-2.5 font-semibold text-white">{row.bias}</td>
                                                                            {(row.cells || []).map((cell, idx) => (
                                                                                <td key={`${row.bias}-${idx}`} className="py-2.5 text-center">
                                                                                    <span className={cn("text-xs px-2 py-1 rounded border font-semibold", matrixStateBadgeClass(cell.state))}>
                                                                                        {cell.display}
                                                                                    </span>
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </TechCard>
                                                    </div>
                                                </>
                                            )}

                                            {(sessionsPlaybookToday.length > 0 || sessionsPlaybookWeek.length > 0 || sessionsPlaybookMonth.length > 0) && (
                                                <TechCard className="p-6 bg-black/40 border-white/10">
                                                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                                        <h3 className="text-lg font-semibold text-white">Playbook Statistico Operativo (Giorno / Settimana / Mese)</h3>
                                                        <div className="text-sm text-white/70">
                                                            aggiornato: {sessionsPlaybook?.generated_at ? new Date(sessionsPlaybook.generated_at).toLocaleString('it-IT') : 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                                        <div className="overflow-x-auto">
                                                            <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Oggi</h4>
                                                            <table className="w-full min-w-[420px] text-left">
                                                                <thead>
                                                                    <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                        <th className="py-2">Asset</th>
                                                                        <th className="py-2">Bias</th>
                                                                        <th className="py-2">Conf.</th>
                                                                        <th className="py-2">Samples</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sessionsPlaybookToday.map((row) => (
                                                                        <tr key={`today-${row.asset}`} className="border-b border-white/5">
                                                                            <td className="py-2.5 font-semibold text-white">{row.asset}</td>
                                                                            <td className={cn(
                                                                                "py-2.5 text-xs font-semibold",
                                                                                row.bias === 'LONG_BIAS'
                                                                                    ? "text-[#00D9A5]"
                                                                                    : row.bias === 'SHORT_BIAS'
                                                                                        ? "text-red-400"
                                                                                        : "text-white/70"
                                                                            )}>{row.bias}</td>
                                                                            <td className="py-2.5 text-cyan-300">{fmtNum(row.confidence, 1)}</td>
                                                                            <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className="overflow-x-auto">
                                                            <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Settimana Corrente</h4>
                                                            <table className="w-full min-w-[480px] text-left">
                                                                <thead>
                                                                    <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                        <th className="py-2">Giorno</th>
                                                                        <th className="py-2">Bias Aggregato</th>
                                                                        <th className="py-2">Best Asset</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sessionsPlaybookWeek.map((row) => {
                                                                        const signals = Array.isArray(row.asset_signals) ? row.asset_signals : [];
                                                                        const best = [...signals].sort((a, b) => (Number(b?.confidence) || 0) - (Number(a?.confidence) || 0))[0] || {};
                                                                        return (
                                                                            <tr key={`week-${row.date}`} className="border-b border-white/5">
                                                                                <td className="py-2.5 text-white/90">{row.weekday}</td>
                                                                                <td className={cn(
                                                                                    "py-2.5 text-xs font-semibold",
                                                                                    row.aggregate_bias === 'LONG_TILT'
                                                                                        ? "text-[#00D9A5]"
                                                                                        : row.aggregate_bias === 'SHORT_TILT'
                                                                                            ? "text-red-400"
                                                                                            : "text-white/70"
                                                                                )}>{row.aggregate_bias}</td>
                                                                                <td className="py-2.5 text-cyan-300 text-xs">{best?.asset || 'N/A'} • {best?.bias || 'NEUTRAL'} • {fmtNum(best?.confidence, 1)}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className="overflow-x-auto">
                                                            <h4 className="text-sm font-semibold text-white mb-2 uppercase tracking-wide">Mese Corrente</h4>
                                                            <table className="w-full min-w-[420px] text-left">
                                                                <thead>
                                                                    <tr className="border-b border-white/10 text-xs uppercase text-white/70">
                                                                        <th className="py-2">Asset</th>
                                                                        <th className="py-2">Bias</th>
                                                                        <th className="py-2">Conf.</th>
                                                                        <th className="py-2">Samples</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sessionsPlaybookMonth.map((row) => (
                                                                        <tr key={`month-${row.asset}`} className="border-b border-white/5">
                                                                            <td className="py-2.5 font-semibold text-white">{row.asset}</td>
                                                                            <td className={cn(
                                                                                "py-2.5 text-xs font-semibold",
                                                                                row.bias === 'LONG_BIAS'
                                                                                    ? "text-[#00D9A5]"
                                                                                    : row.bias === 'SHORT_BIAS'
                                                                                        ? "text-red-400"
                                                                                        : "text-white/70"
                                                                            )}>{row.bias}</td>
                                                                            <td className="py-2.5 text-cyan-300">{fmtNum(row.confidence, 1)}</td>
                                                                            <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </TechCard>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    )}

                    {/* ===== TAB: DEEP RESEARCH 3.0 ===== */}
                    {activeTab === 'deepResearch' && (
                        <div className="space-y-3">
                            {(!deepResearch || deepResearch.status !== 'active') ? (
                                <TechCard className="p-10 text-center border-white/10 bg-black/40">
                                    <Loader2 className="w-8 h-8 text-[#00D9A5]/60 animate-spin mx-auto mb-3" />
                                    <h3 className="text-lg font-semibold text-white mb-2">Deep Research in inizializzazione</h3>
                                    <p className="text-lg text-white/85">
                                        In attesa di campioni sufficienti per segnali probabilistici, coperture e bias temporali.
                                    </p>
                                </TechCard>
                            ) : (
                                <>
                                    <div className="flex items-center gap-1 border-b border-white/10 mb-3">
                                        {DEEP_RESEARCH_SUB_TABS.map((tab) => {
                                            const Icon = tab.icon;
                                            const isActive = deepResearchTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setDeepResearchTab(tab.id)}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-all border-b-2 -mb-px",
                                                        isActive
                                                            ? "border-[#00D9A5] text-[#00D9A5]"
                                                            : "border-transparent text-white/50 hover:text-white"
                                                    )}
                                                >
                                                    <Icon className="w-3.5 h-3.5" />
                                                    {tab.label}
                                                </button>
                                            );
                                        })}
                                        <div className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs text-white/40 truncate max-w-[360px]">
                                            <span className="shrink-0 font-medium text-white/30 uppercase">↪</span>
                                            <span className="truncate">{deepResearchSummaryByTab[deepResearchTab] || ''}</span>
                                        </div>
                                    </div>

                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={`deep-${deepResearchTab}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.14 }}
                                            className="space-y-3"
                                        >
                                            {deepResearchTab === 'signals' && (
                                                <TechCard className="p-4 bg-black/40 border-white/10">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                                        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Selezione Segnali Statistici di Probabilità</h3>
                                                        <div className="text-xs font-mono text-white/60">
                                                            {deepResearch?.meta?.evaluations_count || 0} campioni · {deepResearch?.meta?.signals_count || 0} segnali
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                        {(deepResearch.signals || []).slice(0, 12).map((signal, idx) => (
                                                            <div key={`${signal.asset}-${signal.timeframe}-${idx}`} className="p-3 rounded bg-white/5 border border-white/10 space-y-1.5">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-sm font-semibold text-white">{signal.asset}</span>
                                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">{signal.timeframe?.replace('t_', '')}</span>
                                                                        <span className={cn("text-xs px-1.5 py-0.5 rounded border font-semibold", biasStyle(signal.bias))}>{signal.bias}</span>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-[#00D9A5]">{fmtPct(signal.probability_score)}</span>
                                                                </div>

                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                                                    <div className="bg-black/40 rounded p-2 border border-white/10">
                                                                        <div className="text-white/80">Win Rate</div>
                                                                        <div className="font-semibold text-white">{fmtPct(signal.win_rate)}</div>
                                                                    </div>
                                                                    <div className="bg-black/40 rounded p-2 border border-white/10">
                                                                        <div className="text-white/80">Sample</div>
                                                                        <div className="font-semibold text-white">{signal.sample_size}</div>
                                                                    </div>
                                                                    <div className="bg-black/40 rounded p-2 border border-white/10">
                                                                        <div className="text-white/80">Confluence</div>
                                                                        <div className="font-semibold text-white">{fmtPct(signal.confluence_score)}</div>
                                                                    </div>
                                                                    <div className="bg-black/40 rounded p-2 border border-white/10">
                                                                        <div className="text-white/80">Stability</div>
                                                                        <div className="font-semibold text-white">{fmtPct(signal.stability_score)}</div>
                                                                    </div>
                                                                </div>

                                                                <div className="text-sm font-mono text-white/55">
                                                                    Exp {signal.expectancy} | Payoff {signal.payoff_ratio} | Wilson95 {signal.wilson_95_low}% | Bayes90 {signal.bayes_90_low}%
                                                                </div>
                                                                <div className="text-lg text-white/85">{signal.summary}</div>

                                                                {(signal.correlations || []).length > 0 && (
                                                                    <div className="pt-2 border-t border-white/10 space-y-1">
                                                                        {(signal.correlations || []).slice(0, 3).map((corr, cIdx) => (
                                                                            <div key={cIdx} className="text-sm text-cyan-300/80 font-mono">
                                                                                {corr.pair} ({corr.values}) • lift {corr.lift_wr}% • WR {corr.win_rate}% • n={corr.sample_size}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TechCard>
                                            )}

                                            {deepResearchTab === 'smartMoney' && (
                                                <div className="space-y-4">
                                                    {!smartMoneyData ? (
                                                        <TechCard className="p-6 bg-black/40 border-white/10">
                                                            <div className="flex items-center gap-3 text-white">
                                                                <Loader2 className="w-5 h-5 animate-spin text-[#00D9A5]" />
                                                                <span className="font-semibold">Institutional Radar Positioning in caricamento...</span>
                                                            </div>
                                                            <p className="text-sm text-white/70 mt-3">
                                                                In attesa di cluster UOA/rotazione/cross-asset sufficienti per la mappa composita.
                                                            </p>
                                                        </TechCard>
                                                    ) : smartMoneyData.status !== 'active' ? (
                                                        <TechCard className="p-6 bg-black/40 border-white/10">
                                                            <div className="flex items-center gap-3 text-white">
                                                                <AlertCircle className="w-5 h-5 text-yellow-400" />
                                                                <span className="font-semibold">Institutional Radar Positioning in modalita degradata</span>
                                                            </div>
                                                            <p className="text-sm text-white/70 mt-3">
                                                                {smartMoneyData?.summary?.message || 'Dati live temporaneamente non disponibili.'}
                                                            </p>
                                                        </TechCard>
                                                    ) : (
                                                        <>
                                                            <div className="flex flex-wrap items-stretch gap-3 mb-4">
                                                                {/* MAIN SCORE CARD */}
                                                                <TechCard className="flex-1 min-w-[300px] p-4 bg-gradient-to-br from-black/80 to-black/40 border-white/10 relative overflow-hidden">
                                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D9A5]/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                                                                    <div className="flex items-center justify-between mb-4">
                                                                        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Radar Positioning Score</h3>
                                                                        <span className="text-xs font-mono text-white/40">
                                                                            {smartMoneyData?.generated_at ? new Date(smartMoneyData.generated_at).toLocaleString('it-IT') : 'N/A'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-end gap-6">
                                                                        <div>
                                                                            <div className="text-sm font-semibold uppercase tracking-wide text-[#00D9A5]/90 font-semibold mb-1">Global Score</div>
                                                                            <div className="text-xl font-semibold tracking-tight text-white">{fmtNum(smartSummary?.global_score, 1)}</div>
                                                                        </div>
                                                                        <div className="flex gap-4 pb-1">
                                                                            <div>
                                                                                <div className="text-sm font-medium uppercase tracking-wide text-white/60 mb-1">Aggressive</div>
                                                                                <div className="text-xl font-semibold tracking-tight text-cyan-300">{fmtNum(smartAggScore, 1)}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-sm font-medium uppercase tracking-wide text-white/60 mb-1">Conservative</div>
                                                                                <div className="text-xl font-semibold tracking-tight text-yellow-300">{fmtNum(smartConsScore, 1)}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-sm">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-white/60">Dominant State:</span>
                                                                            <span className="font-semibold text-white">{smartSummary?.state || 'N/A'}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-white/60">Top Theme:</span>
                                                                            <span className="font-semibold text-[#00D9A5]">{smartSummary?.top_theme || 'N/A'}</span>
                                                                        </div>
                                                                    </div>
                                                                </TechCard>

                                                                {/* MACRO FILTER CARD */}
                                                                <TechCard className="flex-1 min-w-[200px] p-4 bg-black/40 border-white/10 flex flex-col justify-between">
                                                                    <div>
                                                                        <h3 className="text-base font-semibold text-white/80 uppercase tracking-wide mb-4">Macro Environment</h3>
                                                                        <div className="space-y-3">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-white/70 text-base font-medium">Regime</span>
                                                                                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold border", biasStyle(smartMacro?.regime))}>{smartMacro?.regime || 'MIXED'}</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-white/70 text-base font-medium">Growth/Inflation</span>
                                                                                <span className="text-white text-base font-semibold">{smartMacro?.growth_proxy?.charAt(0) || '-'}/{smartMacro?.inflation_proxy?.charAt(0) || '-'}</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-white/70 text-base font-medium">Liquidity</span>
                                                                                <span className="text-cyan-300 text-base font-semibold">{smartMacro?.liquidity_tone || 'N/A'}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-4 pt-3 border-t border-white/10">
                                                                        <div className="flex items-center justify-between mb-1.5">
                                                                            <span className="text-sm font-medium uppercase tracking-wide text-white/60">Filter Score</span>
                                                                            <span className="text-xs font-mono text-[#00D9A5]">{fmtNum(smartMacroScores?.macro_filter_score, 1)}</span>
                                                                        </div>
                                                                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                                            <div
                                                                                className="h-full bg-[#00D9A5]"
                                                                                style={{ width: `${Math.max(0, Math.min(100, Number(smartMacroScores?.macro_filter_score) || 0))}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </TechCard>

                                                                {/* ALERT ENGINE CARD */}
                                                                <TechCard className="flex-1 min-w-[200px] p-4 bg-black/40 border-white/10 overflow-hidden flex flex-col">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wide">Live Alerts</h3>
                                                                        <div className={cn("w-2 h-2 rounded-full", smartAlerts?.global_risk === 'HIGH' ? 'bg-red-500 animate-pulse' : smartAlerts?.global_risk === 'MEDIUM' ? 'bg-yellow-400' : 'bg-[#00D9A5]')}></div>
                                                                    </div>
                                                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                                                        {smartAlertsRows.length > 0 ? smartAlertsRows.slice(0, 4).map((alert, idx) => (
                                                                            <div key={idx} className="flex flex-col gap-1 p-2.5 rounded-lg bg-white/5 border border-white/5">
                                                                                <div className="flex justify-between items-start">
                                                                                    <span className="text-base font-semibold text-white leading-tight">{alert.theme}</span>
                                                                                    <span className={cn(
                                                                                        "text-xs px-2 py-0.5 rounded font-semibold uppercase",
                                                                                        alert.severity === 'HIGH' ? "text-red-400 bg-red-400/10" : alert.severity === 'MEDIUM' ? "text-yellow-300 bg-yellow-300/10" : "text-cyan-300 bg-cyan-300/10"
                                                                                    )}>{alert.severity}</span>
                                                                                </div>
                                                                                <span className="text-sm text-white/70 line-clamp-1">{alert.stance}</span>
                                                                            </div>
                                                                        )) : (
                                                                            <div className="flex items-center justify-center h-full text-sm text-white/40">Nessun alert attivo</div>
                                                                        )}
                                                                    </div>
                                                                </TechCard>
                                                            </div>

                                                            {Array.isArray(smartMoneyData?.data_coverage?.warnings) && smartMoneyData.data_coverage.warnings.length > 0 && (
                                                                <div className="mb-4 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300/80 flex items-center gap-2">
                                                                    <AlertCircle className="w-4 h-4" />
                                                                    Data coverage issues: {smartMoneyData.data_coverage.warnings.slice(0, 2).join(' | ')}
                                                                </div>
                                                            )}


                                                            {/* PROFESSIONAL TERMINAL GRID FOR MODULES */}
                                                            <div className="mt-6 mb-8">
                                                                <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                                                                    <h2 className="text-base font-semibold text-white uppercase tracking-wide">Research Modules Overlay</h2>
                                                                    <div className="text-sm font-semibold text-[#00D9A5]">8 ACTIVE</div>
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-cyan-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded" onClick={() => setRadarDetailModal('explainability')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <Layers className="w-4 h-4 text-cyan-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Explainability</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">Edge composition e snapshot temi per composite score.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <span className="text-xs uppercase tracking-wide text-white/50">Top Theme</span>
                                                                            <span className="text-base font-semibold text-white truncate max-w-[120px]">{smartThemes[0]?.theme || 'N/A'}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-yellow-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded" onClick={() => setRadarDetailModal('crossAsset')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <Globe className="w-4 h-4 text-yellow-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Cross-Asset Flags</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">Segnali macro e intermarket attivi nel ciclo corrente.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <span className="text-xs uppercase tracking-wide text-white/50">Flags Attivi</span>
                                                                            <span className="text-base font-semibold text-white">{smartCrossActive.length}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-blue-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded" onClick={() => setRadarDetailModal('historical')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <Database className="w-4 h-4 text-blue-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Analisi 10Y & Test</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">CAGR, Drawdown, Test Trend/Win Rate storici.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <span className="text-xs uppercase tracking-wide text-white/50">Temi Testati</span>
                                                                            <span className="text-base font-semibold text-white">{smartHistoricalThemeRows.length}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-purple-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded" onClick={() => setRadarDetailModal('playbook')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <BarChart3 className="w-4 h-4 text-purple-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Playbook / Leaderboard</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">Classifica top conviction operativa multi-timeframe.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <span className="text-xs uppercase tracking-wide text-white/50">Record Attivi</span>
                                                                            <span className="text-base font-semibold text-white">{smartFilteredLeaderboardRows.length}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-red-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded" onClick={() => setRadarDetailModal('uoa')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <Zap className="w-4 h-4 text-red-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">UOA Watchlist</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">Cluster anomalie opzioni, sweep ratio ed effect sizing.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <span className="text-xs uppercase tracking-wide text-white/50">Top Anomalie</span>
                                                                            <span className="text-base font-semibold text-white">{smartUoa.length}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-orange-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded" onClick={() => setRadarDetailModal('insights')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <Shield className="w-4 h-4 text-orange-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Dynamic Insights</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">News Lag, Signal Decay, Regime Switch e Lead/Lag.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <span className="text-xs uppercase tracking-wide text-white/50">Regime State</span>
                                                                            <span className="text-base font-semibold text-white">{smartRegimeSwitch?.switch_state || 'N/A'}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="p-3 bg-black/60 border border-white/10 hover:border-indigo-500/40 hover:bg-white/5 transition-all flex flex-col justify-between cursor-pointer group rounded lg:col-span-2" onClick={() => setRadarDetailModal('overlays')}>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <BrainCircuit className="w-4 h-4 text-indigo-400" />
                                                                                <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Advanced Overlays</h3>
                                                                            </div>
                                                                            <p className="text-white/60 text-sm leading-relaxed">Counterfactual Lab, Execution Risk, Score Bucket e Macro Events.</p>
                                                                        </div>
                                                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                                                                            <div className="flex items-center gap-6">
                                                                                <div>
                                                                                    <span className="text-xs uppercase tracking-wide text-white/50 mr-2">Macro Risk Limit</span>
                                                                                    <span className="text-base font-semibold text-white">{smartMacroEventOverlay?.risk_level || 'N/A'}</span>
                                                                                </div>
                                                                                <div className="hidden sm:block">
                                                                                    <span className="text-xs uppercase tracking-wide text-white/50 mr-2">Upgraded by Cross</span>
                                                                                    <span className="text-base font-semibold text-white">{smartCounterfactualLab?.themes_upgraded_by_cross || 0}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                </div>
                                                            </div>

                                                            {/* --- Pannello Dettaglio Inline --- */}
                                                            <AnimatePresence>
                                                                {radarDetailModal && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, height: 0 }}
                                                                        animate={{ opacity: 1, height: 'auto' }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <div className="mt-3 border border-white/10 rounded bg-[#0a0a0c]">
                                                                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-1 h-4 bg-cyan-500 rounded-full" />
                                                                                    <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                                                                                        {radarDetailModal === 'explainability' && 'Explainability Mix & Theme Ranking'}
                                                                                        {radarDetailModal === 'crossAsset' && 'Cross-Asset Flags Attivi'}
                                                                                        {radarDetailModal === 'historical' && 'Analisi Storica 10Y & Test Statistici'}
                                                                                        {radarDetailModal === 'playbook' && 'Leaderboard & Playbook Operativo'}
                                                                                        {radarDetailModal === 'uoa' && 'UOA Watchlist (Anomaly Cluster)'}
                                                                                        {radarDetailModal === 'insights' && 'Dynamic Insights'}
                                                                                        {radarDetailModal === 'overlays' && 'Advanced Overlays'}
                                                                                    </h2>
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => setRadarDetailModal(null)}
                                                                                    className="text-white/40 hover:text-white text-lg leading-none px-2 py-1 hover:bg-white/10 rounded transition-all"
                                                                                >✕</button>
                                                                            </div>
                                                                            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-4">
                                                                                {radarDetailModal === 'explainability' && (<><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                                                        <div className="flex items-center gap-2 mb-3">
                                                                                            <Layers className="w-4 h-4 text-cyan-300" />
                                                                                            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Explainability Mix</h3>
                                                                                        </div>
                                                                                        <div className="space-y-4">
                                                                                            <div className="flex flex-wrap gap-2 text-xs">
                                                                                                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex-1 min-w-[100px]">
                                                                                                    <div className="text-white/60 mb-1 tracking-wider uppercase text-sm">UOA Edge</div>
                                                                                                    <div className="font-semibold text-cyan-300">{fmtNum(smartLayerMix?.uoa_pct, 1)}%</div>
                                                                                                </div>
                                                                                                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex-1 min-w-[100px]">
                                                                                                    <div className="text-white/60 mb-1 tracking-wider uppercase text-sm">Rotation</div>
                                                                                                    <div className="font-semibold text-white/80">{fmtNum(smartLayerMix?.rotation_pct, 1)}%</div>
                                                                                                </div>
                                                                                                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex-1 min-w-[100px]">
                                                                                                    <div className="text-white/60 mb-1 tracking-wider uppercase text-sm">Cross-Asset</div>
                                                                                                    <div className="font-semibold text-white/80">{fmtNum(smartLayerMix?.cross_asset_pct, 1)}%</div>
                                                                                                </div>
                                                                                                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex-1 min-w-[100px]">
                                                                                                    <div className="text-white/60 mb-1 tracking-wider uppercase text-sm">Hist Edge</div>
                                                                                                    <div className="font-semibold text-yellow-300">{fmtNum(smartLayerMix?.historical_edge_pct, 1)}%</div>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="space-y-2">
                                                                                                {smartExplainRows.slice(0, 3).map((row) => (
                                                                                                    <div key={row.theme} className="flex justify-between items-center py-1.5 border-b border-white/5">
                                                                                                        <span className="text-sm font-semibold text-white">{row.theme}</span>
                                                                                                        <div className="flex gap-3 text-xs text-white/60">
                                                                                                            <span>U: {fmtNum(row?.layers?.uoa_pct, 0)}%</span>
                                                                                                            <span>R: {fmtNum(row?.layers?.rotation_pct, 0)}%</span>
                                                                                                            <span>C: {fmtNum(row?.layers?.cross_asset_pct, 0)}%</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    </TechCard>

                                                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                                                        <div className="flex items-center gap-2 mb-3">
                                                                                            <Activity className="w-4 h-4 text-[#00D9A5]" />
                                                                                            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Theme Ranking Snapshot</h3>
                                                                                        </div>
                                                                                        <div className="space-y-2">
                                                                                            {smartThemes.slice(0, 4).map((row) => (
                                                                                                <div key={row.theme} className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                                                                                                    <div>
                                                                                                        <div className="text-sm font-semibold text-white leading-tight">{row.theme}</div>
                                                                                                        <div className="text-xs text-white/40 uppercase tracking-wide">{row.sector}</div>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-4">
                                                                                                        <div className="text-right">
                                                                                                            <div className="text-xs text-white/40 uppercase mb-0.5">Bucket</div>
                                                                                                            <span className={cn("text-xs px-1.5 py-0.5 rounded font-semibold", biasStyle(row.bucket))}>{row.bucket}</span>
                                                                                                        </div>
                                                                                                        <div className="text-right">
                                                                                                            <div className="text-xs text-white/40 uppercase mb-0.5">Score</div>
                                                                                                            <div className="text-sm font-semibold text-[#00D9A5]">{fmtNum(row.composite_score, 1)}</div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                        <button className="w-full mt-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wide border border-white/5 hover:border-white/10 hover:text-white rounded-lg transition-colors">
                                                                                            View Full Ranking
                                                                                        </button>
                                                                                    </TechCard>
                                                                                </div>

                                                                                </>)}{radarDetailModal === 'crossAsset' && (<><TechCard className="p-5 bg-black/40 border-white/10">
                                                                                    <h3 className="text-lg font-semibold text-white mb-3">Cross-Asset Flags Attivi</h3>
                                                                                    {smartCrossActive.length === 0 ? (
                                                                                        <p className="text-sm text-white/70">Nessun flag attivo di alta qualità nel ciclo corrente.</p>
                                                                                    ) : (
                                                                                        <div className="space-y-2">
                                                                                            {smartCrossActive.map((flag) => (
                                                                                                <div key={flag.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                                        <div className="font-semibold text-white text-sm">{flag.label}</div>
                                                                                                        <span className="text-xs font-mono text-[#00D9A5]">w {flag.weight}</span>
                                                                                                    </div>
                                                                                                    <div className="text-xs text-white/70 mt-1">{flag.scenario}</div>
                                                                                                    <div className="text-sm text-cyan-300/80 mt-1">
                                                                                                        themes: {(flag.themes || []).join(', ')}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </TechCard>

                                                                                </>)}{radarDetailModal === 'historical' && (<><div className="mt-8 space-y-4">
                                                                                    <h3 className="text-xl font-semibold text-white mb-4 border-b border-white/10 pb-2">Analisi Storica 10Y & Test Statistici</h3>

                                                                                    <details className="group border border-white/10 bg-black/40 rounded-xl overflow-hidden">
                                                                                        <summary className="flex items-center justify-between p-5 cursor-pointer bg-white/5 hover:bg-white/10 transition-colors">
                                                                                            <div className="flex items-center gap-3">
                                                                                                <Database className="w-5 h-5 text-cyan-300" />
                                                                                                <h4 className="text-sm font-semibold text-white uppercase tracking-wide">Storico CAGR / Vol / Drawdown 10Y</h4>
                                                                                            </div>
                                                                                            <div className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-open:rotate-180 transition-transform">
                                                                                                ↓
                                                                                            </div>
                                                                                        </summary>
                                                                                        <div className="p-5 overflow-x-auto border-t border-white/10">
                                                                                            <table className="w-full min-w-[980px] text-left">
                                                                                                <thead>
                                                                                                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                        <th className="py-2">Theme</th>
                                                                                                        <th className="py-2">1Y</th>
                                                                                                        <th className="py-2">3Y</th>
                                                                                                        <th className="py-2">CAGR 10Y</th>
                                                                                                        <th className="py-2">Vol 10Y</th>
                                                                                                        <th className="py-2">MaxDD 10Y</th>
                                                                                                        <th className="py-2">Corr SPY 10Y</th>
                                                                                                        <th className="py-2">State</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {smartHistoricalThemeRows.slice(0, 8).map((row) => (
                                                                                                        <tr key={`hist-${row.theme}`} className="border-b border-white/5">
                                                                                                            <td className="py-2.5">
                                                                                                                <div className="font-semibold text-white">{row.theme}</div>
                                                                                                                <div className="text-xs text-white/60">{row.proxy} • n {row.samples_10y || 0}</div>
                                                                                                            </td>
                                                                                                            <td className={cn("py-2.5 font-semibold", Number(row.return_1y_pct) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(row.return_1y_pct, 1, '%')}</td>
                                                                                                            <td className={cn("py-2.5 font-semibold", Number(row.return_3y_pct) >= 0 ? "text-cyan-300" : "text-red-400")}>{fmtSigned(row.return_3y_pct, 1, '%')}</td>
                                                                                                            <td className={cn("py-2.5 font-semibold", Number(row.cagr_10y_pct) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(row.cagr_10y_pct, 1, '%')}</td>
                                                                                                            <td className="py-2.5 text-white/80">{fmtNum(row.vol_10y_pct, 1)}%</td>
                                                                                                            <td className="py-2.5 text-red-400">{fmtNum(row.max_drawdown_10y_pct, 1)}%</td>
                                                                                                            <td className="py-2.5 text-white/80">{fmtNum(row.corr_spy_10y, 3)}</td>
                                                                                                            <td className={cn(
                                                                                                                "py-2.5 text-xs font-semibold",
                                                                                                                row.momentum_state === 'HOT'
                                                                                                                    ? "text-[#00D9A5]"
                                                                                                                    : row.momentum_state === 'COLD'
                                                                                                                        ? "text-red-400"
                                                                                                                        : "text-white/70"
                                                                                                            )}>{row.momentum_state}</td>
                                                                                                        </tr>
                                                                                                    ))}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                    </details>

                                                                                    <details className="group border border-white/10 bg-black/40 rounded-xl overflow-hidden">
                                                                                        <summary className="flex items-center justify-between p-5 cursor-pointer bg-white/5 hover:bg-white/10 transition-colors">
                                                                                            <div className="flex items-center gap-3">
                                                                                                <Activity className="w-5 h-5 text-[#00D9A5]" />
                                                                                                <h4 className="text-sm font-semibold text-white uppercase tracking-wide">Test Statistici & Correlazioni Cross-Asset 10Y</h4>
                                                                                            </div>
                                                                                            <div className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-white/50 group-open:rotate-180 transition-transform">
                                                                                                ↓
                                                                                            </div>
                                                                                        </summary>
                                                                                        <div className="p-5 overflow-x-auto border-t border-white/10 space-y-6">
                                                                                            <div>
                                                                                                <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Test Statistici per Tema</h5>
                                                                                                <table className="w-full min-w-[980px] text-left">
                                                                                                    <thead>
                                                                                                        <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                            <th className="py-2">Theme</th>
                                                                                                            <th className="py-2">Trend t</th>
                                                                                                            <th className="py-2">Trend p</th>
                                                                                                            <th className="py-2">Win z</th>
                                                                                                            <th className="py-2">Win p</th>
                                                                                                            <th className="py-2">Tail 5%</th>
                                                                                                            <th className="py-2">Tail 95%</th>
                                                                                                            <th className="py-2">VIX Spread</th>
                                                                                                            <th className="py-2">Regime</th>
                                                                                                        </tr>
                                                                                                    </thead>
                                                                                                    <tbody>
                                                                                                        {smartHistoricalTestRows.slice(0, 5).map((row) => (
                                                                                                            <tr key={`test-${row.theme}`} className="border-b border-white/5">
                                                                                                                <td className="py-2.5">
                                                                                                                    <div className="font-semibold text-white">{row.theme}</div>
                                                                                                                    <div className="text-xs text-white/60">{row.proxy} • n {row.sample_days || 0}</div>
                                                                                                                </td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Math.abs(Number(row.trend_t_stat_10y || 0)) >= 1.96 ? "text-[#00D9A5]" : "text-white/80")}>{fmtNum(row.trend_t_stat_10y, 2)}</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Number(row.trend_p_value_10y) <= 0.05 ? "text-[#00D9A5]" : "text-white/80")}>{fmtNum(row.trend_p_value_10y, 4)}</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Math.abs(Number(row.win_rate_z_10y || 0)) >= 1.96 ? "text-cyan-300" : "text-white/80")}>{fmtNum(row.win_rate_z_10y, 2)}</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Number(row.win_rate_p_value_10y) <= 0.05 ? "text-cyan-300" : "text-white/80")}>{fmtNum(row.win_rate_p_value_10y, 4)}</td>
                                                                                                                <td className="py-2.5 text-red-400">{fmtNum(row.tail_5pct_daily_return_pct, 3)}%</td>
                                                                                                                <td className="py-2.5 text-[#00D9A5]">{fmtNum(row.tail_95pct_daily_return_pct, 3)}%</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Number(row.vix_regime_spread_daily_pct) >= 0 ? "text-yellow-300" : "text-red-400")}>{fmtSigned(row.vix_regime_spread_daily_pct, 3, '%')}</td>
                                                                                                                <td className={cn(
                                                                                                                    "py-2.5 text-xs font-semibold",
                                                                                                                    row.regime_edge_state === 'STRONG' ? "text-[#00D9A5]" : row.regime_edge_state === 'MODERATE' ? "text-yellow-300" : "text-white/70"
                                                                                                                )}>{row.regime_edge_state}</td>
                                                                                                            </tr>
                                                                                                        ))}
                                                                                                    </tbody>
                                                                                                </table>
                                                                                            </div>

                                                                                            <div>
                                                                                                <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Correlazioni Cross-Asset Top (10Y vs 1Y)</h5>
                                                                                                <table className="w-full min-w-[760px] text-left">
                                                                                                    <thead>
                                                                                                        <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                            <th className="py-2">Pair</th>
                                                                                                            <th className="py-2">Corr 10Y</th>
                                                                                                            <th className="py-2">Corr 1Y</th>
                                                                                                            <th className="py-2">Delta</th>
                                                                                                        </tr>
                                                                                                    </thead>
                                                                                                    <tbody>
                                                                                                        {smartHistoricalCorrRows.slice(0, 5).map((row, idx) => (
                                                                                                            <tr key={`corr-${idx}`} className="border-b border-white/5">
                                                                                                                <td className="py-2.5 font-semibold text-white">{row.pair}</td>
                                                                                                                <td className="py-2.5 text-white/80">{fmtNum(row.corr_10y, 3)}</td>
                                                                                                                <td className="py-2.5 text-cyan-300">{fmtNum(row.corr_1y, 3)}</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Number(row.corr_delta) >= 0 ? "text-yellow-300" : "text-red-400")}>{fmtSigned(row.corr_delta, 3)}</td>
                                                                                                            </tr>
                                                                                                        ))}
                                                                                                    </tbody>
                                                                                                </table>
                                                                                            </div>
                                                                                        </div>
                                                                                    </details>
                                                                                </div>

                                                                                </>)}{radarDetailModal === 'playbook' && (<><div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-8">
                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 xl:col-span-2 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">Playbook Operativo 10Y (Giorno / Settimana / Mese)</h3>
                                                                                        <table className="w-full min-w-[1080px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">Day</th>
                                                                                                    <th className="py-2">Day Mean</th>
                                                                                                    <th className="py-2">Day WR</th>
                                                                                                    <th className="py-2">Week</th>
                                                                                                    <th className="py-2">Month</th>
                                                                                                    <th className="py-2">Conviction</th>
                                                                                                    <th className="py-2">Risk</th>
                                                                                                    <th className="py-2">Action</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartFilteredPlaybookTodayRows.slice(0, 6).map((row) => (
                                                                                                    <tr key={`playbook-${row.theme}`} className="border-b border-white/5">
                                                                                                        <td className="py-2.5">
                                                                                                            <div className="font-semibold text-white">{row.theme}</div>
                                                                                                            <div className="text-xs text-white/60">{row.proxy}</div>
                                                                                                        </td>
                                                                                                        <td className="py-2.5 text-cyan-300 font-semibold">{row.effective_weekday || weekdayLabel(smartHistoricalPlaybook?.effective_weekday_idx)}</td>
                                                                                                        <td className={cn("py-2.5 font-semibold", Number(row.today_mean_pct) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(row.today_mean_pct, 3, '%')}</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.today_win_rate_pct, 1)}%</td>
                                                                                                        <td className={cn("py-2.5 text-xs font-semibold", biasStyle(row.week_signal))}>{row.week_signal}</td>
                                                                                                        <td className={cn("py-2.5 text-xs font-semibold", biasStyle(row.month_signal))}>{row.month_signal}</td>
                                                                                                        <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.conviction_score, 1)}</td>
                                                                                                        <td className="py-2.5 text-white/80">{row.risk_profile}</td>
                                                                                                        <td className="py-2.5 text-xs text-white/75">{row.action}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                                {smartFilteredPlaybookTodayRows.length === 0 && (
                                                                                                    <tr>
                                                                                                        <td colSpan={9} className="py-3 text-sm text-white/55">Nessun risultato con i filtri correnti.</td>
                                                                                                    </tr>
                                                                                                )}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        <div className="text-xs text-white/60 mt-3">
                                                                                            weekday {smartHistoricalPlaybook?.effective_weekday || weekdayLabel(smartHistoricalPlaybook?.effective_weekday_idx)} • month {smartHistoricalPlaybook?.month_name || 'N/A'} • weekend proxy {smartHistoricalPlaybook?.weekend_proxy_mode ? 'ON' : 'OFF'}
                                                                                        </div>
                                                                                    </TechCard>

                                                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                                                        <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">Playbook Stats Snapshot</h3>
                                                                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                                                                            <div className="p-3 rounded-lg bg-white/5 border border-white/10 relative overflow-hidden">
                                                                                                <div className="absolute top-0 right-0 w-8 h-8 bg-[#00D9A5]/10 rounded-bl-full"></div>
                                                                                                <div className="text-xs text-white/50 uppercase tracking-wide mb-1">Bull Day</div>
                                                                                                <div className="text-2xl font-semibold text-[#00D9A5] leading-none">{smartHistoricalPlaybookSummary?.bullish_today_count || 0}</div>
                                                                                            </div>
                                                                                            <div className="p-3 rounded-lg bg-white/5 border border-white/10 relative overflow-hidden">
                                                                                                <div className="absolute top-0 right-0 w-8 h-8 bg-red-400/10 rounded-bl-full"></div>
                                                                                                <div className="text-xs text-white/50 uppercase tracking-wide mb-1">Bear Day</div>
                                                                                                <div className="text-2xl font-semibold text-red-400 leading-none">{smartHistoricalPlaybookSummary?.bearish_today_count || 0}</div>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="space-y-2 text-xs">
                                                                                            <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                                                                                                <span className="text-white/60 uppercase tracking-wider text-xs">Bull Week / Bear Week</span>
                                                                                                <div className="font-semibold"><span className="text-cyan-300">{smartHistoricalPlaybookSummary?.bullish_week_count || 0}</span> <span className="text-white/30 px-1">|</span> <span className="text-yellow-300">{smartHistoricalPlaybookSummary?.bearish_week_count || 0}</span></div>
                                                                                            </div>
                                                                                            <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                                                                                                <span className="text-white/60 uppercase tracking-wider text-xs">Bull Month / Bear Month</span>
                                                                                                <div className="font-semibold"><span className="text-[#00D9A5]">{smartHistoricalPlaybookSummary?.bullish_month_count || 0}</span> <span className="text-white/30 px-1">|</span> <span className="text-red-400">{smartHistoricalPlaybookSummary?.bearish_month_count || 0}</span></div>
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="mt-3 text-xs text-white/70">
                                                                                            structural breaks {smartHistorical10y?.summary?.structural_break_pairs || 0} • regime shift {smartHistorical10y?.summary?.regime_shift_pairs || 0}
                                                                                        </div>
                                                                                        <div className="mt-1 text-xs text-cyan-300/80">
                                                                                            rows leaderboard {smartHistorical10y?.coverage?.leaderboard_rows || 0} • rows playbook {smartHistorical10y?.coverage?.playbook_rows || 0}
                                                                                        </div>
                                                                                    </TechCard>
                                                                                </div>
                                                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                        <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                            <h3 className="text-lg font-semibold text-white mb-3">Institutional Leaderboard 10Y</h3>
                                                                                            <table className="w-full min-w-[1060px] text-left">
                                                                                                <thead>
                                                                                                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                        <th className="py-2">Theme</th>
                                                                                                        <th className="py-2">Conviction</th>
                                                                                                        <th className="py-2">Today</th>
                                                                                                        <th className="py-2">Week</th>
                                                                                                        <th className="py-2">Month</th>
                                                                                                        <th className="py-2">CAGR 10Y</th>
                                                                                                        <th className="py-2">MaxDD 10Y</th>
                                                                                                        <th className="py-2">Stability</th>
                                                                                                        <th className="py-2">Action</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {smartFilteredLeaderboardRows.slice(0, 10).map((row) => (
                                                                                                        <tr key={`leader-${row.theme}`} className="border-b border-white/5">
                                                                                                            <td className="py-2.5">
                                                                                                                <div className="font-semibold text-white">{row.theme}</div>
                                                                                                                <div className="text-xs text-white/60">{row.proxy} • {row.risk_profile}</div>
                                                                                                            </td>
                                                                                                            <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.conviction_score, 1)}</td>
                                                                                                            <td className={cn("py-2.5 text-xs font-semibold", biasStyle(row.today_signal))}>{row.today_signal}</td>
                                                                                                            <td className={cn("py-2.5 text-xs font-semibold", biasStyle(row.week_signal))}>{row.week_signal}</td>
                                                                                                            <td className={cn("py-2.5 text-xs font-semibold", biasStyle(row.month_signal))}>{row.month_signal}</td>
                                                                                                            <td className={cn("py-2.5 font-semibold", Number(row.cagr_10y_pct) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(row.cagr_10y_pct, 2, '%')}</td>
                                                                                                            <td className="py-2.5 text-red-400">{fmtNum(row.max_drawdown_10y_pct, 2)}%</td>
                                                                                                            <td className="py-2.5 text-white/80">{row.corr_spy_stability_state || 'N/A'} • {row.corr_spy_significance_10y || 'N/A'}</td>
                                                                                                            <td className="py-2.5 text-xs text-white/75">{row.action}</td>
                                                                                                        </tr>
                                                                                                    ))}
                                                                                                    {smartFilteredLeaderboardRows.length === 0 && (
                                                                                                        <tr>
                                                                                                            <td colSpan={9} className="py-3 text-sm text-white/55">Nessun tema in leaderboard con i filtri attuali.</td>
                                                                                                        </tr>
                                                                                                    )}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </TechCard>

                                                                                        <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                            <h3 className="text-lg font-semibold text-white mb-3">Week / Month Direction Matrix</h3>
                                                                                            <table className="w-full min-w-[780px] text-left">
                                                                                                <thead>
                                                                                                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                        <th className="py-2">Theme</th>
                                                                                                        <th className="py-2">Week Mean</th>
                                                                                                        <th className="py-2">Week WR</th>
                                                                                                        <th className="py-2">Best/Worst Day</th>
                                                                                                        <th className="py-2">Month Mean</th>
                                                                                                        <th className="py-2">Month WR</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {smartFilteredPlaybookWeekRows.slice(0, 8).map((weekRow) => {
                                                                                                        const monthRow = smartFilteredPlaybookMonthRows.find((m) => m.theme === weekRow.theme) || {};
                                                                                                        return (
                                                                                                            <tr key={`week-month-${weekRow.theme}`} className="border-b border-white/5">
                                                                                                                <td className="py-2.5 font-semibold text-white">{weekRow.theme}</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Number(weekRow.week_mean_pct) >= 0 ? "text-[#00D9A5]" : "text-red-400")}>{fmtSigned(weekRow.week_mean_pct, 3, '%')}</td>
                                                                                                                <td className="py-2.5 text-white/80">{fmtNum(weekRow.week_win_rate_pct, 1)}%</td>
                                                                                                                <td className="py-2.5 text-cyan-300">{weekdayLabel(weekRow.best_weekday_idx)} / {weekdayLabel(weekRow.worst_weekday_idx)}</td>
                                                                                                                <td className={cn("py-2.5 font-semibold", Number(monthRow.month_mean_pct) >= 0 ? "text-yellow-300" : "text-red-400")}>{fmtSigned(monthRow.month_mean_pct, 3, '%')}</td>
                                                                                                                <td className="py-2.5 text-white/80">{fmtNum(monthRow.month_win_rate_pct, 1)}%</td>
                                                                                                            </tr>
                                                                                                        );
                                                                                                    })}
                                                                                                    {smartFilteredPlaybookWeekRows.length === 0 && (
                                                                                                        <tr>
                                                                                                            <td colSpan={6} className="py-3 text-sm text-white/55">Nessuna combinazione week/month con i filtri correnti.</td>
                                                                                                        </tr>
                                                                                                    )}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </TechCard>
                                                                                    </div>

                                                                                </>)}{radarDetailModal === 'uoa' && (<><div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">UOA Watchlist (Anomaly Cluster)</h3>
                                                                                        <table className="w-full min-w-[920px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Ticker</th>
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">Anomaly</th>
                                                                                                    <th className="py-2">Quality</th>
                                                                                                    <th className="py-2">Vol/OI</th>
                                                                                                    <th className="py-2">Sweep</th>
                                                                                                    <th className="py-2">Agg Fill</th>
                                                                                                    <th className="py-2">DTE</th>
                                                                                                    <th className="py-2">Block $</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartUoa.slice(0, 10).map((row, idx) => (
                                                                                                    <tr key={`${row.ticker}-${idx}`} className="border-b border-white/5">
                                                                                                        <td className="py-2.5 font-semibold text-white">{row.ticker}</td>
                                                                                                        <td className="py-2.5 text-white/80 text-xs">{(row.themes || []).join(', ')}</td>
                                                                                                        <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.anomaly_score, 1)}</td>
                                                                                                        <td className="py-2.5 text-yellow-300">{fmtNum(row?.quality_score ?? row?.metrics?.quality_score, 1)}</td>
                                                                                                        <td className="py-2.5 text-white/85">{fmtNum(row?.metrics?.volume_oi_ratio, 2)}x</td>
                                                                                                        <td className="py-2.5 text-white/85">{fmtPct(Number(row?.metrics?.sweep_ratio) * 100, 0)}</td>
                                                                                                        <td className="py-2.5 text-white/85">{fmtPct(row?.metrics?.aggressive_fill_pct, 0)}</td>
                                                                                                        <td className="py-2.5 text-white/85">{row?.dte ?? row?.metrics?.dte ?? '—'}</td>
                                                                                                        <td className="py-2.5 text-cyan-300 font-mono">{Number(row?.metrics?.block_premium_usd || 0).toLocaleString('it-IT')}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </TechCard>

                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">News Lag Model per Tema</h3>
                                                                                        <table className="w-full min-w-[680px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">Avg Hist (h)</th>
                                                                                                    <th className="py-2">Current Lead (h)</th>
                                                                                                    <th className="py-2">Edge Window (h)</th>
                                                                                                    <th className="py-2">Sample (d)</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartLagRows.map((row) => (
                                                                                                    <tr key={row.theme} className="border-b border-white/5">
                                                                                                        <td className="py-2.5 font-semibold text-white">{row.theme}</td>
                                                                                                        <td className="py-2.5 text-white/80">{row.historical_avg_lead_hours}</td>
                                                                                                        <td className="py-2.5 text-[#00D9A5] font-semibold">{row.estimated_current_lead_hours}</td>
                                                                                                        <td className="py-2.5 text-cyan-300">{row.edge_window_hours}</td>
                                                                                                        <td className="py-2.5 text-white/80">{row.calibration_sample_days ?? '—'}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        <div className="text-xs text-white/60 mt-3">
                                                                                            Lead medio stimato: {fmtNum(smartMoneyData?.news_lag_model?.average_estimated_lead_hours, 1)}h.
                                                                                            Il modello valuta il lag narrativo, non produce segnali di esecuzione.
                                                                                        </div>
                                                                                    </TechCard>
                                                                                </div>

                                                                                </>)}{radarDetailModal === 'insights' && (<><div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">Lead-Lag Radar</h3>
                                                                                        <table className="w-full min-w-[760px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">Rank</th>
                                                                                                    <th className="py-2">Edge</th>
                                                                                                    <th className="py-2">Lead (h)</th>
                                                                                                    <th className="py-2">Delta (h)</th>
                                                                                                    <th className="py-2">Confidence</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartLeadLagRows.slice(0, 6).map((row) => (
                                                                                                    <tr key={row.theme} className="border-b border-white/5">
                                                                                                        <td className="py-2.5 font-semibold text-white">{row.theme}</td>
                                                                                                        <td className="py-2.5 text-[#00D9A5] font-semibold">{fmtNum(row.rank_score, 1)}</td>
                                                                                                        <td className={cn(
                                                                                                            "py-2.5 font-semibold",
                                                                                                            row.timing_edge === 'HIGH'
                                                                                                                ? "text-[#00D9A5]"
                                                                                                                : row.timing_edge === 'MEDIUM'
                                                                                                                    ? "text-yellow-300"
                                                                                                                    : "text-white/75"
                                                                                                        )}>{row.timing_edge}</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.current_lead_hours, 1)}</td>
                                                                                                        <td className={cn("py-2.5 font-semibold", Number(row.lead_delta_hours) >= 0 ? "text-cyan-300" : "text-red-400")}>{fmtSigned(row.lead_delta_hours, 1, 'h')}</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.confidence_score, 1)}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        <div className="text-xs text-white/60 mt-3">
                                                                                            top {smartLeadLagRadar?.top_theme || 'N/A'} • rank {fmtNum(smartLeadLagRadar?.top_rank_score, 1)} • avg lead {fmtNum(smartLeadLagRadar?.average_current_lead_hours, 1)}h
                                                                                        </div>
                                                                                    </TechCard>

                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">Signal Decay Monitor</h3>
                                                                                        <table className="w-full min-w-[760px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">State</th>
                                                                                                    <th className="py-2">Half-Life</th>
                                                                                                    <th className="py-2">24h</th>
                                                                                                    <th className="py-2">48h</th>
                                                                                                    <th className="py-2">72h</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartSignalDecayRows.slice(0, 6).map((row) => (
                                                                                                    <tr key={row.theme} className="border-b border-white/5">
                                                                                                        <td className="py-2.5 font-semibold text-white">{row.theme}</td>
                                                                                                        <td className={cn(
                                                                                                            "py-2.5 font-semibold",
                                                                                                            row.decay_state === 'STICKY'
                                                                                                                ? "text-[#00D9A5]"
                                                                                                                : row.decay_state === 'MODERATE'
                                                                                                                    ? "text-yellow-300"
                                                                                                                    : "text-red-400"
                                                                                                        )}>{row.decay_state}</td>
                                                                                                        <td className="py-2.5 text-cyan-300">{fmtNum(row.half_life_hours, 1)}h</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.expected_score_24h, 1)}</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.expected_score_48h, 1)}</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.expected_score_72h, 1)}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        <div className="text-xs text-white/60 mt-3">
                                                                                            avg half-life: {fmtNum(smartSignalDecay?.average_half_life_hours, 1)}h • stress {fmtNum(smartSignalDecay?.macro_stress_score, 1)}
                                                                                        </div>
                                                                                    </TechCard>
                                                                                </div>

                                                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                        <TechCard className="p-5 bg-black/40 border-white/10">
                                                                                            <h3 className="text-lg font-semibold text-white mb-3">Regime Switch Detector</h3>
                                                                                            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                                                                                                <div className="p-2 rounded bg-white/5 border border-white/10">
                                                                                                    <div className="text-white/70 text-xs uppercase">State</div>
                                                                                                    <div className={cn(
                                                                                                        "text-lg font-semibold",
                                                                                                        smartRegimeSwitch?.switch_state === 'VOLATILE'
                                                                                                            ? "text-red-400"
                                                                                                            : smartRegimeSwitch?.switch_state === 'TRANSITION'
                                                                                                                ? "text-yellow-300"
                                                                                                                : "text-[#00D9A5]"
                                                                                                    )}>{smartRegimeSwitch?.switch_state || 'N/A'}</div>
                                                                                                </div>
                                                                                                <div className="p-2 rounded bg-white/5 border border-white/10">
                                                                                                    <div className="text-white/70 text-xs uppercase">Instability</div>
                                                                                                    <div className="text-lg font-semibold text-cyan-300">{fmtNum(smartRegimeSwitch?.instability_score, 1)}</div>
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="text-xs text-white/70 mb-3">
                                                                                                current {smartRegimeSwitch?.current_regime || 'N/A'} • previous {smartRegimeSwitch?.previous_regime || 'N/A'} • flip30 {smartRegimeSwitch?.flip_count_30d || 0} • flip90 {smartRegimeSwitch?.flip_count_90d || 0}
                                                                                            </div>
                                                                                            <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
                                                                                                {smartRegimeSwitchRows.slice(-8).map((flip, idx) => (
                                                                                                    <div key={`${flip.date}-${idx}`} className="p-2 rounded bg-white/5 border border-white/10">
                                                                                                        <div className="text-sm font-semibold text-white">{flip.date} • {flip.from_regime} → {flip.to_regime}</div>
                                                                                                        <div className={cn("text-xs mt-1", Number(flip.score_delta) >= 0 ? "text-cyan-300" : "text-red-400")}>delta {fmtSigned(flip.score_delta, 1)}</div>
                                                                                                        <div className="text-sm text-white/65 mt-1">{flip.trigger}</div>
                                                                                                    </div>
                                                                                                ))}
                                                                                                {smartRegimeSwitchRows.length === 0 && <div className="text-sm text-white/60">Nessun flip recente nel range.</div>}
                                                                                            </div>
                                                                                        </TechCard>

                                                                                        <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                            <h3 className="text-lg font-semibold text-white mb-3">Counterfactual Lab (No Cross)</h3>
                                                                                            <table className="w-full min-w-[760px] text-left">
                                                                                                <thead>
                                                                                                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                        <th className="py-2">Theme</th>
                                                                                                        <th className="py-2">Actual</th>
                                                                                                        <th className="py-2">No-Cross</th>
                                                                                                        <th className="py-2">Lift</th>
                                                                                                        <th className="py-2">Dependency</th>
                                                                                                        <th className="py-2">Verdict</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {smartCounterfactualRows.slice(0, 6).map((row) => (
                                                                                                        <tr key={row.theme} className="border-b border-white/5">
                                                                                                            <td className="py-2.5 font-semibold text-white">{row.theme}</td>
                                                                                                            <td className="py-2.5 text-[#00D9A5]">{fmtNum(row.actual_barbell_score, 1)}</td>
                                                                                                            <td className="py-2.5 text-white/80">{fmtNum(row.counterfactual_no_cross_score, 1)}</td>
                                                                                                            <td className={cn("py-2.5 font-semibold", Number(row.cross_lift) >= 0 ? "text-cyan-300" : "text-red-400")}>{fmtSigned(row.cross_lift, 1)}</td>
                                                                                                            <td className="py-2.5 text-white/80">{fmtNum(row.cross_dependency_pct, 1)}%</td>
                                                                                                            <td className="py-2.5 text-yellow-300">{row.verdict}</td>
                                                                                                        </tr>
                                                                                                    ))}
                                                                                                </tbody>
                                                                                            </table>
                                                                                            <div className="text-xs text-white/60 mt-3">
                                                                                                upgraded by cross: {smartCounterfactualLab?.themes_upgraded_by_cross || 0} • avg lift {fmtNum(smartCounterfactualLab?.average_cross_lift, 1)}
                                                                                            </div>
                                                                                        </TechCard>
                                                                                    </div>

                                                                                </>)}{radarDetailModal === 'overlays' && (<><div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">Execution Risk Overlay</h3>
                                                                                        <table className="w-full min-w-[860px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">Risk</th>
                                                                                                    <th className="py-2">Slippage (bps)</th>
                                                                                                    <th className="py-2">Impact / 100k</th>
                                                                                                    <th className="py-2">Grade</th>
                                                                                                    <th className="py-2">Mode</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartExecutionRows.slice(0, 6).map((row) => (
                                                                                                    <tr key={row.theme} className="border-b border-white/5">
                                                                                                        <td className="py-2.5 font-semibold text-white">{row.theme}</td>
                                                                                                        <td className={cn(
                                                                                                            "py-2.5 font-semibold",
                                                                                                            Number(row.execution_risk_score) >= 72
                                                                                                                ? "text-red-400"
                                                                                                                : Number(row.execution_risk_score) >= 56
                                                                                                                    ? "text-yellow-300"
                                                                                                                    : "text-[#00D9A5]"
                                                                                                        )}>{fmtNum(row.execution_risk_score, 1)}</td>
                                                                                                        <td className="py-2.5 text-cyan-300">{fmtNum(row.estimated_slippage_bps, 2)}</td>
                                                                                                        <td className="py-2.5 text-white/80">${Number(row.impact_usd_per_100k || 0).toLocaleString('it-IT')}</td>
                                                                                                        <td className="py-2.5 text-white/80">{row.liquidity_grade}</td>
                                                                                                        <td className="py-2.5 text-xs text-white/70">{row.recommended_mode}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        <div className="text-xs text-white/60 mt-3">
                                                                                            avg slippage {fmtNum(smartExecutionRisk?.average_slippage_bps, 2)} bps • high-risk themes {smartExecutionRisk?.high_risk_themes || 0}
                                                                                        </div>
                                                                                    </TechCard>

                                                                                    <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">Narrative Saturation Meter</h3>
                                                                                        <table className="w-full min-w-[760px] text-left">
                                                                                            <thead>
                                                                                                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                    <th className="py-2">Theme</th>
                                                                                                    <th className="py-2">Positioning</th>
                                                                                                    <th className="py-2">Media</th>
                                                                                                    <th className="py-2">Gap</th>
                                                                                                    <th className="py-2">State</th>
                                                                                                    <th className="py-2">Crowding Risk</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody>
                                                                                                {smartNarrativeRows.slice(0, 6).map((row) => (
                                                                                                    <tr key={row.theme} className="border-b border-white/5">
                                                                                                        <td className="py-2.5 font-semibold text-white">{row.theme}</td>
                                                                                                        <td className="py-2.5 text-[#00D9A5]">{fmtNum(row.positioning_score, 1)}</td>
                                                                                                        <td className="py-2.5 text-cyan-300">{fmtNum(row.media_score, 1)}</td>
                                                                                                        <td className={cn("py-2.5 font-semibold", Number(row.saturation_gap) >= 0 ? "text-yellow-300" : "text-[#00D9A5]")}>{fmtSigned(row.saturation_gap, 1)}</td>
                                                                                                        <td className={cn(
                                                                                                            "py-2.5 text-xs font-semibold",
                                                                                                            row.state === 'CROWDED'
                                                                                                                ? "text-red-400"
                                                                                                                : row.state === 'EARLY_UNDEROWNED'
                                                                                                                    ? "text-[#00D9A5]"
                                                                                                                    : "text-white/75"
                                                                                                        )}>{row.state}</td>
                                                                                                        <td className="py-2.5 text-white/80">{fmtNum(row.crowding_risk_score, 1)}</td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                        <div className="text-xs text-white/60 mt-3">
                                                                                            crowded {smartNarrativeMeter?.crowded_themes || 0} • underowned {smartNarrativeMeter?.underowned_themes || 0}
                                                                                        </div>
                                                                                    </TechCard>
                                                                                </div>

                                                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                        <TechCard className="p-5 bg-black/40 border-white/10 overflow-x-auto">
                                                                                            <h3 className="text-lg font-semibold text-white mb-3">Validation Lab (Score Bucket)</h3>
                                                                                            <table className="w-full min-w-[760px] text-left">
                                                                                                <thead>
                                                                                                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/70">
                                                                                                        <th className="py-2">Bucket</th>
                                                                                                        <th className="py-2">Samples</th>
                                                                                                        <th className="py-2">Avg Score</th>
                                                                                                        <th className="py-2">Avg Edge</th>
                                                                                                        <th className="py-2">Acc 20d</th>
                                                                                                        <th className="py-2">Dist 20d</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {smartValidationRows.map((row, idx) => (
                                                                                                        <tr key={`${row.bucket}-${idx}`} className="border-b border-white/5">
                                                                                                            <td className="py-2.5 font-semibold text-white">{row.bucket}</td>
                                                                                                            <td className="py-2.5 text-white/80">{row.samples || 0}</td>
                                                                                                            <td className="py-2.5 text-[#00D9A5]">{fmtNum(row.avg_barbell_score, 1)}</td>
                                                                                                            <td className="py-2.5 text-cyan-300">{fmtNum(row.avg_edge_score, 1)}</td>
                                                                                                            <td className="py-2.5 text-white/80">{fmtNum(row.accumulation_hit_rate_20d, 1)}%</td>
                                                                                                            <td className="py-2.5 text-white/80">{fmtNum(row.distribution_hit_rate_20d, 1)}%</td>
                                                                                                        </tr>
                                                                                                    ))}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </TechCard>

                                                                                        <TechCard className="p-5 bg-black/40 border-white/10">
                                                                                            <h3 className="text-lg font-semibold text-white mb-3">Macro Event Risk Overlay</h3>
                                                                                            <div className="mb-3 text-sm">
                                                                                                <span className="text-white/70">Risk Score: </span>
                                                                                                <span className={cn("font-semibold", smartMacroEventOverlay?.risk_level === 'HIGH' ? "text-red-400" : smartMacroEventOverlay?.risk_level === 'MEDIUM' ? "text-yellow-300" : "text-[#00D9A5]")}>
                                                                                                    {fmtNum(smartMacroEventOverlay?.risk_score, 1)} ({smartMacroEventOverlay?.risk_level || 'N/A'})
                                                                                                </span>
                                                                                            </div>
                                                                                            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                                                                                {smartMacroEvents.map((e, idx) => (
                                                                                                    <div key={`${e.event}-${idx}`} className="p-2.5 rounded bg-white/5 border border-white/10">
                                                                                                        <div className="text-sm font-semibold text-white">{e.event}</div>
                                                                                                        <div className="text-xs text-white/70 mt-1">{e.date} • d-{e.days_to_event} • {e.window}</div>
                                                                                                    </div>
                                                                                                ))}
                                                                                                {smartMacroEvents.length === 0 && (
                                                                                                    <div className="text-sm text-white/60">Nessun evento macro stimato nel range corrente.</div>
                                                                                                )}
                                                                                            </div>
                                                                                        </TechCard>
                                                                                    </div>

                                                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                                                        <h3 className="text-lg font-semibold text-white mb-3">Theme Drilldown</h3>
                                                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                                                                            {smartDrilldownThemes.slice(0, 6).map((theme) => (
                                                                                                <div key={theme.theme} className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                                        <div>
                                                                                                            <div className="font-semibold text-white">{theme.theme}</div>
                                                                                                            <div className="text-xs text-white/65">{theme.sector} • {theme.rotation_state}</div>
                                                                                                        </div>
                                                                                                        <div className="text-right text-xs text-white/75">
                                                                                                            <div>barbell {fmtNum(theme.barbell_score, 1)}</div>
                                                                                                            <div>uoa {theme.uoa_events || 0} • fp {theme.footprints || 0}</div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div className="space-y-1">
                                                                                                        {(theme.top_contracts || []).slice(0, 3).map((c, idx) => (
                                                                                                            <div key={`${theme.theme}-${idx}`} className="text-sm text-white/75 font-mono">
                                                                                                                {c.ticker} {c.side || ''} • anom {fmtNum(c.anomaly_score, 1)} • q {fmtNum(c.quality_score, 1)} • dte {c.dte ?? '—'}
                                                                                                            </div>
                                                                                                        ))}
                                                                                                        {(theme.top_contracts || []).length === 0 && <div className="text-sm text-white/55">Nessun contratto in evidenza.</div>}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </TechCard>
                                                                                </>)}
                                                                            </div>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {deepResearchTab === 'diversification' && (
                                                <TechCard className="p-6 bg-black/40 border-white/10">
                                                    <h3 className="text-lg font-semibold text-white mb-4">Confluenze di Copertura Decorrelata</h3>
                                                    {(!deepResearch.diversification || deepResearch.diversification.length === 0) ? (
                                                        <p className="text-lg text-white/85">Dati insufficienti per generare pair di copertura decorrelata.</p>
                                                    ) : (
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left min-w-[900px] border-collapse">
                                                                <thead>
                                                                    <tr className="border-b border-white/10 text-lg uppercase tracking-wide text-white/80">
                                                                        <th className="py-3">Asset Base</th>
                                                                        <th className="py-3">Asset Copertura</th>
                                                                        <th className="py-3">Correlazione</th>
                                                                        <th className="py-3">Decorrelation</th>
                                                                        <th className="py-3">WR Combinato</th>
                                                                        <th className="py-3">Coverage Confidence</th>
                                                                        <th className="py-3">Relazione</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {deepResearch.diversification.map((row, idx) => (
                                                                        <tr key={`${row.base_asset}-${row.hedge_asset}-${idx}`} className="border-b border-white/5 text-sm">
                                                                            <td className="py-3 font-semibold text-white">{row.base_asset}</td>
                                                                            <td className="py-3 font-semibold text-cyan-300">{row.hedge_asset}</td>
                                                                            <td className="py-3 font-mono text-white/70">{row.correlation}</td>
                                                                            <td className="py-3 font-mono text-white/70">{fmtPct(row.decorrelation_score)}</td>
                                                                            <td className="py-3 font-mono text-white/70">{fmtPct(row.combined_win_rate)}</td>
                                                                            <td className="py-3 font-semibold text-[#00D9A5]">{fmtPct(row.coverage_confidence)}</td>
                                                                            <td className="py-3">
                                                                                <span className={cn(
                                                                                    "text-sm px-2.5 py-1.5 rounded border font-semibold uppercase",
                                                                                    row.relation === 'counter_hedge'
                                                                                        ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                                                                                        : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                                                                )}>
                                                                                    {row.relation === 'counter_hedge' ? 'Counter Hedge' : 'Parallel Diversifier'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </TechCard>
                                            )}

                                            {deepResearchTab === 'risk' && (
                                                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                                    <TechCard className="p-5 bg-black/40 border-white/10 xl:col-span-2">
                                                        <h3 className="text-lg font-semibold text-white mb-4">Overlay Macro / Fed / News / Risk / Seasonality</h3>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                                                            {Object.entries(deepResearch?.risk_exposure?.market_state || {}).map(([key, value]) => (
                                                                <div key={key} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                    <div className="text-xs uppercase tracking-wide text-white/80 mb-1">{key.replaceAll('_', ' ')}</div>
                                                                    <span className={cn("inline-flex px-2 py-1 rounded border text-xs font-semibold", biasStyle(value))}>
                                                                        {String(value || 'NEUTRAL')}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                <div className="text-lg text-white/85 mb-1">Conflict Index</div>
                                                                <div className="text-2xl font-semibold text-red-300">{fmtPct(deepResearch?.risk_exposure?.scores?.conflict_index)}</div>
                                                            </div>
                                                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                <div className="text-lg text-white/85 mb-1">Aggression Index</div>
                                                                <div className="text-2xl font-semibold text-[#00D9A5]">{fmtPct(deepResearch?.risk_exposure?.scores?.aggression_index)}</div>
                                                            </div>
                                                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                <div className="text-lg text-white/85 mb-1">Exposure Consigliata</div>
                                                                <div className="text-2xl font-semibold text-cyan-300">{fmtPct(deepResearch?.risk_exposure?.recommended_exposure_pct)}</div>
                                                            </div>
                                                        </div>
                                                    </TechCard>

                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                        <h3 className="text-lg font-semibold text-white mb-3">Allocazione Operativa</h3>
                                                        <div className="space-y-3">
                                                            {(deepResearch?.risk_exposure?.positioning_bands || []).map((band, idx) => (
                                                                <div key={idx} className="space-y-1">
                                                                    <div className="flex items-center justify-between text-sm">
                                                                        <span className="text-white/70">{band.name}</span>
                                                                        <span className="font-mono text-white">{fmtPct(band.allocation_pct)}</span>
                                                                    </div>
                                                                    <div className="h-2 rounded bg-white/10 overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-gradient-to-r from-[#00D9A5] to-cyan-400"
                                                                            style={{ width: `${Math.max(0, Math.min(100, Number(band.allocation_pct) || 0))}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="mt-4 text-lg text-white/85 space-y-1">
                                                            {(deepResearch?.risk_exposure?.notes || []).map((note, idx) => (
                                                                <p key={idx}>• {note}</p>
                                                            ))}
                                                        </div>
                                                    </TechCard>
                                                </div>
                                            )}

                                            {deepResearchTab === 'bias' && (
                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                        <h3 className="text-lg font-semibold text-white mb-4">Bias Settimanale</h3>
                                                        <div className="space-y-2">
                                                            {(deepResearch.weekly_bias || []).map((row, idx) => (
                                                                <div key={idx} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="font-semibold text-white">{row.asset}</span>
                                                                        <span className={cn("text-sm px-2.5 py-1.5 rounded border font-semibold", biasStyle(row.bias))}>{row.bias}</span>
                                                                    </div>
                                                                    <div className="text-lg text-white/90">
                                                                        Oggi ({row.current_bucket}): {fmtPct(row.current_win_rate)} su {row.sample_size} casi
                                                                    </div>
                                                                    <div className="text-sm text-cyan-300/80 font-mono">
                                                                        Best day: {row.best_bucket} • WR {fmtPct(row.best_win_rate)} • n={row.best_sample_size}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TechCard>

                                                    <TechCard className="p-5 bg-black/40 border-white/10">
                                                        <h3 className="text-lg font-semibold text-white mb-4">Bias Mensile</h3>
                                                        <div className="space-y-2">
                                                            {(deepResearch.monthly_bias || []).map((row, idx) => (
                                                                <div key={idx} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="font-semibold text-white">{row.asset}</span>
                                                                        <span className={cn("text-sm px-2.5 py-1.5 rounded border font-semibold", biasStyle(row.bias))}>{row.bias}</span>
                                                                    </div>
                                                                    <div className="text-lg text-white/90">
                                                                        Mese corrente ({row.current_bucket}): {fmtPct(row.current_win_rate)} su {row.sample_size} casi
                                                                    </div>
                                                                    <div className="text-sm text-cyan-300/80 font-mono">
                                                                        Best month: {row.best_bucket} • WR {fmtPct(row.best_win_rate)} • n={row.best_sample_size}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TechCard>
                                                </div>
                                            )}
                                        </motion.div>
                                    </AnimatePresence>
                                </>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div >
    );
}
