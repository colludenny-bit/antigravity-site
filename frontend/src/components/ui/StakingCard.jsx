import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

// Circular Progress Ring Component
const CircularProgress = ({ value, maxValue = 100, size = 80, strokeWidth = 8, color = '#00D9A5' }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const normalizedValue = Math.min(Math.max(value, 0), maxValue);
    const offset = circumference - (normalizedValue / maxValue) * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={strokeWidth}
            />
            {/* Progress circle */}
            <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 2.0, ease: "easeOut" }}
                style={{ filter: `drop-shadow(0 0 8px ${color}50)` }}
            />
        </svg>
    );
};

// Semi-Circle Gauge Component
const SemiCircleGauge = ({ value, label, color = '#00D9A5', size = 80 }) => {
    const percentage = Math.min(Math.max(value, 0), 100);
    const angle = (percentage / 100) * 180;

    return (
        <div className="relative" style={{ width: size, height: size / 2 + 10 }}>
            <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
                {/* Background arc */}
                <path
                    d={`M ${size * 0.1} ${size / 2} A ${size * 0.4} ${size * 0.4} 0 0 1 ${size * 0.9} ${size / 2}`}
                    fill="transparent"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                    strokeLinecap="round"
                />
                {/* Progress arc */}
                <motion.path
                    d={`M ${size * 0.1} ${size / 2} A ${size * 0.4} ${size * 0.4} 0 0 1 ${size * 0.9} ${size / 2}`}
                    fill="transparent"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: percentage / 100 }}
                    transition={{ duration: 2.0, ease: "easeOut" }}
                    style={{ filter: `drop-shadow(0 0 8px ${color}50)` }}
                />
            </svg>
            <div className="absolute inset-0 flex items-end justify-center pb-1">
                <span className="text-xs font-bold" style={{ color }}>{label}</span>
            </div>
        </div>
    );
};

// Donut Chart with center value
const DonutChart = ({ value, label, color = '#00D9A5', size = 80, strokeWidth = 10 }) => {
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <CircularProgress value={value} size={size} strokeWidth={strokeWidth} color={color} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold" style={{ color }}>{value}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
        </div>
    );
};

// Mini Area Chart
const MiniAreaChart = ({ data = [30, 45, 25, 60, 40, 70, 50], color = '#00D9A5', width = 80, height = 40 }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height * 0.8 - height * 0.1;
        return `${x},${y}`;
    }).join(' ');

    const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`;
    const linePath = `M ${points}`;

    return (
        <svg width={width} height={height} className="overflow-visible">
            <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <motion.path
                d={areaPath}
                fill="url(#areaGradient)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.3 }}
            />
            <motion.polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 2.0, ease: "easeOut" }}
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
        </svg>
    );
};

// Staking Style Card Component
export const StakingCard = ({
    to,
    icon: Icon,
    title,
    value,
    subtitle,
    chartType = 'donut', // 'donut', 'gauge', 'ring', 'area'
    chartValue = 50,
    chartLabel = '%',
    chartColor = '#00D9A5'
}) => {
    const renderChart = () => {
        switch (chartType) {
            case 'donut':
                return <DonutChart value={chartValue} label={chartLabel} color={chartColor} />;
            case 'gauge':
                return <SemiCircleGauge value={chartValue} label={chartLabel} color={chartColor} />;
            case 'ring':
                return (
                    <div className="relative" style={{ width: 80, height: 80 }}>
                        <CircularProgress value={chartValue} size={80} strokeWidth={6} color={chartColor} />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold" style={{ color: chartColor }}>{chartLabel}</span>
                        </div>
                    </div>
                );
            case 'area':
                return <MiniAreaChart color={chartColor} />;
            default:
                return <DonutChart value={chartValue} label={chartLabel} color={chartColor} />;
        }
    };

    return (
        <Link to={to}>
            <motion.div
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "relative overflow-hidden rounded-2xl p-5 h-full cursor-pointer",
                    "bg-gradient-to-br from-[#0a1a1a] to-[#0d2020]",
                    "border border-[#00D9A5]/20",
                    "hover:border-[#00D9A5]/40 hover:shadow-[0_0_30px_rgba(0,217,165,0.15)]",
                    "transition-all duration-300"
                )}
                style={{
                    backdropFilter: 'blur(20px)',
                }}
            >
                {/* Glow effect */}
                <div
                    className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20 blur-3xl"
                    style={{ background: `radial-gradient(circle, ${chartColor}40, transparent)` }}
                />

                {/* Content */}
                <div className="relative z-10 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{
                                    background: `linear-gradient(135deg, ${chartColor}20, ${chartColor}10)`,
                                    border: `1px solid ${chartColor}30`
                                }}
                            >
                                <Icon className="w-5 h-5" style={{ color: chartColor }} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white/90">{title}</p>
                                <p className="text-xs text-muted-foreground">{subtitle}</p>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>

                    {/* Chart */}
                    <div className="flex-1 flex items-center justify-center">
                        {renderChart()}
                    </div>

                    {/* Value */}
                    <div className="mt-3 text-center">
                        <span className="text-2xl font-bold" style={{ color: chartColor }}>{value}</span>
                    </div>
                </div>
            </motion.div>
        </Link>
    );
};

export default StakingCard;
