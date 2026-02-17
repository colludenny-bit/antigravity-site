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

/* ═══════════════════════════════════════════════════════════════════
   GLOW CARD — feature grid card
   ═══════════════════════════════════════════════════════════════════ */
const GlowCard = ({ icon: Icon, title, description, delay, color = '#00D9A5' }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
        whileHover={{ y: -6, scale: 1.02 }}
        className="group relative p-7 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden cursor-default transition-all duration-500"
        style={{ '--glow-color': color }}
    >
        {/* Hover glow overlay */}
        <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"
            style={{
                background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${color}10, transparent 40%)`,
                boxShadow: `inset 0 0 0 1px ${color}25`,
            }}
        />
        <div
            className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ boxShadow: `0 0 40px ${color}12, 0 0 80px ${color}06` }}
        />
        <div className="relative z-10">
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                style={{ background: `${color}12` }}
            >
                <Icon className="w-6 h-6" style={{ color }} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 font-apple">{title}</h3>
            <p className="text-sm text-white/35 leading-relaxed">{description}</p>
        </div>
    </motion.div>
);

/* ═══════════════════════════════════════════════════════════════════
   BROWSER FRAME — wraps screenshots in a realistic browser chrome
   starBorder: adds animated LED light on top edge, bright center fading to sides
   ═══════════════════════════════════════════════════════════════════ */
const BrowserFrame = ({ children, className = '', glow = true, glowColor = '#00D9A5', starBorder = false }) => (
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
    <div className="relative w-full">
        <div className="absolute inset-x-0 -top-8 h-24 bg-gradient-to-r from-transparent via-[#00D9A5]/20 to-transparent blur-2xl pointer-events-none" />
        <div className="relative mx-auto max-w-5xl perspective-[2200px]">
            <motion.div
                initial={{ opacity: 0, rotateX: -78, y: 36 }}
                animate={{ opacity: 1, rotateX: -8, y: 0 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
                className="relative origin-bottom mx-auto w-[94%] rounded-t-[22px] border border-white/20 bg-gradient-to-b from-[#22262b] to-[#0b0e11] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.65)]"
                style={{ transformStyle: 'preserve-3d' }}
            >
                <div className="relative overflow-hidden rounded-[14px] border border-white/10 bg-black aspect-[16/10]">
                    <motion.img
                        src={screenshot}
                        alt="Karion Dashboard Preview"
                        className="w-full h-full object-cover"
                        initial={{ scale: 1.07, opacity: 0.82 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 1.1, delay: 0.5, ease: 'easeOut' }}
                    />
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ opacity: [0.08, 0.22, 0.08] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                            background: 'radial-gradient(ellipse at 75% 12%, rgba(0,217,165,0.2), transparent 55%)',
                        }}
                    />
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.6 }}
                className="relative -mt-1 mx-auto h-6 w-full rounded-b-[24px] border border-white/15 bg-gradient-to-b from-[#c8c9cc] via-[#a0a2a7] to-[#7d7f84] shadow-[0_14px_38px_rgba(0,0,0,0.5)]"
            >
                <div className="absolute left-1/2 top-[3px] -translate-x-1/2 w-20 h-1.5 rounded-full bg-black/25" />
            </motion.div>
        </div>
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
        color: '#00D9A5',
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
        color: '#A855F7',
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
        color: '#F59E0B',
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
        color: '#EF4444',
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
        color: '#EC4899',
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
        color: '#06B6D4',
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
    { icon: BookOpen, title: 'Trade Journal', description: 'Log, review, and learn from every trade with detailed analytics and AI-powered insights.', color: '#00D9A5' },
    { icon: PieChart, title: 'Advanced Statistics', description: 'Comprehensive performance metrics, win rate analysis, and expectancy calculations.', color: '#3B82F6' },
    { icon: Target, title: 'Monte Carlo Sim', description: 'Stress-test your strategy with thousands of simulated outcomes and probability analysis.', color: '#A855F7' },
    { icon: Brain, title: 'Trading Psychology', description: 'Track emotional patterns, build discipline, and master your mindset with guided tools.', color: '#EC4899' },
    { icon: Calculator, title: 'Smart Calculator', description: 'Position sizing, pip value, margin, and risk-reward — all in one professional calculator.', color: '#F59E0B' },
    { icon: Newspaper, title: 'Real-Time News', description: 'Market-moving news feed with impact filtering and AI-powered sentiment analysis.', color: '#06B6D4' },
];

/* ═══════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

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
        <div className="min-h-screen bg-black text-white font-apple overflow-x-hidden selection:bg-[#00D9A5]/30" style={{ touchAction: 'pan-y' }}>

            {/* ═══ BACKGROUND EFFECTS — grid + grain + gradient blobs ═══ */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                {/* Subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px',
                    }}
                />
                {/* Grain/noise overlay */}
                <div
                    className="absolute inset-0 opacity-[0.015]"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
                        backgroundSize: '128px 128px',
                    }}
                />
                {/* Gradient blobs — deep blue/purple like deepcharts */}
                <div className="absolute top-0 left-0 w-[800px] h-[800px] rounded-full bg-[#1a0a3e] blur-[200px] opacity-30" />
                <div className="absolute top-[30%] right-0 w-[600px] h-[600px] rounded-full bg-[#0a1a3e] blur-[180px] opacity-20" />
                <div className="absolute bottom-0 left-[30%] w-[700px] h-[700px] rounded-full bg-[#0e1e3a] blur-[200px] opacity-15" />
            </div>

            {/* ═══ NAVBAR ═══ */}
            {/* NAVBAR — mobile classes (below sm:640px) add Dynamic Island padding + compact layout. Desktop unchanged via sm: overrides */}
            <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-black/60 backdrop-blur-2xl pt-[52px] sm:pt-0">
                <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-12 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                        <BullLogo className="h-6 sm:h-10 w-auto" />
                        <div className="relative">
                            <span className="text-xs sm:text-xl font-black tracking-[0.15em] sm:tracking-[0.2em] text-white uppercase" style={{
                                fontFamily: 'Georgia, serif',
                                textShadow: '0 0 10px rgba(255,255,255,0.4), 0 0 20px rgba(0,217,165,0.3)'
                            }}>KARION</span>
                            {/* Luminescent underline glow — hidden on mobile, shown on sm+ (desktop) */}
                            <div className="absolute -bottom-1 left-0 right-0 h-[2px] hidden sm:block" style={{ background: 'linear-gradient(90deg, transparent, #00D9A5, transparent)' }} />
                            <div className="absolute -bottom-1 left-0 right-0 h-[6px] blur-[3px] opacity-60 hidden sm:block" style={{ background: 'linear-gradient(90deg, transparent, #00D9A5, transparent)' }} />
                        </div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl">
                        <a href="#features" className="px-5 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-200">Features</a>
                        <a href="#showcase" className="px-5 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-200">Showcase</a>
                        <a href="#tools" className="px-5 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-200">Tools</a>
                        <Link to="/pricing" className="px-5 py-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-200">Pricing</Link>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        {!user ? (
                            <>
                                <Link to="/auth?mode=login" className="hidden sm:inline text-sm font-medium text-white/40 hover:text-white transition-colors">
                                    Log in
                                </Link>
                                <Link to="/auth?mode=register">
                                    <motion.button
                                        whileHover={{ scale: 1.05, boxShadow: '0 0 25px rgba(0,217,165,0.5)' }}
                                        whileTap={{ scale: 0.95 }}
                                        className="px-2.5 sm:px-5 py-1 sm:py-2 rounded-md sm:rounded-lg bg-[#00D9A5] text-black font-bold text-[10px] sm:text-sm transition-shadow duration-300 flex items-center gap-1 sm:gap-1.5"
                                    >
                                        <span className="sm:hidden">Accedi</span><span className="hidden sm:inline">Get Access</span> <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
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
            <section className="relative pt-36 pb-8 overflow-hidden z-20">
                {/* Hero horizontal light streak like deepcharts */}
                <div className="absolute top-[55%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#4F46E5]/40 to-transparent pointer-events-none" />

                <div className="max-w-[1200px] mx-auto px-6 text-center">
                    <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                        <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="inline-block px-5 py-2 rounded-full bg-[#00D9A5]/8 border border-[#00D9A5]/15 text-[#00D9A5] text-xs font-bold uppercase tracking-[0.25em] mb-8"
                        >
                            ✦ The Ultimate Trading OS
                        </motion.span>
                        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-6 leading-[0.9] tracking-tighter text-white" style={{ textShadow: '0 0 40px rgba(255,255,255,0.15), 0 0 80px rgba(255,255,255,0.05)' }}>
                            Uncover The{' '}
                            <span className="text-white">
                                Smart Money
                            </span>
                            <br />
                            <span className="text-white">Footprint.</span>
                        </h1>
                        <p className="text-lg md:text-xl text-white/30 max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
                            COT Analysis, Options Flow, Macro Data, AI Copilot — unified in one
                            operating system built for professional traders.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                            {user ? (
                                <Link to="/app">
                                    <motion.button
                                        whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(0,217,165,0.5)' }}
                                        whileTap={{ scale: 0.97 }}
                                        className="px-12 py-4 rounded-lg bg-[#00D9A5] text-black font-bold text-lg shadow-[0_0_30px_rgba(0,217,165,0.25)] flex items-center justify-center min-w-[300px]"
                                    >
                                        Accedi alla Dashboard
                                    </motion.button>
                                </Link>
                            ) : (
                                <Link to="/auth?mode=register">
                                    <motion.button
                                        whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(0,217,165,0.5)' }}
                                        whileTap={{ scale: 0.97 }}
                                        className="px-10 py-4 rounded-lg bg-[#00D9A5] text-black font-bold text-lg shadow-[0_0_30px_rgba(0,217,165,0.25)] flex items-center gap-2 group"
                                    >
                                        Access Now <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </motion.button>
                                </Link>
                            )}
                        </div>
                    </motion.div>

                    {/* Hero Dashboard Screenshot — real image in browser frame */}
                    <motion.div
                        initial={{ opacity: 0, y: 60, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 1, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="mt-16 max-w-5xl mx-auto"
                    >
                        <MacbookHero screenshot="/screenshots/hero-dashboard.png" />
                    </motion.div>
                </div>
            </section>

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

            {/* ═══ FEATURE SHOWCASE (Interactive Tabs) — DeepCharts-style ═══ */}
            <RevealSection className="py-24 relative z-10" id="showcase">
                <div className="max-w-[1300px] mx-auto px-6">
                    <div className="text-center mb-16">
                        {/* Badge like deepcharts */}
                        <span className="inline-block px-4 py-1.5 rounded-lg bg-[#00D9A5]/8 border border-[#00D9A5]/15 text-[#00D9A5] text-[11px] font-bold uppercase tracking-[0.2em] mb-6">
                            Karion <span className="text-white/40 ml-1">Behind The Data</span>
                        </span>
                        <h2 className="text-4xl md:text-6xl font-black mb-4 tracking-tight">
                            Meet, Your{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                                Pro Trader Arsenal
                            </span>
                        </h2>
                        <p className="text-white/25 text-lg max-w-xl mx-auto">
                            Follow the Smart Money with our data tools and boost your edge and your profits
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
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F59E0B] to-[#EC4899]">Win</span>
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
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00D9A5]/[0.02] to-transparent pointer-events-none" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#00D9A5]/[0.04] blur-[150px] pointer-events-none" />
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
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D9A5] to-[#4F46E5]">
                                Your Trading Game?
                            </span>
                        </h2>
                        <p className="text-xl text-white/25 mb-10">
                            The best institutional-grade tools are waiting for you.
                        </p>
                        <Link to="/auth?mode=register">
                            <motion.button
                                whileHover={{ scale: 1.06, boxShadow: '0 0 60px rgba(0,217,165,0.5)' }}
                                whileTap={{ scale: 0.95 }}
                                className="px-12 py-5 rounded-lg bg-[#00D9A5] text-black font-bold text-xl shadow-[0_0_40px_rgba(0,217,165,0.2)] transition-shadow"
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
                                textShadow: '0 0-10px rgba(255,255,255,0.4), 0 0 20px rgba(0,217,165,0.3)'
                            }}>KARION</span>
                        </div>
                        <p className="text-white/20 text-sm max-w-xs mx-auto md:mx-0 leading-relaxed">
                            The professional operating system for modern traders. Integrating institutional data, analytics, and execution in one platform.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-bold text-white/60 mb-4 text-sm uppercase tracking-wider">Product</h4>
                        <ul className="space-y-2.5 text-sm text-white/25">
                            <li><a href="#features" className="hover:text-[#00D9A5] transition-colors">Features</a></li>
                            <li><a href="#showcase" className="hover:text-[#00D9A5] transition-colors">Showcase</a></li>
                            <li><a href="#tools" className="hover:text-[#00D9A5] transition-colors">Tools</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-white/60 mb-4 text-sm uppercase tracking-wider">Company</h4>
                        <ul className="space-y-2.5 text-sm text-white/25">
                            <li><a href="#" className="hover:text-[#00D9A5] transition-colors">About</a></li>
                            <li><a href="#" className="hover:text-[#00D9A5] transition-colors">Contact</a></li>
                            <li><a href="#" className="hover:text-[#00D9A5] transition-colors">Terms</a></li>
                            <li><a href="#" className="hover:text-[#00D9A5] transition-colors">Privacy</a></li>
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
