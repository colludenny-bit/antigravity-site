import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'sonner';
import {
    ArrowRight, Check, X, Sparkles, Shield, Zap, Crown,
    BarChart3, Brain, Globe, LineChart, Target, Calculator,
    BookOpen, Newspaper, PieChart, Activity, ChevronRight, Loader2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import kairongBull from '../../assets/kairon-bull.png';

/* ═══════════════════════════════════════════════════════════════════
   PRICING PLANS DATA
   ═══════════════════════════════════════════════════════════════════ */
const plans = [
    {
        id: 'essential',
        name: 'Essential',
        price: '14.99',
        period: '/mo',
        icon: Shield,
        color: '#3B82F6',
        badge: null,
        annualDiscount: 0.15,
        description: 'Le basi per iniziare a operare con dati professionali.',
        features: [
            { text: 'Market Screening (2 assets)', included: true },
            { text: 'Daily Bias & Regime', included: true },
            { text: 'News Feed base', included: true },
            { text: 'Grafici multi-timeframe', included: true },
            { text: 'Calcolatore rischio/posizione', included: true },
            { text: 'Trade Journal (max 50/mese)', included: true },
            { text: 'Statistiche base', included: true },
            { text: 'COT Analysis', included: false },
            { text: 'Options Flow', included: false },
            { text: 'Macro Dashboard', included: false },
            { text: 'AI Copilot', included: false },
            { text: 'Monte Carlo Simulation', included: false },
            { text: 'Report Posizionamenti', included: false },
            { text: 'Supporto prioritario', included: false },
        ],
    },
    {
        id: 'plus',
        name: 'Plus',
        price: '29.99',
        period: '/mo',
        icon: Zap,
        color: '#00D9A5',
        badge: 'Most Popular',
        annualDiscount: 0.20,
        description: 'Strumenti avanzati per trader che vogliono il vantaggio.',
        features: [
            { text: 'Market Screening (tutti gli assets)', included: true },
            { text: 'Daily Bias & Regime', included: true },
            { text: 'News Feed con impatto AI', included: true },
            { text: 'Grafici multi-timeframe', included: true },
            { text: 'Calcolatore rischio/posizione', included: true },
            { text: 'Trade Journal illimitato', included: true },
            { text: 'Statistiche avanzate', included: true },
            { text: 'COT Analysis completa', included: true },
            { text: 'Options Flow & GEX', included: true },
            { text: 'Macro Dashboard', included: true },
            { text: 'AI Copilot (50 query/giorno)', included: true },
            { text: 'Monte Carlo Simulation', included: false },
            { text: 'Report Posizionamenti', included: false },
            { text: 'Supporto prioritario', included: false },
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '49.99',
        period: '/mo',
        icon: Crown,
        color: '#F59E0B',
        badge: 'Full Power',
        annualDiscount: 0.25,
        description: 'Tutto incluso. L\'arsenale completo del trader istituzionale.',
        features: [
            { text: 'Market Screening (tutti gli assets)', included: true },
            { text: 'Daily Bias & Regime', included: true },
            { text: 'News Feed con impatto AI', included: true },
            { text: 'Grafici multi-timeframe', included: true },
            { text: 'Calcolatore rischio/posizione', included: true },
            { text: 'Trade Journal illimitato', included: true },
            { text: 'Statistiche avanzate + export', included: true },
            { text: 'COT Analysis completa', included: true },
            { text: 'Options Flow & GEX', included: true },
            { text: 'Macro Dashboard completa', included: true },
            { text: 'AI Copilot illimitato', included: true },
            { text: 'Monte Carlo Simulation', included: true },
            { text: 'Report Posizionamenti live', included: true },
            { text: 'Supporto prioritario 24/7', included: true },
        ],
    },
];

const faqItems = [
    {
        q: 'Posso cambiare piano in qualsiasi momento?',
        a: 'Sì, puoi fare upgrade o downgrade del tuo piano in qualsiasi momento. La differenza verrà calcolata pro-rata.',
    },
    {
        q: 'C\'è un periodo di prova gratuito?',
        a: 'Offriamo 7 giorni di prova gratuita sul piano Plus per testare tutte le funzionalità avanzate.',
    },
    {
        q: 'I miei dati finanziari sono al sicuro?',
        a: 'Assolutamente. Utilizziamo crittografia AES-256 e i dati non vengono mai condivisi con terze parti.',
    },
    {
        q: 'Come funziona il setup iniziale?',
        a: 'Registrati, scegli il tuo piano e sei operativo in meno di 2 minuti. Nessuna configurazione complessa.',
    },
];

const buildStripeEnvKey = (planId, period = '') => {
    const normalizedId = planId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const normalizedPeriod = period ? `_${period.toUpperCase()}` : '';
    return `REACT_APP_STRIPE_PRICE_${normalizedId}${normalizedPeriod}`;
};

const getStripePriceId = (planId, period) => {
    const specific = process.env[buildStripeEnvKey(planId, period)];
    if (specific) return specific;
    return process.env[buildStripeEnvKey(planId, '')] || '';
};

const getApiBaseUrl = () => {
    const envUrl = process.env.REACT_APP_BACKEND_URL?.replace(/\/$/, '');
    if (envUrl) {
        return `${envUrl}/api`;
    }

    if (typeof window !== 'undefined' && window.location.origin) {
        return `${window.location.origin}/api`;
    }

    return '/api';
};

const DEFAULT_STRIPE_SESSION_MODE = ['payment', 'subscription'].includes(
    process.env.REACT_APP_STRIPE_SESSION_MODE?.toLowerCase()
)
    ? process.env.REACT_APP_STRIPE_SESSION_MODE.toLowerCase()
    : 'subscription';

/* ═══════════════════════════════════════════════════════════════════
   LED SPIN KEYFRAMES (injected once)
   ═══════════════════════════════════════════════════════════════════ */
const ledStyleId = 'pricing-led-style';
if (typeof document !== 'undefined' && !document.getElementById(ledStyleId)) {
    const style = document.createElement('style');
    style.id = ledStyleId;
    style.textContent = `
        @keyframes ledSpin {
            0%   { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════════════════════════
   PRICING CARD
   ═══════════════════════════════════════════════════════════════════ */
const PricingCard = ({ plan, index, annual, onCheckout }) => {
    const isPopular = plan.badge === 'Most Popular';
    const [checkoutLoading, setCheckoutLoading] = useState(false);

    const handleCheckout = async () => {
        setCheckoutLoading(true);
        try {
            await onCheckout(plan.id, annual);
        } catch (e) {
            // error handled upstream
        } finally {
            setCheckoutLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.15 }}
            className={`relative rounded-2xl transition-all duration-500 ${isPopular ? 'scale-[1.03] z-10' : ''
                }`}
            style={{
                boxShadow: isPopular
                    ? `0 0 60px ${plan.color}15, 0 0 120px ${plan.color}08`
                    : 'none',
            }}
        >
            {/* ★ Animated LED border — rotating conic gradient */}
            <div
                className="absolute inset-0 rounded-2xl overflow-hidden"
                style={{ padding: '1px' }}
            >
                <div
                    className="absolute"
                    style={{
                        top: '-50%',
                        left: '-50%',
                        width: '200%',
                        height: '200%',
                        background: `conic-gradient(from 0deg, transparent 0%, ${plan.color} 10%, transparent 20%, transparent 100%)`,
                        animation: 'ledSpin 4s linear infinite',
                    }}
                />
            </div>
            {/* Static subtle border underneath for when LED is elsewhere */}
            <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            />
            {/* Bloom glow for popular */}
            {isPopular && (
                <div
                    className="absolute top-0 left-0 right-0 h-[25px] pointer-events-none rounded-t-2xl z-10"
                    style={{
                        background: `radial-gradient(ellipse 50% 100% at 50% 0%, ${plan.color}30, transparent 70%)`,
                    }}
                />
            )}
            {/* Card inner content */}
            <div className={`relative rounded-2xl flex flex-col m-[1px] ${isPopular ? 'bg-[#0A0A0A]' : 'bg-[#060606]'
                }`}>
                <div className="p-8 flex-1 flex flex-col">
                    {/* Badge */}
                    {plan.badge && (
                        <div
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-5 w-fit"
                            style={{
                                background: `${plan.color}15`,
                                color: plan.color,
                                border: `1px solid ${plan.color}30`,
                            }}
                        >
                            <Sparkles className="w-3 h-3" />
                            {plan.badge}
                        </div>
                    )}

                    {/* Plan name & icon */}
                    <div className="flex items-center gap-3 mb-2">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: `${plan.color}12` }}
                        >
                            <plan.icon className="w-5 h-5" style={{ color: plan.color }} />
                        </div>
                        <h3 className="text-2xl font-black text-white tracking-tight">{plan.name}</h3>
                    </div>

                    {/* Description */}
                    <p className="text-white/50 text-base mb-6 leading-relaxed">{plan.description}</p>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mb-8">
                        <span className="text-white/50 text-xl">€</span>
                        <span
                            className="text-6xl font-black text-white tracking-tight"
                            style={{ textShadow: isPopular ? `0 0 30px ${plan.color}30` : 'none' }}
                        >
                            {plan.price}
                        </span>
                        <span className="text-white/40 text-base font-medium">{plan.period}</span>
                    </div>
                    {/* Annual savings */}
                    {plan.savings && (
                        <div className="-mt-5 mb-6 flex items-center gap-2">
                            <span className="text-[#00D9A5] text-sm font-bold">Risparmi €{plan.savings}/anno</span>
                            <span className="text-xs font-bold text-[#00D9A5] bg-[#00D9A5]/10 px-2 py-0.5 rounded-full">-{Math.round(plan.discountPct * 100)}%</span>
                        </div>
                    )}

                    {/* CTA Button */}
                    <div className="mb-8">
                        <motion.button
                            onClick={handleCheckout}
                            disabled={checkoutLoading}
                            whileHover={{
                                scale: 1.03,
                                boxShadow: `0 0 40px ${plan.color}40`,
                            }}
                            whileTap={{ scale: 0.97 }}
                            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${isPopular
                                ? 'text-black'
                                : 'text-white border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                                } ${checkoutLoading ? 'opacity-70 cursor-wait' : ''}`}
                            style={isPopular ? { backgroundColor: plan.color } : {}}
                        >
                            {checkoutLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Inizia con {plan.name}
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </motion.button>

                    </div >

                    {/* Features list */}
                    < div className="space-y-3 flex-1" >
                        <div className="text-xs text-white/40 uppercase tracking-widest font-bold mb-4">
                            Cosa include
                        </div>
                        {
                            plan.features.map((feat, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    {feat.included ? (
                                        <Check
                                            className="w-4.5 h-4.5 mt-0.5 flex-shrink-0"
                                            style={{ color: plan.color }}
                                        />
                                    ) : (
                                        <X className="w-4.5 h-4.5 mt-0.5 flex-shrink-0 text-white/20" />
                                    )}
                                    <span
                                        className={`text-[15px] ${feat.included ? 'text-white/80' : 'text-white/25'
                                            }`}
                                    >
                                        {feat.text}
                                    </span>
                                </div>
                            ))
                        }
                    </div >
                </div >
            </div >
        </motion.div >
    );
};

/* ═══════════════════════════════════════════════════════════════════
   FAQ ITEM
   ═══════════════════════════════════════════════════════════════════ */
const FAQItem = ({ item, index }) => {
    const [open, setOpen] = useState(false);
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="border-b border-white/[0.06] last:border-0"
        >
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between py-5 text-left group"
            >
                <span className="text-white font-semibold text-base group-hover:text-white transition-colors">
                    {item.q}
                </span>
                <ChevronRight
                    className={`w-5 h-5 text-white/30 transition-transform duration-300 ${open ? 'rotate-90' : ''
                        }`}
                />
            </button>
            <motion.div
                initial={false}
                animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
            >
                <p className="text-white/50 text-[15px] pb-5 leading-relaxed">{item.a}</p>
            </motion.div>
        </motion.div>
    );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN PRICING PAGE
   ═══════════════════════════════════════════════════════════════════ */
const PricingPage = () => {
    const [annual, setAnnual] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [showCouponInput, setShowCouponInput] = useState(false);
    const { user, checkoutPlan } = useAuth();
    const navigate = useNavigate();

    const handleCheckout = async (planId, isAnnual) => {
        const slug = `${planId}-${isAnnual ? 'annual' : 'monthly'}`;
        if (!user) {
            // Not logged in — redirect to auth with plan preserved
            navigate(`/auth?mode=register&plan=${slug}&coupon=${couponCode}`);
            return;
        }
        try {
            await checkoutPlan(slug, isAnnual, couponCode);
        } catch (error) {
            const detail = error.response?.data?.detail || error.message;
            toast.error(`Errore checkout: ${detail}`);
        }
    };


    return (
        <div className="min-h-screen bg-black text-white font-apple overflow-x-hidden selection:bg-[#00D9A5]/30">
            {/* Background effects */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px',
                    }}
                />
                <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full bg-[#0a1a3e] blur-[200px] opacity-25" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-[#1a0a3e] blur-[200px] opacity-20" />
            </div>

            {/* Navbar */}
            <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-black/60 backdrop-blur-2xl">
                <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3">
                        <img src={kairongBull} alt="Kairon" className="h-10 w-auto" />
                        <div className="relative">
                            <span className="text-xl font-black tracking-[0.15em] text-white uppercase" style={{ fontFamily: 'Georgia, serif' }}>KAIRON</span>
                            <div className="absolute -bottom-1 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #00D9A5, transparent)' }} />
                            <div className="absolute -bottom-1 left-0 right-0 h-[6px] blur-[3px] opacity-60" style={{ background: 'linear-gradient(90deg, transparent, #00D9A5, transparent)' }} />
                        </div>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link to="/auth?mode=login" className="text-sm font-medium text-white/40 hover:text-white transition-colors">
                            Log in
                        </Link>
                        <Link to="/auth?mode=register">
                            <motion.button
                                whileHover={{ scale: 1.05, boxShadow: '0 0 25px rgba(0,217,165,0.5)' }}
                                whileTap={{ scale: 0.95 }}
                                className="px-5 py-2 rounded-lg bg-[#00D9A5] text-black font-bold text-sm transition-shadow duration-300 flex items-center gap-1.5"
                            >
                                Get Access <ArrowRight className="w-3.5 h-3.5" />
                            </motion.button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative pt-36 pb-16 z-10">
                <div className="max-w-[1200px] mx-auto px-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 25 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                    >
                        <span className="inline-block px-5 py-2 rounded-full bg-[#00D9A5]/8 border border-[#00D9A5]/15 text-[#00D9A5] text-xs font-bold uppercase tracking-[0.25em] mb-6">
                            ✦ Pricing
                        </span>
                        <h1
                            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black mb-5 leading-[0.95] tracking-tighter text-white"
                            style={{ textShadow: '0 0 40px rgba(255,255,255,0.12)' }}
                        >
                            Plans for Every<br />
                            <span className="text-white">Stage.</span>
                        </h1>
                        <p className="text-xl text-white/45 max-w-xl mx-auto mb-10">
                            Scegli il piano che si adatta al tuo livello. Upgrade quando vuoi.
                        </p>

                        {/* Monthly / Annual toggle */}
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <span className={`text-sm font-semibold transition-colors ${!annual ? 'text-white' : 'text-white/30'}`}>
                                Mensile
                            </span>
                            <button
                                onClick={() => setAnnual(!annual)}
                                className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${annual ? 'bg-[#00D9A5]' : 'bg-white/10'
                                    }`}
                            >
                                <motion.div
                                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
                                    animate={{ left: annual ? '32px' : '4px' }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            </button>
                            <span className={`text-sm font-semibold transition-colors ${annual ? 'text-white' : 'text-white/30'}`}>
                                Annuale
                            </span>
                            {annual && (
                                <motion.span
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-[#00D9A5]/15 text-[#00D9A5] uppercase tracking-wider"
                                >
                                    Fino al 25% Off
                                </motion.span>
                            )}
                        </div>

                        {/* Discount Code Section */}
                        <div className="flex flex-col items-center mb-16">
                            {!showCouponInput ? (
                                <button
                                    onClick={() => setShowCouponInput(true)}
                                    className="text-xs font-bold text-white/30 hover:text-[#00D9A5] transition-colors uppercase tracking-[0.2em]"
                                >
                                    Hai un codice sconto?
                                </button>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md"
                                >
                                    <input
                                        type="text"
                                        placeholder="Inserisci codice"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                        className="bg-transparent border-none focus:ring-0 text-sm font-bold uppercase tracking-widest px-4 py-2 w-48 placeholder:text-white/20"
                                    />
                                    <button
                                        onClick={() => setShowCouponInput(false)}
                                        className="p-2 text-white/40 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Pricing Cards */}
            <section className="relative z-10 pb-24">
                <div className="max-w-[1200px] mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        {plans.map((plan, i) => {
                            const monthlyPrice = parseFloat(plan.price);
                            const annualMonthly = monthlyPrice * (1 - plan.annualDiscount);
                            const annualTotal = annualMonthly * 12;
                            const savings = (monthlyPrice * 12 - annualTotal).toFixed(0);
                            const periodKey = annual ? 'annual' : 'monthly';
                            const checkoutKey = `${plan.id}-${periodKey}`;
                            const stripePriceId = getStripePriceId(plan.id, periodKey);
                            return (
                                <PricingCard key={plan.id} plan={{
                                    ...plan,
                                    price: annual
                                        ? annualTotal.toFixed(0)
                                        : plan.price,
                                    period: annual ? '/anno' : '/mese',
                                    savings: annual ? savings : null,
                                    discountPct: annual ? plan.annualDiscount : null,
                                }} index={i} annual={annual} onCheckout={handleCheckout} />
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="relative z-10 py-24">
                <div className="max-w-[700px] mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-3xl md:text-4xl font-black text-white mb-3 tracking-tight">
                            All You Need to Know
                        </h2>
                        <p className="text-white/45 text-base">Domande frequenti sui piani e funzionalità.</p>
                    </motion.div>
                    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-6">
                        {faqItems.map((item, i) => (
                            <FAQItem key={i} item={item} index={i} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer mini */}
            <footer className="py-10 border-t border-white/[0.04] bg-black relative z-10 text-center">
                <div className="flex items-center justify-center gap-2.5 mb-3">
                    <img src={kairongBull} alt="Kairon" className="h-7 w-auto" />
                    <span className="text-lg font-black tracking-[0.15em] text-white uppercase" style={{ fontFamily: 'Georgia, serif' }}>KAIRON</span>
                </div>
                <p className="text-white/15 text-xs">© 2026 Kairon Trading OS. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default PricingPage;
