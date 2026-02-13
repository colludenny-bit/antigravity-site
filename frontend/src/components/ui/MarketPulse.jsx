import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, Info, Zap, Target, DollarSign } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Live Market Pulse Component
 * Shows real-time market insights and alerts in a compact, dismissible banner
 */
export const MarketPulse = ({ data, className }) => {
    const [dismissed, setDismissed] = useState(false);
    const [currentInsight, setCurrentInsight] = useState(0);

    // Generate market insights based on data
    const insights = useMemo(() => {
        const results = [];

        if (!data) {
            return [{
                type: 'info',
                icon: Info,
                message: 'Analyzing market conditions...',
                color: '#F59E0B'
            }];
        }

        const { vix, regime, analyses } = data;

        // VIX alerts
        if (vix?.current > 25) {
            results.push({
                type: 'warning',
                icon: AlertTriangle,
                message: `High volatility detected: VIX at ${vix.current}. Consider reducing position sizes.`,
                color: '#EF4444'
            });
        } else if (vix?.current < 15) {
            results.push({
                type: 'info',
                icon: Info,
                message: `Low volatility regime: VIX at ${vix.current}. Ideal for range strategies.`,
                color: '#00D9A5'
            });
        }

        // Regime alerts
        if (regime === 'risk-off') {
            results.push({
                type: 'alert',
                icon: TrendingDown,
                message: 'Risk-OFF detected. Defensive positioning recommended.',
                color: '#EF4444'
            });
        } else if (regime === 'risk-on') {
            results.push({
                type: 'success',
                icon: TrendingUp,
                message: 'Risk-ON environment. Growth assets favored.',
                color: '#00D9A5'
            });
        }

        // Consensus signals
        if (analyses) {
            const bullish = Object.values(analyses).filter(a => a.direction === 'Up').length;
            const total = Object.values(analyses).length;

            if (bullish / total > 0.7) {
                results.push({
                    type: 'success',
                    icon: Zap,
                    message: `Strong bullish consensus: ${bullish}/${total} assets trending up.`,
                    color: '#00D9A5'
                });
            } else if (bullish / total < 0.3) {
                results.push({
                    type: 'warning',
                    icon: Zap,
                    message: `Bearish consensus: Only ${bullish}/${total} assets trending up.`,
                    color: '#EF4444'
                });
            }
        }

        return results.length > 0 ? results : [{
            type: 'info',
            icon: Target,
            message: 'Markets stable. Monitor key levels for breakouts.',
            color: '#F59E0B'
        }];
    }, [data]);

    // Rotate through insights every 5 seconds
    useEffect(() => {
        if (insights.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentInsight(prev => (prev + 1) % insights.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [insights.length]);

    if (dismissed) return null;

    const insight = insights[currentInsight];
    const Icon = insight.icon;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={cn(
                    "relative overflow-hidden rounded-xl border p-3 mb-4",
                    "bg-gradient-to-r from-black/40 to-black/20 backdrop-blur-sm",
                    className
                )}
                style={{
                    borderColor: `${insight.color}30`
                }}
            >
                {/* Animated background accent */}
                <div
                    className="absolute inset-0 opacity-5"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${insight.color}, transparent)`,
                        animation: 'pulse 2s ease-in-out infinite'
                    }}
                />

                <div className="relative flex items-center gap-3">
                    {/* Icon */}
                    <div
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{
                            backgroundColor: `${insight.color}15`,
                            border: `1px solid ${insight.color}30`
                        }}
                    >
                        <Icon className="w-4 h-4" style={{ color: insight.color }} />
                    </div>

                    {/* Message */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/90 font-medium">
                            {insight.message}
                        </p>
                        {insights.length > 1 && (
                            <div className="flex gap-1 mt-1.5">
                                {insights.map((_, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "h-1 rounded-full transition-all",
                                            i === currentInsight ? "w-6 bg-[#00D9A5]" : "w-1 bg-white/20"
                                        )}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Dismiss button */}
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-white/40 hover:text-white/80 transition-colors p-1"
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default MarketPulse;
