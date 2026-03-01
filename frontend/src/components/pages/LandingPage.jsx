import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
    ArrowRight, BarChart3, Shield, Zap, Target, TrendingUp,
    ChevronRight, Brain, LineChart, Globe, Calculator, BookOpen,
    Activity, Newspaper, PieChart, Sparkles, CheckCircle2, Eye,
    LayoutDashboard, Cpu, Crosshair, Flame, Lock, Smartphone,
    Menu, Settings, Users, Moon, Sun, LogOut
} from 'lucide-react';
import kairongBull from '../../assets/kairon-bull.png';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import { BullLogo } from '../ui/BullLogo';
import { ShaderAnimation as ShaderLines } from '../ui/ShaderLines';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED COUNTER HOOK
   ═══════════════════════════════════════════════════════════════════ */
const useAnimatedCounter = (end, duration = 2000, startOnView = false) => {
    const [count, setCount] = useState(0);
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: '-100px' });
    const hasStarted = useRef(false);

    useEffect(() => {
        if (startOnView && !isInView) return;
        if (hasStarted.current) return;
        hasStarted.current = true;

        let startTime = null;
        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [end, duration, isInView, startOnView]);

    return { count, ref };
};

/* ═══════════════════════════════════════════════════════════════════
   SECTION WRAPPER — scroll-triggered reveal (deepcharts style)
   ═══════════════════════════════════════════════════════════════════ */
const RevealSection = ({ children, className = '', delay = 0 }) => (
    <motion.section
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={className}
    >
        {children}
    </motion.section>
);

/* ═══════════════════════════════════════════════════════════════════
   STAT ITEM — DeepCharts-style big numbers
   ═══════════════════════════════════════════════════════════════════ */
const StatItem = ({ value, prefix = '+', suffix, label, delay }) => {
    const { count, ref } = useAnimatedCounter(value, 2000, true);
    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay }}
            className="text-center px-8 py-4"
        >
            <div className="text-5xl md:text-6xl lg:text-7xl font-black text-white mb-2 tracking-tight font-apple">
                {prefix}{count}{suffix}
            </div>
            <div className="text-sm text-white/30 font-medium uppercase tracking-[0.2em]">{label}</div>
        </motion.div>
    );
};

const GlowCard = ({ icon: Icon, title, description, delay, color = '#F0F0F0' }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
        whileHover={{ y: -6 }}
        className="group relative p-8 rounded-xl bg-[#0f172a]/80 backdrop-blur-sm border border-slate-800 overflow-hidden cursor-default transition-all duration-300"
    >
        <div className="relative z-10">
            <div
                className="w-14 h-14 rounded-lg flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-105"
                style={{ background: `${color}15`, border: `1px solid ${color}30` }}
            >
                <Icon className="w-7 h-7" style={{ color }} />
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-3 font-inter">{title}</h3>
            <p className="text-base text-slate-400 leading-relaxed">{description}</p>
        </div>
        {/* Subtle bottom border accent on hover */}
        <div className="absolute bottom-0 left-0 right-0 h-1 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" style={{ backgroundColor: color }} />
    </motion.div>
);

/* ═══════════════════════════════════════════════════════════════════
   BROWSER FRAME — wraps screenshots in a realistic browser chrome
   starBorder: adds animated LED light on top edge, bright center fading to sides
   ═══════════════════════════════════════════════════════════════════ */
const BrowserFrame = ({ children, className = '', glow = true, glowColor = '#F0F0F0', starBorder = false }) => (
    <div className={`relative ${className}`}>
        {glow && (
            <>
                <div className="absolute -inset-1 rounded-2xl opacity-20 blur-xl pointer-events-none"
                    style={{ background: `linear-gradient(135deg, ${glowColor}40, transparent 60%)` }} />
                <div className="absolute -inset-px rounded-2xl opacity-10 pointer-events-none"
                    style={{ boxShadow: `0 0 60px ${glowColor}30, 0 0 120px ${glowColor}10` }} />
            </>
        )}
        <div className="relative rounded-2xl bg-[#0A0A0A] overflow-hidden shadow-2xl shadow-black/50">
            {/* ★ Animated LED Star Border — DRAMATIC min→max pulsing */}
            {starBorder && (
                <>
                    {/* Full-width LED strip — pulses from dim to bright */}
                    <motion.div
                        className="absolute top-0 left-0 right-0 h-[3px] z-20 pointer-events-none"
                        style={{
                            background: `radial-gradient(ellipse 50% 100% at 50% 0%, #ffffff, ${glowColor} 15%, ${glowColor}90 30%, ${glowColor}40 50%, transparent 75%)`,
                        }}
                        animate={{ opacity: [0.15, 1, 0.15] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {/* Bloom behind the LED — also pulses */}
                    <motion.div
                        className="absolute top-0 left-0 right-0 h-[60px] z-10 pointer-events-none"
                        style={{
                            background: `radial-gradient(ellipse 45% 100% at 50% 0%, ${glowColor}90, ${glowColor}30 35%, transparent 70%)`,
                        }}
                        animate={{ opacity: [0.05, 0.8, 0.05] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {/* Bright center star — pulses intensely */}
                    <motion.div
                        className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-[350px] h-[50px] z-15 pointer-events-none"
                        style={{
                            background: `radial-gradient(ellipse at 50% 0%, ${glowColor}, ${glowColor}50 30%, transparent 65%)`,
                            filter: 'blur(10px)',
                        }}
                        animate={{ opacity: [0.05, 1, 0.05] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {/* Sweeping white highlight — travels left→center→right */}
                    <motion.div
                        className="absolute top-0 left-0 right-0 h-[3px] z-30 pointer-events-none"
                        animate={{
                            background: [
                                `radial-gradient(ellipse 12% 100% at 20% 0%, rgba(255,255,255,1), transparent 60%)`,
                                `radial-gradient(ellipse 20% 100% at 50% 0%, rgba(255,255,255,1), transparent 60%)`,
                                `radial-gradient(ellipse 12% 100% at 80% 0%, rgba(255,255,255,1), transparent 60%)`,
                                `radial-gradient(ellipse 20% 100% at 50% 0%, rgba(255,255,255,1), transparent 60%)`,
                                `radial-gradient(ellipse 12% 100% at 20% 0%, rgba(255,255,255,1), transparent 60%)`,
                            ],
                            opacity: [0.1, 1, 0.1, 1, 0.1],
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    {/* Center white star point */}
                    <motion.div
                        className="absolute top-[-8px] left-1/2 -translate-x-1/2 w-[250px] h-[16px] rounded-full z-20 pointer-events-none"
                        style={{
                            background: `radial-gradient(ellipse at center, #ffffff, ${glowColor} 25%, transparent 65%)`,
                            filter: 'blur(5px)',
                        }}
                        animate={{ opacity: [0.1, 1, 0.1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                </>
            )}
            {/* Content — no chrome bar */}
            {children}
        </div>
    </div>
);

const MacbookHero = ({ screenshot }) => (
    <div className="relative w-full max-w-6xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-[#0f172a]">
        {/* Simple clean window header */}
        <div className="h-8 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-700" />
            <div className="w-3 h-3 rounded-full bg-slate-700" />
            <div className="w-3 h-3 rounded-full bg-slate-700" />
        </div>
        <img src={screenshot} alt="Platform Preview" className="w-full h-auto object-cover" />
    </div>
);

/* ═══════════════════════════════════════════════════════════════════
   FEATURE SHOWCASE TABS DATA
   ═══════════════════════════════════════════════════════════════════ */
const featureTabs = [
    {
        id: 'cot',
        label: 'COT Analysis',
        icon: BarChart3,
        color: '#F0F0F0',
        title: 'Institutional COT Intelligence',
        description: 'Decode where the smart money is positioning. Weekly bias, net positioning, and Z-Score analysis visualized with institutional-grade precision.',
        screenshot: '/screenshots/cot.png',
        bullets: [
            { icon: Eye, text: 'Weekly institutional bias tracking' },
            { icon: TrendingUp, text: 'Net positioning with Z-Score overlays' },
            { icon: Target, text: '4-week rolling bias scales per asset' },
        ],
    },
    {
        id: 'options',
        label: 'Options Flow',
        icon: Zap,
        color: '#D0A030',
        title: 'Real-Time Options Intelligence',
        description: 'Track gamma exposure and institutional options activity in real-time. Understand market positioning before price reacts.',
        screenshot: '/screenshots/options.png',
        bullets: [
            { icon: Activity, text: 'Live gamma exposure monitoring' },
            { icon: Flame, text: 'Net flow tracking by strike' },
            { icon: PieChart, text: 'Calls vs Puts positioning analysis' },
        ],
    },
    {
        id: 'macro',
        label: 'Macro Economy',
        icon: Globe,
        color: '#F0F0F0',
        title: 'Global Macro Dashboard',
        description: 'Central bank rates, inflation data, and seasonality patterns — all correlated with your portfolio positions.',
        screenshot: '/screenshots/macro.png',
        bullets: [
            { icon: Globe, text: 'Global macro indicator dashboard' },
            { icon: Newspaper, text: 'Calendar with impact filtering' },
            { icon: TrendingUp, text: 'Seasonal pattern recognition' },
        ],
    },
    {
        id: 'risk',
        label: 'Risk Management',
        icon: Shield,
        color: '#D0A030',
        title: 'Institutional Risk Controls',
        description: 'Position sizing, Monte Carlo simulation, and real-time drawdown tracking. Manage risk like a hedge fund.',
        screenshot: '/screenshots/dashboard.png',
        bullets: [
            { icon: Shield, text: 'Real-time portfolio risk monitoring' },
            { icon: Calculator, text: 'Advanced position size calculator' },
            { icon: Target, text: 'Monte Carlo stress testing' },
        ],
    },
    {
        id: 'ai',
        label: 'AI Assistant',
        icon: Brain,
        color: '#F0F0F0',
        title: 'AI-Powered Trading Copilot',
        description: 'Your intelligent assistant that analyzes markets, generates trade ideas, and provides real-time bias assessment across all data sources.',
        screenshot: '/screenshots/dashboard.png',
        bullets: [
            { icon: Cpu, text: 'Multi-source market analysis' },
            { icon: Sparkles, text: 'AI-generated trade setups' },
            { icon: Brain, text: 'Natural language market queries' },
        ],
    },
    {
        id: 'charts',
        label: 'Charts',
        icon: LineChart,
        color: '#D0A030',
        title: 'Advanced Charting Suite',
        description: 'Multi-timeframe analysis with integrated indicators, drawing tools, and institutional zones — all within your trading OS.',
        screenshot: '/screenshots/dashboard.png',
        bullets: [
            { icon: LineChart, text: 'Real-time multi-timeframe charts' },
            { icon: Target, text: 'Institutional supply/demand zones' },
            { icon: LayoutDashboard, text: 'Custom layout workspaces' },
        ],
    },
];

/* ═══════════════════════════════════════════════════════════════════
   FEATURE PANEL — left info + right real screenshot in browser frame
   ═══════════════════════════════════════════════════════════════════ */
const FeaturePanel = ({ tab }) => {
    return (
        <motion.div
            key={tab.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.45 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
        >
            {/* LEFT: info */}
            <div>
                <h3 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tight font-apple">{tab.title}</h3>
                <p className="text-white/35 text-lg leading-relaxed mb-8">{tab.description}</p>
                <div className="space-y-4">
                    {tab.bullets.map((b, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 + i * 0.1 }}
                            className="flex items-center gap-3"
                        >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tab.color}15` }}>
                                <b.icon className="w-4 h-4" style={{ color: tab.color }} />
                            </div>
                            <span className="text-white/60 text-sm font-medium">{b.text}</span>
                        </motion.div>
                    ))}
                </div>
                <Link to="/auth?mode=register">
                    <motion.button
                        whileHover={{ scale: 1.04, boxShadow: `0 0 40px ${tab.color}50` }}
                        whileTap={{ scale: 0.97 }}
                        className="mt-8 px-7 py-3 rounded-full font-bold text-sm text-black flex items-center gap-2 transition-shadow duration-300"
                        style={{ backgroundColor: tab.color }}
                    >
                        Explore {tab.label} <ArrowRight className="w-4 h-4" />
                    </motion.button>
                </Link>
            </div>

            {/* RIGHT: real screenshot in browser frame */}
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
            >
                <BrowserFrame glowColor={tab.color}>
                    <img
                        src={tab.screenshot}
                        alt={tab.label}
                        className="w-full h-auto block"
                        style={{ minHeight: 280 }}
                    />
                </BrowserFrame>
            </motion.div>
        </motion.div>
    );
};

/* ═══════════════════════════════════════════════════════════════════
   GRID FEATURES DATA
   ═══════════════════════════════════════════════════════════════════ */
const gridFeatures = [
    { icon: BookOpen, title: 'Trade Journal', description: 'Log, review, and learn from every trade with detailed analytics and AI-powered insights.', color: '#F0F0F0' },
    { icon: PieChart, title: 'Advanced Statistics', description: 'Comprehensive performance metrics, win rate analysis, and expectancy calculations.', color: '#D0A030' },
    { icon: Target, title: 'Monte Carlo Sim', description: 'Stress-test your strategy with thousands of simulated outcomes and probability analysis.', color: '#F0F0F0' },
    { icon: Brain, title: 'Trading Psychology', description: 'Track emotional patterns, build discipline, and master your mindset with guided tools.', color: '#D0A030' },
    { icon: Calculator, title: 'Smart Calculator', description: 'Position sizing, pip value, margin, and risk-reward — all in one professional calculator.', color: '#F0F0F0' },
    { icon: Newspaper, title: 'Real-Time News', description: 'Market-moving news feed with impact filtering and AI-powered sentiment analysis.', color: '#D0A030' },
];

/* ═══════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */

/* ═══ USER MENU COMPONENT (TradingView Style) ═══ */
const UserMenu = ({ user, subscription, logout, theme, toggleTheme }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    const { t, i18n } = useTranslation();

    const planName = subscription?.plan?.name || 'ESSENTIAL';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const languages = [
        { code: 'it', name: 'Italiano' },
        { code: 'en', name: 'English' }
    ];

    const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 p-1 rounded-full hover:bg-white/[0.05] transition-colors"
                title="Menu Utente"
            >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {user.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col items-start mr-2">
                    <span className="text-white flex items-center gap-2">
                        <Menu className="w-4 h-4 text-white/40" />
                    </span>
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-72 bg-[#121517] border border-white/[0.08] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-[60]"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/[0.05] flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                                {user.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <Link to="/app/profile" className="font-bold text-white hover:text-primary transition-colors block truncate">
                                    {user.name}
                                </Link>
                                <span className="bg-white/10 text-white/60 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest mt-0.5 inline-block">
                                    {planName}
                                </span>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="py-2">
                            <Link to="/app/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors">
                                <Settings className="w-4 h-4" /> Impostazioni e fatturazione
                            </Link>
                            <button onClick={() => { }} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors">
                                <div className="flex items-center gap-3">
                                    <Users className="w-4 h-4" /> Invita un amico
                                </div>
                                <span className="text-white/30 text-xs">$0</span>
                            </button>
                        </div>

                        <div className="py-2 border-t border-white/[0.05]">
                            <button onClick={() => { }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors">
                                <BookOpen className="w-4 h-4" /> Centro di supporto
                            </button>
                            <button onClick={() => { }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors">
                                <Sparkles className="w-4 h-4" /> Novità
                            </button>
                        </div>

                        {/* Controls */}
                        <div className="py-2 border-t border-white/[0.05]">
                            <div className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors">
                                <div className="flex items-center gap-3">
                                    {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />} Tema scuro
                                </div>
                                <button
                                    onClick={toggleTheme}
                                    className={cn(
                                        "w-9 h-5 rounded-full transition-colors relative",
                                        theme === 'dark' ? "bg-primary" : "bg-white/10"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                                        theme === 'dark' ? "translate-x-4" : "translate-x-0"
                                    )} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors">
                                <div className="flex items-center gap-3">
                                    <Globe className="w-4 h-4" /> Lingua
                                </div>
                                <div className="flex items-center gap-1 text-white/30 text-xs">
                                    {currentLang.name} <ChevronRight className="w-3 h-3" />
                                </div>
                            </div>
                        </div>

                        {/* Exit */}
                        <div className="py-2 border-t border-white/[0.05]">
                            <button
                                onClick={logout}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.05] transition-colors"
                            >
                                <LogOut className="w-4 h-4" /> Esci
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */
export const LandingPage = () => {
    const { user, subscription, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState('cot');
    const activeFeature = featureTabs.find(t => t.id === activeTab);

    return (
        <div className="min-h-screen bg-black text-slate-100 font-inter overflow-x-hidden selection:bg-[#D0A030]/30" style={{ touchAction: 'pan-y' }}>

            {/* ═══ CLEAN FTMO-STYLE BACKGROUND ═══ */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-black" />
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#D0A030]/5 rounded-full blur-[150px]" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#F0F0F0]/5 rounded-full blur-[150px]" />
            </div>

            {/* ═══ NAVBAR ═══ */}
            {/* NAVBAR — mobile classes (below sm:640px) add Dynamic Island padding + compact layout. Desktop unchanged via sm: overrides */}
            <nav className="fixed top-0 inset-x-0 z-50 pt-[52px] sm:pt-6 pointer-events-none">
                <div className="max-w-[1400px] mx-auto px-3 sm:px-6 flex items-center justify-between pointer-events-auto">
                    <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                        <BullLogo className="h-8 sm:h-12 w-auto" />
                        <div className="relative">
                            <span className="text-xs sm:text-xl font-black tracking-[0.15em] sm:tracking-[0.2em] text-white uppercase" style={{
                                fontFamily: 'Georgia, serif',
                                textShadow: '0 0 10px rgba(255,255,255,0.4), 0 0 20px rgba(208,160,48,0.4)'
                            }}>KARION</span>
                            {/* Luminescent underline glow — hidden on mobile, shown on sm+ (desktop) */}
                            <div className="absolute -bottom-1 left-0 right-0 h-[2px] hidden sm:block" style={{ background: 'linear-gradient(90deg, transparent, #D0A030, transparent)' }} />
                            <div className="absolute -bottom-1 left-0 right-0 h-[6px] blur-[3px] opacity-60 hidden sm:block" style={{ background: 'linear-gradient(90deg, transparent, #D0A030, transparent)' }} />
                        </div>
                    </div>
                    <div className="hidden md:flex items-center gap-2 p-2 rounded-[32px] bg-[#0A0A0A]/70 border border-[#CFD8E3]/40 backdrop-blur-2xl shadow-[0_4px_30px_rgba(207,216,227,0.15)]">
                        <a href="#features" className="px-7 py-2.5 rounded-full text-[16px] xl:text-[17px] font-semibold tracking-tight text-white/80 hover:text-[#CFD8E3] hover:bg-white/10 transition-all duration-300 drop-shadow-sm">Features</a>
                        <a href="#showcase" className="px-7 py-2.5 rounded-full text-[16px] xl:text-[17px] font-semibold tracking-tight text-white/80 hover:text-[#CFD8E3] hover:bg-white/10 transition-all duration-300 drop-shadow-sm">Showcase</a>
                        <a href="#tools" className="px-7 py-2.5 rounded-full text-[16px] xl:text-[17px] font-semibold tracking-tight text-white/80 hover:text-[#CFD8E3] hover:bg-white/10 transition-all duration-300 drop-shadow-sm">Tools</a>
                        <Link to="/pricing" className="px-7 py-2.5 rounded-full text-[16px] xl:text-[17px] font-semibold tracking-tight text-white/80 hover:text-[#CFD8E3] hover:bg-white/10 transition-all duration-300 drop-shadow-sm">Pricing</Link>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        {!user ? (
                            <>
                                <Link to="/auth?mode=login" className="hidden sm:inline text-base font-semibold tracking-tight text-white/60 hover:text-white transition-colors">
                                    Log in
                                </Link>
                                <Link to="/auth?mode=register">
                                    <motion.button
                                        whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(226,232,240,0.6)', borderColor: 'rgba(255,255,255,0.9)' }}
                                        whileTap={{ scale: 0.95 }}
                                        className="px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#E2E8F0] to-[#CFD8E3] text-slate-900 border border-[#FFFFFF]/60 font-bold text-[11px] sm:text-base tracking-tight transition-all duration-300 flex items-center gap-1 sm:gap-2 shadow-[0_0_20px_rgba(226,232,240,0.3)]"
                                    >
                                        <span className="sm:hidden">Accedi</span><span className="hidden sm:inline">Get Access</span> <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </motion.button>
                                </Link>
                            </>
                        ) : (
                            <UserMenu
                                user={user}
                                subscription={subscription}
                                logout={logout}
                                theme={theme}
                                toggleTheme={toggleTheme}
                            />
                        )}
                    </div>
                </div>
                {/* Mobile nav tabs in dedicated scroll row */}
                <div className="sm:hidden border-t border-white/[0.05]">
                    <div className="max-w-[1400px] mx-auto px-3 py-2">
                        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                            <a href="#features" className="text-center px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-all">Features</a>
                            <a href="#showcase" className="text-center px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-all">Showcase</a>
                            <a href="#tools" className="text-center px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-all">Tools</a>
                            <Link to="/pricing" className="text-center px-2 py-1.5 rounded-lg text-[11px] font-semibold text-white/75 hover:text-white hover:bg-white/[0.08] transition-all">Pricing</Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* ═══ HERO SECTION ═══ */}
            <section className="relative min-h-[100vh] flex flex-col justify-center pt-24 pb-12 overflow-hidden z-20">
                <ShaderLines />

                {/* Elegant dark contrast backdrop for text emphasis */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] w-[100vw] md:w-[800px] h-[500px] md:h-[400px] bg-black/80 blur-[100px] rounded-full pointer-events-none z-[5]" />

                <div className="max-w-[1200px] mx-auto px-6 text-center relative z-10">
                    <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-medium mb-6 leading-[0.95] tracking-tight text-white drop-shadow-2xl">
                            Decifra le Orme{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50 font-medium pl-1 pr-2">
                                Invisibili
                            </span>
                            <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F5E6D3] to-[#E8D8C8] font-bold drop-shadow-[0_0_15px_rgba(245,230,211,0.4)]">del Mercato.</span>
                        </h1>
                    </motion.div>
                </div>
            </section>

            {/* ═══ DEEP RESEARCH SUBTITLE (Overlapping glass pill) ═══ */}
            <div className="relative z-[60] w-full flex justify-center -mt-28 sm:-mt-40 px-6">
                <div className="max-w-[950px] w-full rounded-[32px] bg-[#050505]/30 backdrop-blur-2xl border border-white/5 px-8 py-5 md:px-12 md:py-6 shadow-[0_10px_50px_rgba(0,0,0,0.8)]">
                    <p className="text-[15px] md:text-[18px] text-white/85 leading-relaxed tracking-wide font-medium text-center">
                        Deep Research 3.0 è l’unico sistema quantitativo semplice da utilizzare che processa e sintetizza il lato tecnico e macroeconomico del mercato per offrirti una nuova esperienza operativa, oltre il semplice “seguire” i mercati; in parallelo, il motore quantitativo si auto‑ottimizza attraverso integrazione dati e validazione retroattiva continua.
                    </p>
                </div>
            </div>

            {/* ═══ STATS BAR — DeepCharts-style big numbers ═══ */}
            <RevealSection className="py-24 relative z-10" id="features">
                <div className="max-w-[1100px] mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-white/[0.06]">
                        <StatItem value={18} prefix="+" suffix="" label="Tradable Assets" delay={0} />
                        <StatItem value={6} prefix="" suffix="" label="Data Modules" delay={0.1} />
                        <StatItem value={24} prefix="" suffix="/7" label="Real-Time Data" delay={0.2} />
                        <StatItem value={100} prefix="" suffix="%" label="Cloud Based" delay={0.3} />
                    </div>
                </div>
            </RevealSection>

            {/* ═══ FEATURE SHOWCASE (Interactive Tabs) — FTMO Style ═══ */}
            <RevealSection className="py-24 relative z-10 bg-white/[0.02]" id="showcase">
                <div className="max-w-[1300px] mx-auto px-6">
                    <div className="mb-16">
                        <span className="inline-block px-4 py-1.5 rounded bg-[#F0F0F0]/10 text-[#F0F0F0] text-xs font-semibold uppercase tracking-wider mb-6">
                            Behind The Data
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-slate-100">
                            Meet Your Professional Arsenal
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl">
                            Follow the Smart Money with our data tools and boost your edge and your profits. Built for traders who demand precision.
                        </p>
                    </div>

                    {/* Tab bar — icon-based like deepcharts */}
                    <div className="mb-10 sm:mb-14">
                        {/* Mobile tab chips */}
                        <div className="sm:hidden">
                            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                                {featureTabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.06em] text-left transition-all duration-200 ${activeTab === tab.id ? 'text-white' : 'text-white/55 hover:text-white/80'
                                            }`}
                                        style={activeTab === tab.id ? { background: `${tab.color}12`, border: `1px solid ${tab.color}35` } : {}}
                                    >
                                        <tab.icon className="w-4 h-4" style={{ color: activeTab === tab.id ? tab.color : undefined }} />
                                        <span className="leading-tight">{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Desktop/tablet tab bar */}
                        <div className="hidden sm:flex justify-center items-center gap-2">
                            {/* Left arrow */}
                            <button className="w-10 h-10 rounded-xl border border-white/[0.06] flex items-center justify-center text-white/20 hover:text-white/50 transition-colors">
                                <ChevronRight className="w-5 h-5 rotate-180" />
                            </button>

                            <div className="flex gap-1 p-1.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                {featureTabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex flex-col items-center gap-1.5 px-5 py-3 rounded-lg transition-all duration-300 ${activeTab === tab.id
                                            ? 'text-white'
                                            : 'text-white/25 hover:text-white/50'
                                            }`}
                                    >
                                        <tab.icon className="w-5 h-5 transition-colors duration-300"
                                            style={{ color: activeTab === tab.id ? tab.color : undefined }}
                                        />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                                        {activeTab === tab.id && (
                                            <motion.div
                                                layoutId="activeTab"
                                                className="absolute inset-0 rounded-lg -z-10"
                                                style={{ background: `${tab.color}08`, border: `1px solid ${tab.color}20` }}
                                                transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Right arrow */}
                            <button className="w-10 h-10 rounded-xl border border-white/[0.06] flex items-center justify-center text-white/20 hover:text-white/50 transition-colors">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Tab content — crossfade like deepcharts */}
                    <AnimatePresence mode="wait">
                        {activeFeature && <FeaturePanel tab={activeFeature} />}
                    </AnimatePresence>
                </div>
            </RevealSection>

            {/* ═══ FEATURE GRID (Glow Cards) ═══ */}
            <RevealSection className="py-24 relative z-10" id="tools">
                <div className="max-w-[1100px] mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">
                            Everything You Need to{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-200 via-[#D0A030] to-[#E0B040] drop-shadow-[0_0_15px_rgba(208,160,48,0.5)]">Win</span>
                        </h2>
                        <p className="text-white/25 text-lg max-w-xl mx-auto">
                            Professional tools normally reserved for hedge funds — now at your fingertips.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {gridFeatures.map((feat, i) => (
                            <GlowCard key={feat.title} {...feat} delay={i * 0.08} />
                        ))}
                    </div>
                </div>
            </RevealSection>

            {/* ═══ CTA SECTION ═══ */}
            <RevealSection className="py-32 relative text-center z-10">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#D0A030]/[0.02] to-transparent pointer-events-none" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#D0A030]/[0.05] blur-[150px] pointer-events-none" />
                <div className="max-w-3xl mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
                            Ready to Level Up
                            <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E0B040] to-[#D0A030]">
                                Your Trading Game?
                            </span>
                        </h2>
                        <p className="text-xl text-white/25 mb-10">
                            The best institutional-grade tools are waiting for you.
                        </p>
                        <Link to="/auth?mode=register">
                            <motion.button
                                whileHover={{ scale: 1.06, boxShadow: '0 0 60px rgba(226,232,240,0.5)' }}
                                whileTap={{ scale: 0.95 }}
                                className="px-12 py-5 rounded-lg bg-gradient-to-r from-[#E2E8F0] to-[#CFD8E3] text-slate-900 font-bold text-xl shadow-[0_0_40px_rgba(226,232,240,0.3)] border border-[#FFFFFF]/50 transition-shadow"
                            >
                                Start Your Journey Now
                            </motion.button>
                        </Link>
                    </motion.div>
                </div>
            </RevealSection>

            {/* ═══ FOOTER ═══ */}
            <footer className="py-14 border-t border-white/[0.04] bg-black relative z-10">
                <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-10 text-center md:text-left">
                    <div className="col-span-1 md:col-span-2">
                        <div className="flex items-center gap-2.5 mb-4 justify-center md:justify-start">
                            <img src={kairongBull} alt="Kairon" className="h-9 w-auto" />
                            <span className="text-xl font-black tracking-[0.2em] text-white uppercase" style={{
                                fontFamily: 'Georgia, serif',
                                textShadow: '0 0 10px rgba(255,255,255,0.4), 0 0 20px rgba(208,160,48,0.3)'
                            }}>KARION</span>
                        </div>
                        <p className="text-white/20 text-sm max-w-xs mx-auto md:mx-0 leading-relaxed">
                            The professional operating system for modern traders. Integrating institutional data, analytics, and execution in one platform.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4 font-inter tracking-wide uppercase text-sm">Product</h4>
                        <ul className="space-y-2.5 text-sm text-white/50">
                            <li><a href="#features" className="hover:text-[#C0C0C0] transition-colors">Features</a></li>
                            <li><a href="#showcase" className="hover:text-[#C0C0C0] transition-colors">Showcase</a></li>
                            <li><a href="#tools" className="hover:text-[#C0C0C0] transition-colors">Tools</a></li>
                            <li><Link to="/pricing" className="hover:text-[#C0C0C0] transition-colors">Pricing</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold mb-4 font-inter tracking-wide uppercase text-sm">Company</h4>
                        <ul className="space-y-2.5 text-sm text-white/50">
                            <li><a href="#" className="hover:text-[#C0C0C0] transition-colors">About</a></li>
                            <li><a href="#" className="hover:text-[#C0C0C0] transition-colors">Contact</a></li>
                            <li><a href="#" className="hover:text-[#C0C0C0] transition-colors">Terms</a></li>
                            <li><a href="#" className="hover:text-[#C0C0C0] transition-colors">Privacy</a></li>
                        </ul>
                    </div>
                </div>
                <div className="max-w-[1200px] mx-auto px-6 mt-12 pt-8 border-t border-white/[0.04] text-center text-xs text-white/15">
                    © 2026 Karion Trading OS. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
