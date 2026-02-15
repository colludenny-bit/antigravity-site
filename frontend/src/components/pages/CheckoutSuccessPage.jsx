import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Sparkles, Crown, Shield, Zap } from 'lucide-react';
import kairongBull from '../../assets/kairon-bull.png';

const planIcons = { Essential: Shield, Plus: Zap, Pro: Crown };
const planColors = { Essential: '#3B82F6', Plus: '#00D9A5', Pro: '#F59E0B' };

export default function CheckoutSuccessPage() {
    const [searchParams] = useSearchParams();
    const planSlug = searchParams.get('plan') || '';
    const planName = planSlug.split('-')[0]?.replace(/^\w/, c => c.toUpperCase()) || 'Plan';
    const period = planSlug.includes('annual') ? 'Annuale' : 'Mensile';
    const Icon = planIcons[planName] || Sparkles;
    const color = planColors[planName] || '#00D9A5';

    const [confettiDone, setConfettiDone] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setConfettiDone(true), 3000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background effects */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-[200px] opacity-20"
                    style={{ background: color }} />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-[#1a0a3e] blur-[200px] opacity-20" />
            </div>

            {/* Confetti particles */}
            {!confettiDone && Array.from({ length: 30 }).map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full pointer-events-none z-50"
                    style={{
                        background: ['#00D9A5', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'][i % 5],
                        top: '-10px',
                        left: `${Math.random() * 100}%`,
                    }}
                    initial={{ y: -20, opacity: 1, scale: 1 }}
                    animate={{
                        y: window.innerHeight + 100,
                        x: (Math.random() - 0.5) * 300,
                        rotate: Math.random() * 720,
                        opacity: [1, 1, 0],
                        scale: [1, 1.5, 0.5],
                    }}
                    transition={{
                        duration: 2 + Math.random() * 2,
                        delay: Math.random() * 1,
                        ease: 'easeOut',
                    }}
                />
            ))}

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.7, type: 'spring' }}
                className="relative z-10 max-w-lg w-full"
            >
                <div className="rounded-3xl bg-[#0A0A0A] border border-white/[0.08] overflow-hidden">
                    {/* Top gradient accent */}
                    <div className="h-1.5" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

                    <div className="p-10 text-center">
                        {/* Success icon */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.3, stiffness: 200 }}
                            className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
                            style={{ background: `${color}15`, border: `2px solid ${color}30` }}
                        >
                            <CheckCircle className="w-10 h-10" style={{ color }} />
                        </motion.div>

                        {/* Title */}
                        <motion.h1
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="text-3xl font-black tracking-tight mb-2"
                        >
                            Benvenuto nel Piano{' '}
                            <span style={{ color }}>{planName}</span>! 🎉
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 }}
                            className="text-white/50 text-base mb-8"
                        >
                            Il tuo abbonamento {period} è stato attivato con successo.
                        </motion.p>

                        {/* Plan card */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9 }}
                            className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 mb-8"
                        >
                            <div className="flex items-center justify-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{ background: `${color}12` }}>
                                    <Icon className="w-5 h-5" style={{ color }} />
                                </div>
                                <span className="text-xl font-bold">{planName}</span>
                                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
                                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                                    {period}
                                </span>
                            </div>
                            <p className="text-white/40 text-sm">
                                Tutte le funzionalità del tuo piano sono ora sbloccate.
                            </p>
                        </motion.div>

                        {/* CTA */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.1 }}
                        >
                            <Link to="/app">
                                <motion.button
                                    whileHover={{ scale: 1.03, boxShadow: `0 0 40px ${color}40` }}
                                    whileTap={{ scale: 0.97 }}
                                    className="w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 text-black transition-all"
                                    style={{ backgroundColor: color }}
                                >
                                    Vai alla Dashboard
                                    <ArrowRight className="w-5 h-5" />
                                </motion.button>
                            </Link>
                        </motion.div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-white/[0.04] px-10 py-4 flex items-center justify-center gap-2">
                        <img src={kairongBull} alt="Kairon" className="h-5 w-auto opacity-40" />
                        <span className="text-xs text-white/20 font-medium tracking-widest uppercase">Kairon Trading OS</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
